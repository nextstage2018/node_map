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
