// v4.3: チャネルボット — intent分類（6種）
// Slack/Chatworkのメンションメッセージを分類

export type BotIntent =
  | 'bot_issues'
  | 'bot_decisions'
  | 'bot_tasks'
  | 'bot_agenda'
  | 'bot_summary'
  | 'bot_help'
  | 'bot_menu';

interface IntentRule {
  intent: BotIntent;
  keywords: string[];
}

// タスク作成依頼を検知（isTaskRequestと同等のロジック）
// これに該当する場合はbot_tasksではなく作成誘導メッセージを返す
const TASK_CREATE_PATTERNS = [
  /タスク.{0,3}(登録|作成|追加|入れ|いれ)/,
  /(登録|作成|追加).{0,3}タスク/,
  /タスク.{0,5}(して|する|お願い|頼む|頼み)/,
  /タスクにして/, /タスク化して/, /タスクにする/, /タスク化する/,
];

export function isTaskCreateRequest(text: string): boolean {
  return TASK_CREATE_PATTERNS.some(p => p.test(text));
}

// キーワード一致で先にマッチしたものが勝つ（classifyIntentと同じ方式）
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'bot_issues',
    keywords: ['課題', '未確定', '未解決', '懸念', '問題点', 'issues', 'open issues', '停滞'],
  },
  {
    intent: 'bot_decisions',
    keywords: ['決定', '決まった', '意思決定', '決議', 'decisions', '合意', '承認'],
  },
  {
    intent: 'bot_tasks',
    keywords: ['タスク状況', 'タスク一覧', '進捗', '進行状況', 'task status', 'progress', '担当タスク'],
  },
  {
    intent: 'bot_agenda',
    keywords: ['アジェンダ', '次の会議', '議題', '次回', 'agenda', '予定', '会議'],
  },
  {
    intent: 'bot_summary',
    keywords: ['まとめ', 'サマリー', '要約', '今週', '先週', 'summary', 'レポート', '成果', '振り返り'],
  },
  {
    intent: 'bot_menu',
    keywords: ['メニュー', 'menu', '一覧', 'リスト'],
  },
  {
    intent: 'bot_help',
    keywords: ['ヘルプ', 'help', '使い方', '何ができる', 'できること', 'コマンド'],
  },
];

// 番号→intent変換（メニューの番号選択用）
// ※ relationship_typeで公開範囲が変わるため、全件のマッピングを持つ
// internal: 1=issues, 2=decisions, 3=tasks, 4=agenda, 5=summary
// client/partner: 1=decisions, 2=tasks, 3=agenda, 4=summary（issuesが除外される）
const NUMBER_INTENT_MAP_INTERNAL: Record<string, BotIntent> = {
  '1': 'bot_issues',
  '2': 'bot_decisions',
  '3': 'bot_tasks',
  '4': 'bot_agenda',
  '5': 'bot_summary',
};

const NUMBER_INTENT_MAP_EXTERNAL: Record<string, BotIntent> = {
  '1': 'bot_decisions',
  '2': 'bot_tasks',
  '3': 'bot_agenda',
  '4': 'bot_summary',
};

/**
 * 番号入力からintentを解決
 * @param text クリーン済みテキスト
 * @param isInternal 社内チャネルかどうか
 * @returns BotIntent or null（番号入力でない場合）
 */
export function resolveNumberIntent(text: string, isInternal: boolean): BotIntent | null {
  const trimmed = text.trim();
  const map = isInternal ? NUMBER_INTENT_MAP_INTERNAL : NUMBER_INTENT_MAP_EXTERNAL;
  return map[trimmed] || null;
}

/**
 * メンションメッセージのintentを分類
 * @param text メッセージテキスト（メンション部分は除去済み）
 */
export function classifyBotIntent(text: string): BotIntent {
  const lower = text.toLowerCase().trim();

  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return rule.intent;
      }
    }
  }

  // デフォルト: ヘルプ
  return 'bot_help';
}

/**
 * Slackメンションからテキスト部分を抽出
 * "<@U1234567> 課題を教えて" → "課題を教えて"
 */
export function extractSlackMentionText(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

/**
 * Chatworkメンションからテキスト部分を抽出
 * "[To:12345]NodeMap\n課題を教えて" → "課題を教えて"
 */
export function extractChatworkMentionText(text: string): string {
  return text
    .replace(/\[To:\d+\][^\n]*/g, '')
    .replace(/\[rp aid=\d+ to=\d+-\d+\]/g, '')
    .trim();
}
