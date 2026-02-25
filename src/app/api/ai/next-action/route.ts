import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { NextActionRequest, NextActionResponse, NextActionSuggestion } from '@/lib/types';

/**
 * ネクストアクションサジェストAPI
 * POST /api/ai/next-action
 * 現在のコンテキストに基づいて次のアクションを提案
 */
export async function POST(request: NextRequest) {
  try {
    // 認証確認
    await getServerUserId();
    const body: NextActionRequest = await request.json();
    const { context, currentItemId, currentItemType } = body;

    if (!context) {
      return NextResponse.json(
        { success: false, error: 'context は必須パラメータです' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      // デモモード
      const result = getDemoNextActions(context, currentItemId, currentItemType);
      return NextResponse.json({ success: true, data: result });
    }

    // Anthropic APIで分析
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const contextLabels: Record<string, string> = {
        inbox: 'インボックス（メッセージ一覧）',
        task: 'タスクボード',
        nodemap: '思考マップ（ナレッジ）',
      };

      const systemPrompt = `あなたはビジネスアシスタントです。ユーザーが現在閲覧しているページのコンテキストに基づいて、次に取るべきアクションを提案してください。

以下のルールに従ってください：
- 提案は3〜5個
- 各提案にはid（ユニークなUUID形式の文字列）、action（アクション名）、description（説明）、type（reply/create_task/add_node/follow_upのいずれか）を含める
- アクション名と説明は日本語
- コンテキストに合った実用的な提案をする
- 必ず以下のJSON形式のみで返してください（前置きや説明は不要）：
{
  "suggestions": [
    {"id": "...", "action": "...", "description": "...", "type": "reply"}
  ]
}`;

      const userPrompt = `現在のコンテキスト: ${contextLabels[context] || context}
${currentItemId ? `閲覧中のアイテムID: ${currentItemId}` : ''}
${currentItemType ? `アイテム種別: ${currentItemType}` : ''}

このコンテキストで次にやるべきアクションを提案してください。`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

      // JSONをパース
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: NextActionResponse = {
          suggestions: (parsed.suggestions || []).slice(0, 5),
        };
        return NextResponse.json({ success: true, data: result });
      }

      // パース失敗時はデモフォールバック
      const fallback = getDemoNextActions(context, currentItemId, currentItemType);
      return NextResponse.json({ success: true, data: fallback });
    } catch (aiError) {
      console.error('ネクストアクションAIエラー（フォールバック使用）:', aiError);
      const fallback = getDemoNextActions(context, currentItemId, currentItemType);
      return NextResponse.json({ success: true, data: fallback });
    }
  } catch (error) {
    console.error('ネクストアクションエラー:', error);
    return NextResponse.json(
      { success: false, error: 'ネクストアクションの分析に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * デモモード用のネクストアクション
 */
function getDemoNextActions(
  context: string,
  _currentItemId?: string,
  _currentItemType?: string
): NextActionResponse {
  const contextSuggestions: Record<string, NextActionSuggestion[]> = {
    inbox: [
      {
        id: 'na-inbox-1',
        action: '未読メッセージに返信する',
        description: '重要な未読メッセージがあります。優先度の高いものから返信しましょう。',
        type: 'reply',
      },
      {
        id: 'na-inbox-2',
        action: 'メッセージからタスクを作成する',
        description: '対応が必要なメッセージをタスクとして管理しましょう。',
        type: 'create_task',
      },
      {
        id: 'na-inbox-3',
        action: 'フォローアップを設定する',
        description: '返信待ちのメッセージにフォローアップリマインダーを設定しましょう。',
        type: 'follow_up',
      },
    ],
    task: [
      {
        id: 'na-task-1',
        action: '進行中タスクの構想を整理する',
        description: 'タスクのゴールと現状のギャップを確認しましょう。',
        type: 'create_task',
      },
      {
        id: 'na-task-2',
        action: 'タスクの関連ノードを追加する',
        description: 'タスクに関連するキーワードを思考マップに追加しましょう。',
        type: 'add_node',
      },
      {
        id: 'na-task-3',
        action: '完了タスクの結果をまとめる',
        description: '完了したタスクの学びを整理して次に活かしましょう。',
        type: 'follow_up',
      },
    ],
    nodemap: [
      {
        id: 'na-map-1',
        action: '孤立ノードを関連付ける',
        description: '他のノードと繋がっていないノードがあります。関連性を確認しましょう。',
        type: 'add_node',
      },
      {
        id: 'na-map-2',
        action: '新しいキーワードを追加する',
        description: '最近の業務で出てきた新しいキーワードを追加しましょう。',
        type: 'add_node',
      },
      {
        id: 'na-map-3',
        action: '関連タスクを確認する',
        description: 'ノードに紐づくタスクの進捗を確認しましょう。',
        type: 'follow_up',
      },
    ],
  };

  return {
    suggestions: contextSuggestions[context] || contextSuggestions.inbox,
  };
}
