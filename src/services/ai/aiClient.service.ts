import { UnifiedMessage, AiDraftResponse } from '@/lib/types';

/**
 * AI連携サービス
 * OpenAI APIを使用して返信下書き等を生成する
 */

function getApiKey(): string {
  return process.env.OPENAI_API_KEY || '';
}

/**
 * メッセージに対するAI返信下書きを生成
 */
export async function generateReplyDraft(
  message: UnifiedMessage,
  instruction?: string
): Promise<AiDraftResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoDraft(message, instruction);
  }

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const systemPrompt = `あなたはビジネスメッセージの返信を下書きするアシスタントです。
以下のルールに従ってください：
- 日本のビジネスマナーに沿った丁寧な文面
- 簡潔かつ要点を押さえた内容
- 元のメッセージの文脈を踏まえた返信
- チャネルに応じた適切なトーン（メール=フォーマル、Slack=やや柔軟、Chatwork=標準）`;

    const userPrompt = `以下のメッセージに対する返信を下書きしてください。

【チャネル】${message.channel}
【送信者】${message.from.name}
【件名】${message.subject || 'なし'}
【本文】
${message.body}

${instruction ? `【追加指示】${instruction}` : ''}

返信文のみを出力してください（「以下は返信案です」などの前置きは不要です）。`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const draft = response.choices[0]?.message?.content || '';

    return {
      draft,
      suggestions: ['より丁寧に', 'より簡潔に', '日程を提案'],
    };
  } catch (error) {
    console.error('AI下書き生成エラー:', error);
    return getDemoDraft(message, instruction);
  }
}

/**
 * デモ用AI下書き
 */
function getDemoDraft(message: UnifiedMessage, instruction?: string): AiDraftResponse {
  const senderName = message.from.name;

  const drafts: Record<string, string> = {
    email: `${senderName}様

お疲れ様です。
ご連絡ありがとうございます。

内容、承知いたしました。
確認の上、改めてご連絡させていただきます。

何卒よろしくお願いいたします。`,

    slack: `${senderName}さん
ありがとうございます！確認しました。
対応しますので少々お待ちください。`,

    chatwork: `${senderName}さん
ご連絡ありがとうございます。
内容確認いたしました。対応いたします。`,
  };

  return {
    draft: drafts[message.channel] || drafts.email,
    suggestions: ['より丁寧に', 'より簡潔に', '日程を提案'],
  };
}
