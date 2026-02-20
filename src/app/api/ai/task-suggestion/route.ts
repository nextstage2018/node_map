import { NextRequest, NextResponse } from 'next/server';

interface TaskSuggestionRequest {
  messageId: string;
  channel: string;
  from: string;
  subject: string;
  body: string;
  timestamp: string;
}

interface TaskSuggestionResult {
  shouldTaskify: boolean;
  reason: string;
  minimalTask: string;
  recommendedTask: string;
}

/**
 * AIがメッセージを分析してタスク化を推奨するかどうか判定
 * POST /api/ai/task-suggestion
 */
export async function POST(request: NextRequest) {
  try {
    const body: TaskSuggestionRequest = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      // デモモード: ルールベースで簡易判定
      const result = getDemoSuggestion(body);
      return NextResponse.json({ success: true, data: result });
    }

    // Anthropic API でAI判定
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

      const systemPrompt = `あなたはビジネスメッセージを分析してタスク化の必要性を判定するアシスタントです。
受信メッセージを分析し、以下のJSONフォーマットで回答してください。

判定基準：
- 期限付きの依頼・要望 → 高い推奨度
- 質問や確認事項 → 中程度の推奨度
- 情報共有・挨拶・CC的な内容 → 推奨しない
- メルマガ・自動通知 → 推奨しない

回答フォーマット（JSONのみ、説明不要）：
{
  "shouldTaskify": true/false,
  "reason": "タスク化を推奨する理由（日本語で1-2文）",
  "minimalTask": "最低限の対応内容（日本語で1文）",
  "recommendedTask": "推奨対応内容（日本語で1-2文）"
}

shouldTaskifyがfalseの場合、他のフィールドは空文字でOKです。`;

      const userPrompt = `以下のメッセージを分析してください：

【チャネル】${body.channel}
【送信者】${body.from}
【件名】${body.subject || 'なし'}
【本文】
${body.body}`;

      const response = await client.messages.create({
        model,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // JSONをパース
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as TaskSuggestionResult;
        return NextResponse.json({ success: true, data: parsed });
      }

      // パース失敗時はデモフォールバック
      const fallback = getDemoSuggestion(body);
      return NextResponse.json({ success: true, data: fallback });
    } catch (aiError) {
      console.error('AI分析エラー（フォールバック使用）:', aiError);
      const fallback = getDemoSuggestion(body);
      return NextResponse.json({ success: true, data: fallback });
    }
  } catch (error) {
    console.error('タスク化提案エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスク化提案の分析に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * デモモード用のルールベース判定
 */
function getDemoSuggestion(body: TaskSuggestionRequest): TaskSuggestionResult {
  const text = `${body.subject} ${body.body}`.toLowerCase();

  // 依頼・期限系キーワード
  const taskKeywords = [
    'お願い', '依頼', 'ください', 'いただけ', '確認', '対応',
    '見積', '提案', '資料', '報告', '送付', '提出',
    '期限', 'まで', '締切', '急ぎ', '至急',
    'レビュー', 'フィードバック', '返答', '回答',
  ];

  // 非タスク系キーワード
  const nonTaskKeywords = [
    'ありがとう', 'お疲れ', '了解', '承知', 'よろしく',
    'newsletter', 'メルマガ', '配信停止', 'unsubscribe',
    'noreply', 'no-reply', '自動通知',
  ];

  const taskScore = taskKeywords.filter(k => text.includes(k)).length;
  const nonTaskScore = nonTaskKeywords.filter(k => text.includes(k)).length;

  if (taskScore >= 2 && nonTaskScore < 2) {
    // 具体的なキーワードからタスク内容を推定
    let minimalTask = 'メッセージの内容を確認して返信する';
    let recommendedTask = 'メッセージの内容を分析し、必要な対応を洗い出して計画的に実行する';
    let reason = `このメッセージには対応が必要なキーワード（${taskKeywords.filter(k => text.includes(k)).slice(0, 3).join('・')}）が含まれています。`;

    if (text.includes('見積') || text.includes('提案')) {
      minimalTask = '見積書または提案資料を作成して送付する';
      recommendedTask = '見積書に加えて、提案理由・費用対効果を添えた提案資料を作成する';
      reason = '見積もりや提案の依頼が含まれています。対応漏れを防ぐためタスク化を推奨します。';
    } else if (text.includes('確認') || text.includes('レビュー')) {
      minimalTask = '内容を確認して結果を報告する';
      recommendedTask = '内容を確認し、改善点や懸念点も含めてフィードバックを返す';
      reason = '確認・レビューの依頼です。期限内に対応するためタスク化を推奨します。';
    } else if (text.includes('資料') || text.includes('報告')) {
      minimalTask = '必要な資料を作成する';
      recommendedTask = '資料の作成に加えて、関連するデータや分析も添えて報告する';
      reason = '資料作成や報告の依頼です。作業時間を確保するためタスク化を推奨します。';
    }

    return {
      shouldTaskify: true,
      reason,
      minimalTask,
      recommendedTask,
    };
  }

  return {
    shouldTaskify: false,
    reason: '',
    minimalTask: '',
    recommendedTask: '',
  };
}
