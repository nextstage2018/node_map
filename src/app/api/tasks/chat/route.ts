import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { generateTaskChat, generateTaskSummary } from '@/services/ai/aiClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { ClusterService } from '@/services/nodemap/clusterClient.service';
import { TaskAiChatRequest, NodeData } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

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

    // タスク取得
    const task = await TaskService.getTask(body.taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // AI応答を生成（Phase 17: タグ分類も同時実行）
    const response = await generateTaskChat(
      task,
      body.message,
      body.phase,
      task.conversations
    );

    // ユーザーメッセージを保存（Phase 17: conversationTag付与）
    await TaskService.addConversation(body.taskId, {
      role: 'user',
      content: body.message,
      phase: body.phase,
      conversationTag: response.conversationTag,
    });

    // AI応答を保存
    await TaskService.addConversation(body.taskId, {
      role: 'assistant',
      content: response.reply,
      phase: body.phase,
    });

    // 【Phase 4】会話内容からキーワードを抽出してノードに蓄積
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

    const task = await TaskService.getTask(body.taskId);
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
