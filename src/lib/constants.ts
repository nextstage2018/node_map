// NodeMap 定数定義（v2: 配色3色統一・アイコン公式ロゴ統一）

// ===== 配色ルール =====
// 基本3色: primary(青) / neutral(グレー) / dark(ネイビー)
// 例外4色: success(緑) / warning(橙) / danger(赤) / info(水色)
// チャネルブランド色はSVGロゴ内のみ（UI背景・テキストには使わない）

export const CHANNEL_CONFIG = {
  email: {
    label: 'Gmail',
    icon: '/icons/gmail.svg',
    color: '#EA4335', // SVGロゴ用のみ
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
  slack: {
    label: 'Slack',
    icon: '/icons/slack.svg',
    color: '#611F69', // SVGロゴ用のみ
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
  chatwork: {
    label: 'Chatwork',
    icon: '/icons/chatwork.svg',
    color: '#C4161C', // SVGロゴ用のみ
    bgColor: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
} as const;

// メッセージステータスの表示設定（例外色: ステータス専用）
export const STATUS_CONFIG = {
  unread: {
    label: '未読',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  read: {
    label: '既読',
    dotColor: 'bg-slate-300',
    textColor: 'text-slate-400',
    bgColor: 'bg-slate-50',
  },
  replied: {
    label: '返信済み',
    dotColor: 'bg-green-500',
    textColor: 'text-green-600',
    bgColor: 'bg-green-50',
  },
} as const;

export const APP_NAME = 'NodeMap';

export const ITEMS_PER_PAGE = 50;

// ===== Phase B: メール休眠化フラグ =====
// EMAIL_ENABLED=false でメール取得・表示を無効化（ソースコードは残す）
// 環境変数 NEXT_PUBLIC_EMAIL_ENABLED=false で無効化、未設定 or true で有効
export const EMAIL_ENABLED = process.env.NEXT_PUBLIC_EMAIL_ENABLED !== 'false';

// インボックスのポーリング間隔（ミリ秒）
export const INBOX_POLL_INTERVAL = 3 * 60 * 1000; // 3分

// ===== Phase A: 共通ルール =====

// 営業時間ルール（全カレンダー・日程調整に適用）
export const BUSINESS_HOURS = {
  weekdayStart: 10,  // 10:00
  weekdayEnd: 19,    // 19:00
} as const;

// ===== Phase C: 日本の祝日判定 =====
// 「国民の祝日に関する法律」に基づく祝日一覧（固定日 + 変動日）
// 毎年の固定祝日
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: '元日' },
  { month: 2, day: 11, name: '建国記念の日' },
  { month: 2, day: 23, name: '天皇誕生日' },
  { month: 4, day: 29, name: '昭和の日' },
  { month: 5, day: 3, name: '憲法記念日' },
  { month: 5, day: 4, name: 'みどりの日' },
  { month: 5, day: 5, name: 'こどもの日' },
  { month: 8, day: 11, name: '山の日' },
  { month: 11, day: 3, name: '文化の日' },
  { month: 11, day: 23, name: '勤労感謝の日' },
];

// ハッピーマンデー制度（第n月曜日の祝日）
const HAPPY_MONDAY_HOLIDAYS: { month: number; week: number; name: string }[] = [
  { month: 1, week: 2, name: '成人の日' },       // 1月第2月曜日
  { month: 7, week: 3, name: '海の日' },         // 7月第3月曜日
  { month: 9, week: 3, name: '敬老の日' },       // 9月第3月曜日
  { month: 10, week: 2, name: 'スポーツの日' },  // 10月第2月曜日
];

/**
 * 指定月の第n月曜日の日付を取得
 */
function getNthMonday(year: number, month: number, n: number): number {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();
  // 最初の月曜日
  const firstMonday = firstDayOfWeek <= 1 ? 1 + (1 - firstDayOfWeek) : 1 + (8 - firstDayOfWeek);
  return firstMonday + (n - 1) * 7;
}

/**
 * 春分日を計算（天文学的な近似式）
 */
function getVernalEquinoxDay(year: number): number {
  if (year >= 2000 && year <= 2099) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
  return 21; // フォールバック
}

/**
 * 秋分日を計算（天文学的な近似式）
 */
function getAutumnalEquinoxDay(year: number): number {
  if (year >= 2000 && year <= 2099) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
  return 23; // フォールバック
}

/**
 * 指定年の全祝日リストを生成（振替休日・国民の休日を含む）
 */
export function getJapaneseHolidays(year: number): { month: number; day: number; name: string }[] {
  const holidays: { month: number; day: number; name: string }[] = [];

  // 1. 固定祝日
  for (const h of FIXED_HOLIDAYS) {
    holidays.push({ ...h });
  }

  // 2. ハッピーマンデー祝日
  for (const h of HAPPY_MONDAY_HOLIDAYS) {
    const day = getNthMonday(year, h.month, h.week);
    holidays.push({ month: h.month, day, name: h.name });
  }

  // 3. 春分の日・秋分の日
  holidays.push({ month: 3, day: getVernalEquinoxDay(year), name: '春分の日' });
  holidays.push({ month: 9, day: getAutumnalEquinoxDay(year), name: '秋分の日' });

  // ソート
  holidays.sort((a, b) => a.month - b.month || a.day - b.day);

  // 4. 振替休日: 祝日が日曜なら翌営業日（次の祝日でない平日）が振替休日
  const holidaySet = new Set(holidays.map(h => `${h.month}-${h.day}`));
  const substitutes: { month: number; day: number; name: string }[] = [];

  for (const h of holidays) {
    const d = new Date(year, h.month - 1, h.day);
    if (d.getDay() === 0) { // 日曜日
      let subDay = h.day + 1;
      while (holidaySet.has(`${h.month}-${subDay}`)) {
        subDay++;
      }
      const subDate = new Date(year, h.month - 1, subDay);
      substitutes.push({
        month: subDate.getMonth() + 1,
        day: subDate.getDate(),
        name: '振替休日',
      });
      holidaySet.add(`${subDate.getMonth() + 1}-${subDate.getDate()}`);
    }
  }

  // 5. 国民の休日: 祝日に挟まれた平日
  for (let i = 0; i < holidays.length - 1; i++) {
    const curr = new Date(year, holidays[i].month - 1, holidays[i].day);
    const next = new Date(year, holidays[i + 1].month - 1, holidays[i + 1].day);
    const diff = (next.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000);
    if (diff === 2) {
      const between = new Date(curr.getTime() + 24 * 60 * 60 * 1000);
      const key = `${between.getMonth() + 1}-${between.getDate()}`;
      if (!holidaySet.has(key) && between.getDay() !== 0 && between.getDay() !== 6) {
        substitutes.push({
          month: between.getMonth() + 1,
          day: between.getDate(),
          name: '国民の休日',
        });
      }
    }
  }

  const allHolidays = [...holidays, ...substitutes];
  allHolidays.sort((a, b) => a.month - b.month || a.day - b.day);
  return allHolidays;
}

/**
 * 指定日が日本の祝日かどうかを判定
 * @param date Date オブジェクト（Asia/Tokyo タイムゾーン前提）
 */
export function isJapaneseHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const holidays = getJapaneseHolidays(year);
  return holidays.some(h => h.month === month && h.day === day);
}

// カレンダー命名ルール
export const CALENDAR_PREFIX = {
  task: '[NM-Task]',
  job: '[NM-Job]',
  meeting: '[NM-Meeting]',
} as const;

// NodeMap予定かどうかを判定するヘルパー
// [NM-Task] / [NM-Job] → 空きとみなす（除外）
// [NM-Meeting] → 実拘束時間（除外しない）
export function isNodeMapEvent(summary: string): boolean {
  return summary.startsWith(CALENDAR_PREFIX.task) || summary.startsWith(CALENDAR_PREFIX.job);
}

// NodeMap会議予定かどうかを判定するヘルパー（v4.1）
// [NM-Meeting] は実拘束時間なので空き判定では除外しない
export function isNodeMapMeetingEvent(summary: string): boolean {
  return summary.startsWith(CALENDAR_PREFIX.meeting);
}

// NodeMap由来の全予定かどうかを判定するヘルパー（v4.1）
// [NM-Task] / [NM-Job] / [NM-Meeting] すべてを含む
export function isAnyNodeMapEvent(summary: string): boolean {
  return (
    summary.startsWith(CALENDAR_PREFIX.task) ||
    summary.startsWith(CALENDAR_PREFIX.job) ||
    summary.startsWith(CALENDAR_PREFIX.meeting)
  );
}

// ===== Phase 2: タスク関連定数 =====

export const TASK_STATUS_CONFIG = {
  proposed: {
    label: '提案',
    color: 'bg-amber-100 text-amber-700',
    dotColor: 'bg-amber-400',
  },
  todo: {
    label: '未着手',
    color: 'bg-slate-100 text-slate-700',
    dotColor: 'bg-slate-400',
  },
  in_progress: {
    label: '進行中',
    color: 'bg-blue-100 text-blue-700',
    dotColor: 'bg-blue-500',
  },
  done: {
    label: '完了',
    color: 'bg-green-100 text-green-700',
    dotColor: 'bg-green-500',
  },
} as const;

export const TASK_PRIORITY_CONFIG = {
  high: {
    label: '高',
    color: 'bg-red-50 text-red-600 border border-red-200',
    badgeColor: 'bg-red-600 text-white',
  },
  medium: {
    label: '中',
    color: 'bg-amber-50 text-amber-600 border border-amber-200',
    badgeColor: 'bg-amber-500 text-white',
  },
  low: {
    label: '低',
    color: 'bg-slate-50 text-slate-500 border border-slate-200',
    badgeColor: 'bg-slate-400 text-white',
  },
} as const;

export const TASK_PHASE_CONFIG = {
  ideation: {
    label: '構想',
    description: 'ゴールイメージと関連要素を整理',
    icon: '💡',
    color: 'bg-amber-100 text-amber-700',
  },
  progress: {
    label: '進行',
    description: '自由に作業・AIと会話',
    icon: '🔧',
    color: 'bg-blue-100 text-blue-700',
  },
  result: {
    label: '結果',
    description: 'アウトプットをまとめて完了',
    icon: '📊',
    color: 'bg-green-100 text-green-700',
  },
} as const;

// 構想フェーズの誘導質問（1〜2問に留める設計）
export const IDEATION_PROMPTS = [
  'このタスクのゴールイメージを教えてください。どんな状態になれば完了ですか？',
  '関連しそうな要素や、気になるポイントはありますか？',
] as const;

// 構想メモのテンプレートフィールド
export const IDEATION_MEMO_FIELDS = [
  { key: 'goal', label: 'ゴール', placeholder: '完了条件・達成イメージ', icon: '🎯' },
  { key: 'content', label: '主な内容', placeholder: 'やるべきこと・作業の範囲', icon: '📝' },
  { key: 'concerns', label: '気になる点', placeholder: 'リスク・不明点・依存事項', icon: '⚠️' },
  { key: 'deadline', label: '期限日', placeholder: 'YYYY-MM-DD', icon: '📅' },
] as const;

// ===== Phase 3: 設定関連定数 =====

export const SERVICE_CONFIG = {
  email: {
    label: 'Gmail',
    description: 'Googleメール連携',
    icon: '/icons/gmail.svg',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text' as const, placeholder: 'Google Cloud Console で取得', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' as const, placeholder: '●●●●●●●●', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password' as const, placeholder: 'OAuth2認証で取得', required: true },
    ],
  },
  slack: {
    label: 'Slack',
    description: 'Slackワークスペース連携',
    icon: '/icons/slack.svg',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password' as const, placeholder: 'xoxb-xxxx', required: true },
      { key: 'appToken', label: 'App Token（任意）', type: 'password' as const, placeholder: 'xapp-xxxx', required: false },
      { key: 'defaultChannel', label: 'デフォルトチャネル', type: 'text' as const, placeholder: '#general', required: false },
    ],
  },
  chatwork: {
    label: 'Chatwork',
    description: 'Chatworkアカウント連携',
    icon: '/icons/chatwork.svg',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    fields: [
      { key: 'apiToken', label: 'APIトークン', type: 'password' as const, placeholder: 'Chatwork設定から取得', required: true },
      { key: 'defaultRoomId', label: 'デフォルトルームID（任意）', type: 'text' as const, placeholder: '123456789', required: false },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    description: 'AI機能（Claude — 返信下書き・タスク会話・キーワード抽出）',
    icon: '/icons/anthropic.svg',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    fields: [
      { key: 'apiKey', label: 'APIキー', type: 'password' as const, placeholder: 'sk-ant-xxxx', required: true },
      { key: 'model', label: 'モデル', type: 'select' as const, placeholder: '', required: true, options: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] },
    ],
  },
  supabase: {
    label: 'Supabase',
    description: 'データベース・認証',
    icon: '/icons/supabase.svg',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    fields: [
      { key: 'url', label: 'Project URL', type: 'text' as const, placeholder: 'https://xxxxx.supabase.co', required: true },
      { key: 'anonKey', label: 'Anon Key', type: 'password' as const, placeholder: 'eyJxxxx', required: true },
    ],
  },
} as const;

export const CONNECTION_STATUS_CONFIG = {
  connected: {
    label: '接続済み',
    color: 'bg-green-100 text-green-700',
    dotColor: 'bg-green-500',
  },
  disconnected: {
    label: '未接続',
    color: 'bg-slate-100 text-slate-500',
    dotColor: 'bg-slate-300',
  },
  error: {
    label: 'エラー',
    color: 'bg-red-100 text-red-700',
    dotColor: 'bg-red-500',
  },
  testing: {
    label: 'テスト中',
    color: 'bg-blue-100 text-blue-700',
    dotColor: 'bg-blue-500',
  },
} as const;

export const CLAUDE_MODELS = [
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5（最高精度）' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5（バランス）' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（高速・低コスト）' },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Tokyo', label: '日本標準時（JST）' },
  { value: 'America/New_York', label: '東部標準時（EST）' },
  { value: 'America/Los_Angeles', label: '太平洋標準時（PST）' },
  { value: 'Europe/London', label: 'グリニッジ標準時（GMT）' },
  { value: 'UTC', label: '協定世界時（UTC）' },
] as const;

export const AUTH_STATUS_CONFIG = {
  authenticated: {
    label: '認証済み',
    color: 'bg-green-100 text-green-700',
    dotColor: 'bg-green-500',
  },
  unauthenticated: {
    label: '未認証',
    color: 'bg-slate-100 text-slate-500',
    dotColor: 'bg-slate-300',
  },
  expired: {
    label: '期限切れ',
    color: 'bg-amber-100 text-amber-700',
    dotColor: 'bg-amber-500',
  },
} as const;

export const CHANNEL_AUTH_CONFIG = {
  email: {
    label: 'Gmail',
    description: 'Googleアカウントでログインして、メールを取得・送信します',
    icon: '/icons/gmail.svg',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Googleアカウントで認証',
  },
  slack: {
    label: 'Slack',
    description: 'Slackワークスペースにサインインして、メッセージを取得します',
    icon: '/icons/slack.svg',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Slackにサインイン',
  },
  chatwork: {
    label: 'Chatwork',
    description: 'Chatworkアカウントでログインして、メッセージを取得します',
    icon: '/icons/chatwork.svg',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Chatworkにログイン',
  },
} as const;

export const EMAIL_DIGEST_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
] as const;

// ===== Phase 7: ジョブ・種ボックス・ビュー切り替え =====

export const JOB_STATUS_CONFIG = {
  draft: {
    label: 'ドラフト',
    color: 'bg-slate-100 text-slate-700',
    dotColor: 'bg-slate-400',
  },
  proposed: {
    label: '提案中',
    color: 'bg-amber-100 text-amber-700',
    dotColor: 'bg-amber-500',
  },
  executed: {
    label: '実行済み',
    color: 'bg-green-100 text-green-700',
    dotColor: 'bg-green-500',
  },
  dismissed: {
    label: '却下',
    color: 'bg-red-100 text-red-700',
    dotColor: 'bg-red-500',
  },
} as const;

export const JOB_TYPE_CONFIG = {
  email_reply: {
    label: 'メール返信',
    icon: '/icons/gmail.svg',
    description: '定型メール返信の自動化',
  },
  document_update: {
    label: 'ドキュメント更新',
    icon: '/icons/memo-content.svg',
    description: 'ドキュメント修正の自動化',
  },
  data_entry: {
    label: 'データ入力',
    icon: '/icons/memo-goal.svg',
    description: 'データ入力作業の自動化',
  },
  routine_admin: {
    label: 'ルーチン管理作業',
    icon: '/icons/nav-settings.svg',
    description: '定期的な管理作業の自動化',
  },
} as const;

export const VIEW_MODE_CONFIG = {
  status: {
    label: 'ステータス',
    description: '何が残っているか（Todo / 進行中 / 完了）',
  },
  timeline: {
    label: 'タイムライン',
    description: '今日何やるか（日付ベース）',
  },
} as const;

// ===== Phase 8: ナレッジマスタ基盤 =====

export const KNOWLEDGE_DOMAIN_CONFIG: Record<string, {
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}> = {
  domain_marketing: {
    name: 'マーケティング',
    description: '集客・ブランド・広告・SEO・SNS',
    color: '#2563EB', // primary blue
    sortOrder: 1,
  },
  domain_development: {
    name: '開発',
    description: 'ソフトウェア・インフラ・アーキテクチャ',
    color: '#16A34A', // green
    sortOrder: 2,
  },
  domain_sales: {
    name: '営業',
    description: '顧客獲得・提案・商談・CRM',
    color: '#D97706', // amber
    sortOrder: 3,
  },
  domain_management: {
    name: '管理',
    description: '経理・人事・法務・総務',
    color: '#9333EA', // purple
    sortOrder: 4,
  },
  domain_planning: {
    name: '企画',
    description: '経営企画・事業計画・新規事業',
    color: '#DC2626', // red
    sortOrder: 5,
  },
} as const;

// ===== Phase 9: 関係値情報基盤 =====

export const RELATIONSHIP_TYPE_CONFIG = {
  internal: {
    label: '自社',
    color: '#2563EB',     // primary blue
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    dotColor: 'bg-blue-500',
  },
  client: {
    label: '取引先',
    color: '#D97706',     // amber
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  partner: {
    label: 'パートナー',
    color: '#9333EA',     // purple
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    dotColor: 'bg-purple-500',
  },
  vendor: {
    label: '仕入先',
    color: '#059669',     // emerald
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  prospect: {
    label: '見込み',
    color: '#0891B2',     // cyan
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-700',
    borderColor: 'border-cyan-200',
    dotColor: 'bg-cyan-500',
  },
} as const;

// Phase 37b: 組織用の関係性マッピング（organizationsテーブル → contact_personsテーブル）
export const ORG_RELATIONSHIP_MAP: Record<string, string> = {
  internal: 'internal',
  client: 'client',
  partner: 'partner',
  vendor: 'partner',
  prospect: 'client',
};

// ===== Phase 10: 思考マップUI改修 =====

// 本流/支流のエッジ表示設定
export const FLOW_TYPE_CONFIG = {
  main: {
    label: '本流',
    color: '#2563EB',        // primary blue
    width: 3,
    dashArray: 'none',       // 実線
    opacity: 0.7,
    arrowSize: 8,
  },
  tributary: {
    label: '支流',
    color: '#CBD5E1',        // slate-300
    width: 1,
    dashArray: '4,4',        // 破線
    opacity: 0.4,
    arrowSize: 4,
  },
} as const;

// ノード表示フィルターモード設定
export const NODE_FILTER_CONFIG = {
  keyword_only: { label: 'キーワードのみ', description: 'キーワード（名詞）のみ表示' },
  with_person: { label: '＋人物', description: 'キーワード＋人物ノードを表示' },
  with_project: { label: '＋プロジェクト', description: 'キーワード＋プロジェクトを表示' },
  all: { label: 'すべて', description: '全ノードを表示' },
} as const;

// 進行フェーズのクイックアクション
export const PROGRESS_QUICK_ACTIONS = [
  { label: '要点を整理', prompt: 'ここまでの会話の要点を箇条書きで整理してください。' },
  { label: '次のステップ', prompt: '現時点での情報を踏まえて、次にやるべきことを提案してください。' },
  { label: '懸念点チェック', prompt: '構想メモの「気になる点」に照らして、見落としがないか確認してください。' },
  { label: '進捗まとめ', prompt: 'ここまでの進捗を構想メモのゴールに対してどの程度達成しているか評価してください。' },
] as const;
