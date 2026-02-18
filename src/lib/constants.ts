// NodeMap 定数定義

export const CHANNEL_CONFIG = {
  email: {
    label: 'Gmail',
    icon: '/icons/gmail.svg',
    color: '#EA4335',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
  slack: {
    label: 'Slack',
    icon: '/icons/slack.svg',
    color: '#4A154B',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  chatwork: {
    label: 'Chatwork',
    icon: '/icons/chatwork.svg',
    color: '#DE5246',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
} as const;

// メッセージステータスの表示設定
export const STATUS_CONFIG = {
  unread: {
    label: '未読',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  read: {
    label: '既読',
    dotColor: 'bg-gray-300',
    textColor: 'text-gray-400',
    bgColor: 'bg-gray-50',
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

// ===== Phase 2: タスク関連定数 =====

export const TASK_STATUS_CONFIG = {
  todo: {
    label: '未着手',
    color: 'bg-gray-100 text-gray-700',
    dotColor: 'bg-gray-400',
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
    color: 'bg-gray-50 text-gray-500 border border-gray-200',
    badgeColor: 'bg-gray-400 text-white',
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
    icon: '🔄',
    color: 'bg-blue-100 text-blue-700',
  },
  result: {
    label: '結果',
    description: 'アウトプットをまとめて完了',
    icon: '✅',
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
    icon: '📧',
    color: 'bg-red-50 text-red-700 border-red-200',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text' as const, placeholder: 'Google Cloud Console で取得', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password' as const, placeholder: '●●●●●●●●', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password' as const, placeholder: 'OAuth2認証で取得', required: true },
    ],
  },
  slack: {
    label: 'Slack',
    description: 'Slackワークスペース連携',
    icon: '💬',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password' as const, placeholder: 'xoxb-xxxx', required: true },
      { key: 'appToken', label: 'App Token（任意）', type: 'password' as const, placeholder: 'xapp-xxxx', required: false },
      { key: 'defaultChannel', label: 'デフォルトチャネル', type: 'text' as const, placeholder: '#general', required: false },
    ],
  },
  chatwork: {
    label: 'Chatwork',
    description: 'Chatworkアカウント連携',
    icon: '🗨️',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    fields: [
      { key: 'apiToken', label: 'APIトークン', type: 'password' as const, placeholder: 'Chatwork設定から取得', required: true },
      { key: 'defaultRoomId', label: 'デフォルトルームID（任意）', type: 'text' as const, placeholder: '123456789', required: false },
    ],
  },
  openai: {
    label: 'OpenAI',
    description: 'AI機能（返信下書き・タスク会話）',
    icon: '🤖',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    fields: [
      { key: 'apiKey', label: 'APIキー', type: 'password' as const, placeholder: 'sk-xxxx', required: true },
      { key: 'model', label: 'モデル', type: 'select' as const, placeholder: '', required: true, options: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
    ],
  },
  supabase: {
    label: 'Supabase',
    description: 'データベース・認証',
    icon: '🗄️',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
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
    color: 'bg-gray-100 text-gray-500',
    dotColor: 'bg-gray-300',
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

export const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini（推奨・低コスト）' },
  { value: 'gpt-4o', label: 'GPT-4o（高精度）' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo（バランス）' },
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
    color: 'bg-gray-100 text-gray-500',
    dotColor: 'bg-gray-300',
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
    icon: '📧',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Googleアカウントで認証',
  },
  slack: {
    label: 'Slack',
    description: 'Slackワークスペースにサインインして、メッセージを取得します',
    icon: '💬',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Slackにサインイン',
  },
  chatwork: {
    label: 'Chatwork',
    description: 'Chatworkアカウントでログインして、メッセージを取得します',
    icon: '🗨️',
    authMethod: 'OAuth 2.0',
    authButtonLabel: 'Chatworkにログイン',
  },
} as const;

export const EMAIL_DIGEST_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekly', label: '毎週' },
] as const;

// 進行フェーズのクイックアクション
export const PROGRESS_QUICK_ACTIONS = [
  { label: '要点を整理', prompt: 'ここまでの会話の要点を箇条書きで整理してください。' },
  { label: '次のステップ', prompt: '現時点での情報を踏まえて、次にやるべきことを提案してください。' },
  { label: '懸念点チェック', prompt: '構想メモの「気になる点」に照らして、見落としがないか確認してください。' },
  { label: '進捗まとめ', prompt: 'ここまでの進捗を構想メモのゴールに対してどの程度達成しているか評価してください。' },
] as const;
