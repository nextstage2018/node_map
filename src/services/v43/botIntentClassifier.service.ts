// v4.3: チャネルボット — intent分類（6種）
// Slack/Chatworkのメンションメッセージを分類

export type BotIntent =
  | 'bot_issues'
  | 'bot_decisions'
  | 'bot_tasks'
  | 'bot_agenda'
  | 'bot_summary'
  | 'bot_help';

interface IntentRule {
  intent: BotIntent;
  keywords: string[];
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
    keywords: ['タスク', '進捗', '進行', '状況', 'task', 'progress', '作業', '担当', 'todo'],
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
    intent: 'bot_help',
    keywords: ['ヘルプ', 'help', '使い方', '何ができる', 'できること', 'コマンド'],
  },
];

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
