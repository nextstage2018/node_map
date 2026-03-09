import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { generateTaskChat, generateTaskSummary, TaskChatContext } from '@/services/ai/aiClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { ClusterService } from '@/services/nodemap/clusterClient.service';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';
import { TaskAiChatRequest, NodeData } from '@/lib/types';
import { buildPersonalizedContext } from '@/services/ai/personalizedContext.service';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// タスクAI会話
export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const body: TaskAiChatRequest = await request.json();

    if (!body.taskId || !body.message || !body.phase) {
      return NextResponse.json(
        { success: false, error: 'taskId, message, phaseは必須です' },
        { status: 400 }
      );
    }

    // タスク取得（Phase 60: ユーザーID検証付き）
    const task = await TaskService.getTask(body.taskId, userId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // プロジェクト・組織のコンテキストを取得
    let chatContext: TaskChatContext = {};
    if (task.projectId) {
      try {
        const sb = getServerSupabase() || getSupabase();
        if (sb) {
          const { data: project } = await sb
            .from('projects')
            .select('name, description, organization_id, organizations(name, memo)')
            .eq('id', task.projectId)
            .single();
          if (project) {
            chatContext.projectName = project.name;
            chatContext.projectDescription = project.description;
            const org = project.organizations as any;
            if (org) {
              chatContext.organizationName = org.name;
              chatContext.organizationMemo = org.memo;
            }
          }
          // プロジェクトメンバー名を取得
          const { data: members } = await sb
            .from('task_members')
            .select('user_id')
            .eq('task_id', body.taskId);
          if (members && members.length > 0) {
            const userIds = members.map((m: any) => m.user_id);
            const { data: contacts } = await sb
              .from('contact_persons')
              .select('full_name')
              .in('id', userIds);
            if (contacts) {
              chatContext.memberNames = contacts.map((c: any) => c.full_name).filter(Boolean);
            }
          }
        }
      } catch (ctxErr) {
        console.error('[Tasks Chat] コンテキスト取得エラー（続行）:', ctxErr);
      }
    }

    // Phase 61: パーソナライズコンテキスト取得
    try {
      const personalizedCtx = await buildPersonalizedContext(userId);
      if (personalizedCtx) {
        chatContext.personalizedContext = personalizedCtx;
      }
    } catch (e) {
      console.error('[Tasks Chat] パーソナライズ取得エラー（続行）:', e);
    }

    // Phase E: 外部資料コンテキストを取得（タスクに紐づく外部AI成果物等）
    try {
      const sbExt = getServerSupabase() || getSupabase();
      if (sbExt) {
        const { data: extResources } = await sbExt
          .from('task_external_resources')
          .select('title, resource_type, content, source_url, content_length, created_at')
          .eq('task_id', body.taskId)
          .order('created_at', { ascending: true });
        if (extResources && extResources.length > 0) {
          // 各資料の内容を結合（トークン節約のため各資料最大3000文字に制限）
          const MAX_PER_RESOURCE = 3000;
          const resourceTexts = extResources.map((r: any, i: number) => {
            const typeLabel = r.resource_type === 'text' ? 'テキスト' :
              r.resource_type === 'file' ? `ファイル（${r.source_url || r.title}）` :
              `URL（${r.source_url || r.title}）`;
            const truncatedContent = r.content && r.content.length > MAX_PER_RESOURCE
              ? r.content.substring(0, MAX_PER_RESOURCE) + '...(省略)'
              : (r.content || '(内容なし)');
            return `### 資料${i + 1}: ${r.title}（${typeLabel}）\n${truncatedContent}`;
          }).join('\n\n---\n\n');
          chatContext.externalResourcesContext =
            `\n\n## 外部資料（ユーザーがこのタスクに取り込んだ参考資料。壁打ちのコンテキストとして活用すること）\n\n${resourceTexts}`;
        }
      }
    } catch (e) {
      console.error('[Tasks Chat] 外部資料コンテキスト取得エラー（続行）:', e);
    }

    // Phase 61②: 関連する社内相談コンテキストを取得
    try {
      const sb2 = getServerSupabase() || getSupabase();
      if (sb2 && task.projectId) {
        // タスクに関連するジョブ経由の相談結果を取得
        const { data: relatedConsultations } = await sb2
          .from('consultations')
          .select('question, answer, thread_summary, created_at')
          .eq('status', 'answered')
          .not('answer', 'is', null)
          .order('created_at', { ascending: false })
          .limit(3);
        if (relatedConsultations && relatedConsultations.length > 0) {
          const consultTexts = relatedConsultations.map((c: any) =>
            `Q: ${c.question}\nA: ${c.answer}`
          ).join('\n---\n');
          chatContext.personalizedContext = (chatContext.personalizedContext || '') +
            `\n\n## 関連する社内相談結果（参考情報）\n${consultTexts}`;
        }
      }
    } catch (e) {
      console.error('[Tasks Chat] 相談コンテキスト取得エラー（続行）:', e);
    }

    // AI応答を生成（Phase 17: タグ分類も同時実行）
    const response = await generateTaskChat(
      task,
      body.message,
      body.phase,
      task.conversations,
      chatContext
    );

    // Phase 42f残り: 会話ターンIDを生成（会話ジャンプ用）
    const turnId = crypto.randomUUID();

    // ユーザーメッセージを保存（Phase 17: conversationTag付与, Phase 42f残り: turnId付与）
    await TaskService.addConversation(body.taskId, {
      role: 'user',
      content: body.message,
      phase: body.phase,
      conversationTag: response.conversationTag,
      turnId,
    });

    // AI応答を保存
    await TaskService.addConversation(body.taskId, {
      role: 'assistant',
      content: response.reply,
      phase: body.phase,
      turnId,
    });

    // Phase 42a: AI会話からキーワード自動抽出 → ナレッジマスタ登録 → thought_task_nodes紐づけ
    // ※ Vercelではレスポンス後の非同期処理が打ち切られるためawaitで実行
    // Phase 42f残り: conversationId を渡して会話ジャンプを可能にする
    try {
      const thoughtResult = await ThoughtNodeService.extractAndLink({
        text: `${body.message}\n\n${response.reply}`,
        userId,
        taskId: body.taskId,
        milestoneId: task.milestoneId, // V2-H: タスクのmilestone_idを伝播
        phase: body.phase,
        conversationId: turnId,
      });
      if (thoughtResult.linkedNodes.length > 0) {
        console.log(`[Tasks Chat] ${thoughtResult.linkedNodes.length}個のキーワードをナレッジマスタに紐づけ (task=${body.taskId})`);
      }
    } catch (e) {
      console.error('[Tasks Chat] ThoughtNode抽出エラー（応答は正常）:', e);
    }

    // 【Phase 4】会話内容からキーワードを抽出してノードに蓄積（既存の user_nodes への蓄積は維持）
    const sourceType = body.phase === 'ideation' ? 'task_ideation' as const
      : body.phase === 'result' ? 'task_result' as const
      : 'task_conversation' as const;

    // Phase 22: 認証ユーザーIDを使用
    Promise.allSettled([
      NodeService.processText({
        text: body.message,
        sourceType,
        sourceId: body.taskId,
        direction: 'self',
        userId,
        phase: body.phase,
      }),
      NodeService.processText({
        text: response.reply,
        sourceType,
        sourceId: body.taskId,
        direction: 'received',
        userId,
        phase: body.phase,
      }),
    ]).then(async (results) => {
      // 抽出されたノード群から経路エッジを生成
      const allNodes = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => (r as PromiseFulfilledResult<NodeData[]>).value || []);

      if (allNodes.length >= 2) {
        // 進行フェーズ → 順序エッジ（思考経路）
        if (body.phase === 'progress') {
          await EdgeService.createSequenceEdges(allNodes, userId, body.taskId);
        }
        // 構想/結果フェーズ → 共起エッジ + クラスター
        if (body.phase === 'ideation') {
          await EdgeService.createCoOccurrenceEdges(allNodes, userId, body.taskId);
          await ClusterService.buildIdeationCluster(body.taskId, userId, allNodes);
        }
        if (body.phase === 'result') {
          await EdgeService.createCoOccurrenceEdges(allNodes, userId, body.taskId);
          await ClusterService.buildResultCluster(body.taskId, userId, allNodes);
        }
      }
    }).catch(() => {
      // ノード蓄積エラーはチャット応答に影響させない
    });

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('タスクAI会話エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI会話の処理に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク要約生成（結果フェーズ）
export async function PUT(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const body: { taskId: string } = await request.json();

    const task = await TaskService.getTask(body.taskId, userId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    const summary = await generateTaskSummary(task);

    // タスクに要約を保存
    await TaskService.updateTask(body.taskId, { resultSummary: summary });

    // 【Phase 4】要約からキーワードを抽出して結果クラスターを構築
    NodeService.processText({
      text: summary,
      sourceType: 'task_result',
      sourceId: body.taskId,
      direction: 'self',
      userId,
      phase: 'result',
    }).then(async (nodes) => {
      if (nodes.length > 0) {
        await ClusterService.buildResultCluster(body.taskId, userId, nodes);
      }
    }).catch(() => {
      // エラーは要約レスポンスに影響させない
    });

    return NextResponse.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('要約生成エラー:', error);
    return NextResponse.json(
      { success: false, error: '要約の生成に失敗しました' },
      { status: 500 }
    );
  }
}
