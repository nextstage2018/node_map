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
    color: 'bg-red-100 text-red-700',
    icon: '🔴',
  },
  medium: {
    label: '中',
    color: 'bg-yellow-100 text-yellow-700',
    icon: '🟡',
  },
  low: {
    label: '低',
    color: 'bg-green-100 text-green-700',
    icon: '🟢',
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
