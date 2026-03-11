// v4.3 改善: AI によるメンション intent 分類
// キーワードベースでは拾えない自然な会話も正確に分類する
// フォールバック: AI失敗時はキーワードベースに戻る

import Anthropic from '@anthropic-ai/sdk';
import { BotIntent, classifyBotIntent, isTaskCreateRequest as isTaskCreateRequestFn } from './botIntentClassifier.service';

const MODEL = 'claude-haiku-4-5-20251001'; // 高速・低コスト
const MAX_TOKENS = 100;

const SYSTEM_PROMPT = `あなたはビジネスチャットのメンションメッセージを分類するアシスタントです。
メッセージを読んで、以下のカテゴリのうち最も適切な1つを返してください。

カテゴリ:
- task_create: タスクの作成・登録依頼（「これやっておいて」「明日までに準備して」「〇〇を進めたい」等、何かをやるべき指示・依頼・宣言）
- task_status: タスクの状況確認・進捗照会（「タスク状況は？」「何が進んでる？」）
- issues: 未確定事項・課題の確認（「課題は？」「何が決まってない？」）
- decisions: 決定事項の確認（「何が決まった？」「決定事項は？」）
- agenda: 会議アジェンダの確認（「次の会議の議題は？」「アジェンダ教えて」）
- summary: 週次まとめ・サマリー（「今週のまとめ」「振り返り」）
- help: ヘルプ・使い方（「何ができる？」「ヘルプ」）

回答は **カテゴリ名のみ** を1単語で返してください。説明は不要です。

判断に迷ったら:
- 「〜したい」「〜して」「〜を進める」「〜を準備」→ task_create
- 「〜は？」「〜を教えて」「〜の状況」→ 該当する照会カテゴリ
- どれにも当てはまらない → help`;

const INTENT_MAP: Record<string, BotIntent | 'task_create'> = {
  task_create: 'task_create' as any,
  task_status: 'bot_tasks',
  issues: 'bot_issues',
  decisions: 'bot_decisions',
  agenda: 'bot_agenda',
  summary: 'bot_summary',
  help: 'bot_help',
};

export interface AiClassifyResult {
  intent: BotIntent | 'task_create';
  isTaskCreate: boolean;
  source: 'ai' | 'keyword'; // どちらで判定したか
}

/**
 * AI でメンションメッセージの intent を分類
 * AI失敗時はキーワードベースにフォールバック
 */
export async function classifyBotIntentWithAi(text: string): Promise<AiClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // APIキーなし → フォールバック
    return fallbackClassify(text);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return fallbackClassify(text);

    const category = content.text.trim().toLowerCase();
    const mapped = INTENT_MAP[category];

    if (!mapped) {
      console.warn(`[BotAiClassifier] 不明なカテゴリ: "${category}" → フォールバック`);
      return fallbackClassify(text);
    }

    if (category === 'task_create') {
      return { intent: 'task_create' as any, isTaskCreate: true, source: 'ai' };
    }

    return { intent: mapped as BotIntent, isTaskCreate: false, source: 'ai' };
  } catch (err) {
    console.error('[BotAiClassifier] AI分類エラー:', err);
    return fallbackClassify(text);
  }
}

function fallbackClassify(text: string): AiClassifyResult {
  // 既存のキーワードベース判定（トップレベルimportを使用）
  if (isTaskCreateRequestFn(text)) {
    return { intent: 'task_create' as any, isTaskCreate: true, source: 'keyword' };
  }
  const intent = classifyBotIntent(text);
  return { intent, isTaskCreate: false, source: 'keyword' };
}
