// トピック抽出サービス
// チャネルメッセージからトピック（検討事項）を抽出する
// 会議録AI解析と同じ Topic 形式を出力し、検討ツリー統合に使用

import Anthropic from '@anthropic-ai/sdk';

// ========================================
// 型定義（decision-trees/generate の Topic と同じ）
// ========================================

export interface ExtractedTopic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

export interface TopicExtractionResult {
  messageId: string;
  topics: ExtractedTopic[];
}

// ========================================
// メッセージのフィルタリング
// ========================================

/** トピック抽出対象としてふさわしくないメッセージをスキップ */
function shouldSkipMessage(body: string): boolean {
  if (!body || body.trim().length < 50) return true;

  // 挨拶だけのメッセージ
  const greetingPatterns = /^(お疲れ様|おはよう|ありがとう|了解|承知|OK|はい|よろしく)/;
  if (greetingPatterns.test(body.trim())) return true;

  // スタンプ/リアクションだけ
  if (body.trim().startsWith(':') && body.trim().endsWith(':')) return true;

  return false;
}

// ========================================
// AI抽出
// ========================================

/**
 * チャネルメッセージのバッチからトピックを抽出
 * コスト最適化: 複数メッセージをまとめて1回のAPI呼び出しで処理
 */
export async function extractTopicsFromMessages(
  messages: { id: string; subject?: string; body: string; channel?: string }[],
  projectContext?: string
): Promise<TopicExtractionResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[TopicExtractor] ANTHROPIC_API_KEY未設定 → スキップ');
    return [];
  }

  // フィルタリング: 短すぎ・挨拶のみのメッセージを除外
  const validMessages = messages.filter(m => !shouldSkipMessage(m.body));
  if (validMessages.length === 0) return [];

  // バッチサイズ制限（トークン節約）
  const BATCH_SIZE = 5;
  const results: TopicExtractionResult[] = [];

  for (let i = 0; i < validMessages.length; i += BATCH_SIZE) {
    const batch = validMessages.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await extractTopicsBatch(batch, projectContext, apiKey);
      results.push(...batchResults);
    } catch (error) {
      console.error(`[TopicExtractor] バッチ${Math.floor(i / BATCH_SIZE) + 1}処理エラー:`, error);
      // エラーでもバッチ全体はブロックしない → 空結果で続行
    }
  }

  return results;
}

/**
 * 単一バッチのトピック抽出（AI呼び出し）
 */
async function extractTopicsBatch(
  messages: { id: string; subject?: string; body: string; channel?: string }[],
  projectContext: string | undefined,
  apiKey: string
): Promise<TopicExtractionResult[]> {
  const client = new Anthropic({ apiKey });

  // メッセージテキストを構造化
  const messagesText = messages.map((m, idx) => {
    const header = m.subject ? `件名: ${m.subject}` : `メッセージ#${idx + 1}`;
    return `--- [MSG_ID:${m.id}] ${header} ---\n${m.body.slice(0, 500)}`;
  }).join('\n\n');

  const projectHint = projectContext
    ? `\nプロジェクト名: ${projectContext}`
    : '';

  const systemPrompt = `あなたはビジネスメッセージから検討事項（トピック）を抽出するアシスタントです。
以下のチャットメッセージ群から、ビジネス上の意思決定や検討に関わるトピックを抽出してください。${projectHint}

## 抽出ルール
- 日常的な挨拶・確認・雑談は無視してください
- 「〜でいきましょう」「〜に決定」「〜案で進めます」のような意思決定を含むメッセージを重視
- 「〜について検討が必要」「〜をどうするか」のような検討事項も抽出
- 1つのメッセージから複数トピックが抽出される場合もあります
- トピックが見つからないメッセージは結果に含めないでください

## 出力形式（JSON配列のみ、他のテキスト不要）
[
  {
    "message_id": "元のMSG_ID",
    "topics": [
      {
        "title": "トピック名（簡潔に）",
        "options": ["選択肢1", "選択肢2"],
        "decision": "決定事項（未決定ならnull）",
        "status": "active または completed または cancelled"
      }
    ]
  }
]

注意:
- topicsが空のメッセージは配列に含めないでください
- optionsが不明な場合は空配列[]にしてください
- 必ず有効なJSON配列を返してください`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: messagesText,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // JSON配列を抽出
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('[TopicExtractor] AIレスポンスにJSON配列なし → 0件');
      return [];
    }

    const parsed: { message_id: string; topics: ExtractedTopic[] }[] = JSON.parse(jsonMatch[0]);

    // TopicExtractionResult形式に変換
    return parsed
      .filter(item => item.topics && item.topics.length > 0)
      .map(item => ({
        messageId: item.message_id,
        topics: item.topics.map(t => ({
          title: t.title || '',
          options: Array.isArray(t.options) ? t.options : [],
          decision: t.decision || null,
          status: (['active', 'completed', 'cancelled'].includes(t.status) ? t.status : 'active') as ExtractedTopic['status'],
        })),
      }));
  } catch (error) {
    console.error('[TopicExtractor] AI呼び出しエラー:', error);
    return [];
  }
}
