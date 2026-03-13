// V2-D: 会議録AI解析エンドポイント
// 会議録テキストをAIに送り、要約・検討ツリー素材・マイルストーンフィードバックを同時抽出
// V2-G: milestone_feedbackから自動学習抽出を追加
// v3.4: open_issues / decision_log コンテキスト注入 + 自動検出・自動クローズ
// v4.0-Phase5: goal_suggestions（ゴール/MS/タスク階層一括提案）を追加
// v7.0: パイプライン完了後にチャネル自動投稿（サマリー + 決定事項 + 未確定事項 + タスク提案）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { extractLearningsFromMeetingFeedback } from '@/lib/services/evaluationLearning.service';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';
import { matchContactByName } from '@/services/businessLog/taskSuggestion.service';
import { getOpenIssuesForContext, processAIOpenIssues } from '@/services/v34/openIssues.service';
import { getRecentDecisionsForContext, processAIDecisions } from '@/services/v34/decisionLog.service';
import { getSuggestionLearningContext } from '@/services/v4/suggestionLearning.service';
import type { AIDetectedOpenIssue, AIResolvedIssue } from '@/services/v34/openIssues.service';
import type { AIDetectedDecision } from '@/services/v34/decisionLog.service';

export const dynamic = 'force-dynamic';

interface AnalysisTopic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface MilestoneFeedback {
  milestone_title: string;
  human_judgment: string;
  reasoning: string;
}

interface ActionItem {
  title: string;
  assignee: string;
  context: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  related_topics: string[];
}

// v4.0-Phase5: ゴール提案の型定義
interface GoalSuggestionTask {
  title: string;
  assignee_hint: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
}

interface GoalSuggestionMilestone {
  title: string;
  target_date: string | null;
  tasks: GoalSuggestionTask[];
}

interface GoalSuggestion {
  title: string;
  description: string;
  milestones: GoalSuggestionMilestone[];
}

interface AnalysisResult {
  summary: string;
  topics: AnalysisTopic[];
  milestone_feedback: MilestoneFeedback[] | null;
  action_items: ActionItem[];
  // v3.4: 未確定事項・決定事項の自動検出
  new_open_issues: AIDetectedOpenIssue[];
  resolved_issues: AIResolvedIssue[];
  new_decisions: AIDetectedDecision[];
  // v4.0-Phase5: ゴール/MS/タスク階層一括提案
  goal_suggestions: GoalSuggestion[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id } = await params;

    // 1. 会議録を取得
    const { data: record, error: fetchError } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !record) {
      console.error('[MeetingRecords Analyze] 取得エラー:', fetchError);
      return NextResponse.json({ success: false, error: '会議録が見つかりません' }, { status: 404 });
    }

    // 2. v3.4: プロジェクトコンテキスト取得（open_issues + decision_log + tasks）
    let contextBlock = '';
    try {
      const [openIssues, recentDecisions, inProgressTasks] = await Promise.all([
        getOpenIssuesForContext(record.project_id, 20),
        getRecentDecisionsForContext(record.project_id, 10),
        (async () => {
          const { data } = await supabase
            .from('tasks')
            .select('id, title, status, due_date')
            .eq('project_id', record.project_id)
            .eq('status', 'in_progress')
            .order('due_date', { ascending: true })
            .limit(15);
          return data || [];
        })(),
      ]);

      if (openIssues.length > 0) {
        contextBlock += `\n\n## このプロジェクトの未確定事項（${openIssues.length}件）\n`;
        openIssues.forEach((issue, i) => {
          contextBlock += `${i + 1}. 「${issue.title}」（${issue.status}、滞留${issue.days_stagnant}日、優先度: ${issue.priority_level}）\n`;
          if (issue.description) contextBlock += `   補足: ${issue.description}\n`;
        });
      }

      if (recentDecisions.length > 0) {
        contextBlock += `\n\n## このプロジェクトの直近の決定事項（${recentDecisions.length}件）\n`;
        recentDecisions.forEach((dec, i) => {
          contextBlock += `${i + 1}. 「${dec.title}」: ${dec.decision_content}（${dec.created_at.slice(0, 10)}）\n`;
        });
      }

      if (inProgressTasks.length > 0) {
        contextBlock += `\n\n## 進行中タスク（${inProgressTasks.length}件）\n`;
        inProgressTasks.forEach((task: { title: string; due_date: string | null }, i: number) => {
          contextBlock += `${i + 1}. ${task.title}${task.due_date ? `（期限: ${task.due_date}）` : ''}\n`;
        });
      }

      // v4.0: タスク提案の採択傾向を注入
      try {
        const learningCtx = await getSuggestionLearningContext(userId);
        if (learningCtx) {
          contextBlock += `\n\n## ユーザーのタスク採択傾向\n${learningCtx.contextText}`;
          console.log(`[MeetingRecords Analyze] 学習コンテキスト注入: 承認率${Math.round(learningCtx.acceptanceRate * 100)}%`);
        }
      } catch (learningError) {
        console.error('[MeetingRecords Analyze] 学習コンテキスト取得エラー:', learningError);
      }

      if (contextBlock) {
        console.log(`[MeetingRecords Analyze] v3.4コンテキスト注入: open_issues=${openIssues.length}, decisions=${recentDecisions.length}, tasks=${inProgressTasks.length}`);
      }
    } catch (contextError) {
      // コンテキスト取得失敗しても解析は続行
      console.error('[MeetingRecords Analyze] v3.4コンテキスト取得エラー:', contextError);
    }

    // 3. 解析の実行
    // v6.0: source_type='gemini' の場合はGeminiパーサー（AI不要）を使用
    // それ以外（text/file/transcription/meetgeek）はClaude AI解析を維持
    let analysisResult: AnalysisResult;

    if (record.source_type === 'gemini') {
      // ---- v6.0: Geminiパーサー（テキストパースのみ、AI不要） ----
      console.log('[MeetingRecords Analyze] Geminiパーサーモードで解析');
      try {
        const { parseGeminiNotes } = await import('@/services/gemini/geminiParser.service');
        const geminiResult = parseGeminiNotes(record.content || '');
        analysisResult = {
          summary: geminiResult.summary,
          topics: geminiResult.topics,
          milestone_feedback: geminiResult.milestone_feedback,
          action_items: geminiResult.action_items,
          new_open_issues: geminiResult.new_open_issues,
          resolved_issues: geminiResult.resolved_issues,
          new_decisions: geminiResult.new_decisions,
          goal_suggestions: geminiResult.goal_suggestions as GoalSuggestion[],
        };
      } catch (parseError) {
        console.error('[MeetingRecords Analyze] Geminiパーサーエラー:', parseError);
        analysisResult = {
          summary: '',
          topics: [],
          milestone_feedback: null,
          action_items: [],
          new_open_issues: [],
          resolved_issues: [],
          new_decisions: [],
          goal_suggestions: [],
        };
      }
    } else {
      // ---- 従来: Claude AI解析（MeetGeek/手動テキスト等） ----
      // MeetGeekの文字起こしで "こ れ は テ ス ト" のようにスペースが入る問題を修正
      const cleanJapaneseSpaces = (text: string): string => {
        return text.replace(
          /([\u3000-\u9FFF\uF900-\uFAFF])\s+([\u3000-\u9FFF\uF900-\uFAFF])/g,
          '$1$2'
        ).replace(
          /([\u3000-\u9FFF\uF900-\uFAFF])\s+([\u3000-\u9FFF\uF900-\uFAFF])/g,
          '$1$2'
        );
      };
      const cleanedContent = cleanJapaneseSpaces(record.content || '');

      try {
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 12000,
          system: `あなたは会議録を構造化するアシスタントです。以下の会議録から情報を抽出してください。
${contextBlock ? `\n【重要】以下はこのプロジェクトの過去の文脈です。会議内容と照らし合わせて分析してください。${contextBlock}` : ''}

必ず以下のJSON形式で返してください（JSONのみ、他のテキストは不要）:
{
  "summary": "会議の要点を200-400文字で要約したテキスト",
  "topics": [
    {
      "title": "議題のタイトル",
      "options": ["選択肢1", "選択肢2"],
      "decision": "決定事項（未決定ならnull）",
      "status": "active または completed または cancelled"
    }
  ],
  "milestone_feedback": [
    {
      "milestone_title": "言及されたマイルストーン名",
      "human_judgment": "人間の判定（achieved / partially / missed など）",
      "reasoning": "判定理由"
    }
  ],
  "action_items": [
    {
      "title": "担当者がやるべきことを1文で（動詞で始める）",
      "assignee": "担当者名（不明なら空文字）",
      "context": "このタスクの背景・会議での議論の流れ・判断根拠を200-400文字で整理。後からAIに相談する時の文脈情報として使う",
      "due_date": "YYYY-MM-DD（不明ならnull）",
      "priority": "high または medium または low",
      "related_topics": ["関連する議題のタイトル1", "関連する議題のタイトル2"]
    }
  ],
  "new_open_issues": [
    {
      "title": "結論が出なかった事項のタイトル",
      "description": "何が未確定か、何を決める必要があるか",
      "priority": "low または medium または high または critical"
    }
  ],
  "resolved_issues": [
    {
      "issue_title": "解決された未確定事項のタイトル（上記「未確定事項」リストと一致させる）",
      "resolution_note": "どのように解決されたかの説明"
    }
  ],
  "new_decisions": [
    {
      "title": "決定事項のタイトル",
      "decision_content": "具体的に何が決まったか",
      "rationale": "なぜその決定に至ったか"
    }
  ],
  "goal_suggestions": [
    {
      "title": "ゴール名（フェーズや段階名。例: Phase1: 現状分析）",
      "description": "このゴールの目的・概要",
      "milestones": [
        {
          "title": "マイルストーン名（到達点）",
          "target_date": "YYYY-MM-DD（不明ならnull）",
          "tasks": [
            {
              "title": "具体的な作業名（動詞で始める）",
              "assignee_hint": "担当者名（不明なら空文字）",
              "due_date": "YYYY-MM-DD（不明ならnull）",
              "priority": "high または medium または low"
            }
          ]
        }
      ]
    }
  ]
}

注意:
- topicsは会議で議論された全ての議題を抽出してください
- 決定に至った議題のstatusは "completed"、まだ検討中なら "active"、取り消しなら "cancelled"
- マイルストーンに関する言及がなければ milestone_feedback は null にしてください
- action_itemsは**担当者ごとに1タスクにまとめる**のが原則です。同じ人が複数の関連するアクションを担当する場合は、1つのタスクに集約してください
  - 例: 鈴木さんが「資料作成」「見積もり確認」「報告書送付」を担当 → 1タスクにまとめて、contextに詳細を記載
  - ただし、明らかに独立したテーマのタスクは分けてOK
- contextには会議での議論の流れ・背景・なぜこのタスクが必要になったかを丁寧に整理してください。これはAIに相談する時の文脈情報として後から使われます
- 担当者が会議録の発言者から特定できる場合は必ず設定してください。会議で「○○さんお願い」「○○が対応します」等の発言を見逃さないでください
- 無理に全参加者にタスクを割り当てる必要はありません。タスクが発生した人にだけ割り当ててください
- 曖昧な内容（「検討する」「考えておく」等）はaction_itemsに含めないでください
- action_itemsがなければ空配列にしてください
- new_open_issues: 議論したが結論が出なかった事項を抽出。既存の未確定事項と同じ内容は含めない
- resolved_issues: 上記「未確定事項」リストの中で、今回の会議で結論が出た・解決したものを判定。タイトルは正確に一致させる
- new_decisions: 明確に「こうする」と決まった事項。topicsのdecisionフィールドと対応させる
- 該当なしの項目は空配列にしてください
- goal_suggestions: 会議内容からプロジェクトの段階・フェーズが読み取れる場合にゴール/マイルストーン/タスクの階層構造を提案してください
  - ゴールは時系列のフェーズ（例: Phase1: 現状分析 → Phase2: 戦略策定）で構成
  - 各ゴール配下に1つ以上のマイルストーン（到達点）
  - 各マイルストーン配下に具体的なタスクを配置
  - 期限は会議内容から推定できる場合のみ設定（不明ならnull）
  - 会議内容から階層構造が読み取れない場合は空配列にしてください
- 必ず有効なJSONを返してください`,
          messages: [
            {
              role: 'user',
              content: `会議タイトル: ${record.title}\n会議日: ${record.meeting_date}\n\n会議内容:\n${cleanedContent}`,
            },
          ],
        });

        // レスポンスからJSONを解析
        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
        // JSONブロック抽出（```json ... ``` や 直接JSON）
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('AIレスポンスからJSONを解析できませんでした');
        }
        let jsonStr = jsonMatch[0];

        // JSON修復: 途切れたJSONの閉じ括弧を補完
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          console.warn('[MeetingRecords Analyze] JSON修復を試行中...');
          const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length;
          if (quoteCount % 2 !== 0) jsonStr += '"';
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          jsonStr = jsonStr.replace(/,\s*$/, '');
          for (let i = 0; i < openBrackets - closeBrackets; i++) jsonStr += ']';
          for (let i = 0; i < openBraces - closeBraces; i++) jsonStr += '}';
          try {
            parsed = JSON.parse(jsonStr);
            console.log('[MeetingRecords Analyze] JSON修復成功');
          } catch (repairError) {
            console.error('[MeetingRecords Analyze] JSON修復も失敗:', repairError);
            throw new Error('AIレスポンスのJSON解析に失敗しました（修復不可）');
          }
        }
        analysisResult = {
          ...parsed,
          action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
          new_open_issues: Array.isArray(parsed.new_open_issues) ? parsed.new_open_issues : [],
          resolved_issues: Array.isArray(parsed.resolved_issues) ? parsed.resolved_issues : [],
          new_decisions: Array.isArray(parsed.new_decisions) ? parsed.new_decisions : [],
          goal_suggestions: Array.isArray(parsed.goal_suggestions) ? parsed.goal_suggestions : [],
        } as AnalysisResult;
      } catch (aiError) {
        console.error('[MeetingRecords Analyze] AI解析エラー:', aiError);
        analysisResult = {
          summary: '',
          topics: [],
          milestone_feedback: null,
          action_items: [],
          new_open_issues: [],
          resolved_issues: [],
          new_decisions: [],
          goal_suggestions: [],
        };
      }
    }

    // 4. 会議録を更新（ai_summary + processed フラグ）
    const { data: updatedRecord, error: updateError } = await supabase
      .from('meeting_records')
      .update({
        ai_summary: analysisResult.summary || null,
        processed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[MeetingRecords Analyze] 更新エラー:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    // 5. ビジネスイベント自動登録（重複チェック付き。カラム名は content）
    let businessEventId: string | null = null;
    try {
      // 既存チェック（同一meeting_record_idで既にあれば更新、なければ挿入）
      const { data: existingEvent } = await supabase
        .from('business_events')
        .select('id')
        .eq('meeting_record_id', record.id)
        .limit(1)
        .single();

      if (existingEvent) {
        // 既存あり → 更新
        businessEventId = existingEvent.id;
        await supabase.from('business_events')
          .update({ content: analysisResult.summary || record.title, updated_at: new Date().toISOString() })
          .eq('id', existingEvent.id);
      } else {
        // 新規挿入
        const { data: newEvent, error: eventInsertError } = await supabase.from('business_events').insert({
          user_id: userId,
          project_id: record.project_id,
          event_type: 'meeting',
          title: `会議: ${record.title}`,
          content: analysisResult.summary || record.title,
          event_date: record.meeting_date,
          meeting_record_id: record.id,
          ai_generated: true,
        }).select('id').single();
        if (eventInsertError) {
          console.error('[MeetingRecords Analyze] ビジネスイベント登録エラー:', eventInsertError);
        } else if (newEvent) {
          businessEventId = newEvent.id;
        }
      }
    } catch (eventError) {
      // ビジネスイベント登録失敗してもメイン処理はブロックしない
      console.error('[MeetingRecords Analyze] ビジネスイベント登録例外:', eventError);
    }

    // 6. v3.0: 会議録テキストからナレッジ（キーワード）を自動抽出
    let knowledgeExtracted = 0;
    try {
      const extractResult = await ThoughtNodeService.extractAndLinkFromText({
        text: record.content || '',
        userId,
        sourceType: 'meeting_record',
        sourceId: id,
        projectId: record.project_id,
      });
      knowledgeExtracted = extractResult.linkedCount;
      if (knowledgeExtracted > 0) {
        console.log(`[MeetingRecords Analyze] ${knowledgeExtracted}件のナレッジキーワードを抽出しました`);
      }
    } catch (knowledgeError) {
      // ナレッジ抽出失敗してもメイン処理はブロックしない
      console.error('[MeetingRecords Analyze] ナレッジ抽出エラー:', knowledgeError);
    }

    // 7. V2-G: milestone_feedbackから自動学習抽出
    let learningsInserted = 0;
    if (analysisResult.milestone_feedback && analysisResult.milestone_feedback.length > 0) {
      try {
        learningsInserted = await extractLearningsFromMeetingFeedback(
          record.project_id,
          id,
          analysisResult.milestone_feedback
        );
        if (learningsInserted > 0) {
          console.log(`[MeetingRecords Analyze] ${learningsInserted}件の学習データを抽出しました`);
        }
      } catch (learningError) {
        // 学習抽出失敗してもメイン処理はブロックしない
        console.error('[MeetingRecords Analyze] 学習抽出エラー:', learningError);
      }
    }

    // 8. v3.0: action_items からタスク提案を自動生成 → task_suggestions に保存
    let actionItemsSaved = 0;
    if (analysisResult.action_items && analysisResult.action_items.length > 0) {
      try {
        // 担当者名を contact_persons にマッチング
        const itemsWithContacts = await Promise.all(
          analysisResult.action_items.map(async (item) => {
            let assigneeContactId: string | null = null;
            if (item.assignee) {
              assigneeContactId = await matchContactByName(supabase, userId, item.assignee);
            }
            return {
              title: item.title,
              assignee: item.assignee || '',
              assigneeContactId,
              context: item.context || '',
              due_date: item.due_date || null,
              priority: item.priority || 'medium',
              related_topics: Array.isArray(item.related_topics) ? item.related_topics : (item as Record<string, unknown>).related_topic ? [String((item as Record<string, unknown>).related_topic)] : [],
            };
          })
        );

        const { error: tsError } = await supabase.from('task_suggestions').insert({
          user_id: userId,
          meeting_record_id: id,
          business_event_id: businessEventId,
          suggestions: {
            meetingTitle: record.title,
            meetingDate: record.meeting_date,
            projectId: record.project_id,
            items: itemsWithContacts,
          },
          status: 'pending',
        });
        if (tsError) {
          console.error('[MeetingRecords Analyze] task_suggestions INSERT エラー:', tsError);
        }
        actionItemsSaved = itemsWithContacts.length;
        console.log(`[MeetingRecords Analyze] ${actionItemsSaved}件のアクションアイテムを提案として保存しました`);
      } catch (actionError) {
        // タスク提案保存失敗してもメイン処理はブロックしない
        console.error('[MeetingRecords Analyze] タスク提案保存エラー:', actionError);
      }
    }

    // 9. v3.4: open_issues / decision_log 自動生成・自動クローズ
    let openIssuesCreated = 0;
    let openIssuesResolved = 0;
    let decisionsCreated = 0;
    try {
      // 未確定事項の作成・クローズ
      if (analysisResult.new_open_issues.length > 0 || analysisResult.resolved_issues.length > 0) {
        const issueResult = await processAIOpenIssues(
          record.project_id,
          userId,
          id,
          analysisResult.new_open_issues,
          analysisResult.resolved_issues
        );
        openIssuesCreated = issueResult.created;
        openIssuesResolved = issueResult.resolved;
        if (openIssuesCreated > 0 || openIssuesResolved > 0) {
          console.log(`[MeetingRecords Analyze] v3.4 open_issues: ${openIssuesCreated}件作成, ${openIssuesResolved}件クローズ`);
        }
      }

      // 決定事項の記録
      if (analysisResult.new_decisions.length > 0) {
        decisionsCreated = await processAIDecisions(
          record.project_id,
          userId,
          id,
          analysisResult.new_decisions
        );
        if (decisionsCreated > 0) {
          console.log(`[MeetingRecords Analyze] v3.4 decision_log: ${decisionsCreated}件記録`);
        }
      }
    } catch (v34Error) {
      // v3.4処理失敗してもメイン処理はブロックしない
      console.error('[MeetingRecords Analyze] v3.4処理エラー:', v34Error);
    }

    // 10. v7.0: パイプライン完了後にチャネル自動投稿
    let channelNotified = { slackSent: false, chatworkSent: false };
    try {
      const { notifyMeetingSummaryToChannels } = await import(
        '@/services/v70/meetingSummaryNotifier.service'
      );

      // action_items に assigneeContactId を含むデータを構築
      const actionItemsForNotify = analysisResult.action_items.map((item) => {
        // task_suggestions に保存済みの itemsWithContacts と同等のデータを構築
        return {
          title: item.title,
          assignee: item.assignee || '',
          assigneeContactId: null as string | null, // 下で解決
          context: item.context || '',
          due_date: item.due_date || null,
          priority: item.priority || 'medium' as const,
        };
      });

      // 担当者名→contact_idのマッチング（task_suggestions保存時と同様）
      for (const item of actionItemsForNotify) {
        if (item.assignee) {
          try {
            const contactId = await matchContactByName(supabase, userId, item.assignee);
            item.assigneeContactId = contactId;
          } catch { /* 無視 */ }
        }
      }

      channelNotified = await notifyMeetingSummaryToChannels({
        projectId: record.project_id,
        meetingTitle: record.title,
        meetingDate: record.meeting_date,
        meetingRecordId: id,
        summary: analysisResult.summary || '',
        decisions: analysisResult.new_decisions || [],
        openIssues: analysisResult.new_open_issues || [],
        actionItems: actionItemsForNotify,
        userId,
      });

      if (channelNotified.slackSent || channelNotified.chatworkSent) {
        console.log(`[MeetingRecords Analyze] v7.0 チャネル通知完了: slack=${channelNotified.slackSent}, chatwork=${channelNotified.chatworkSent}`);
      }
    } catch (notifyError) {
      // チャネル通知失敗してもメインパイプラインはブロックしない
      console.error('[MeetingRecords Analyze] v7.0 チャネル通知エラー:', notifyError);
    }

    return NextResponse.json({
      success: true,
      data: {
        record: updatedRecord,
        analysis: analysisResult,
        knowledge_extracted: knowledgeExtracted,
        learnings_inserted: learningsInserted,
        action_items_saved: actionItemsSaved,
        // v3.4
        open_issues_created: openIssuesCreated,
        open_issues_resolved: openIssuesResolved,
        decisions_created: decisionsCreated,
        // v4.0-Phase5
        goal_suggestions_count: analysisResult.goal_suggestions?.length || 0,
        // v7.0
        channel_notified: channelNotified,
      },
    });
  } catch (error) {
    console.error('[MeetingRecords Analyze] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の解析に失敗しました' }, { status: 500 });
  }
}
