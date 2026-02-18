// NodeMap 定数定義

export const CHANNEL_CONFIG = {
  email: {
    label: 'メール',
    icon: '📧',
    color: '#EA4335',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
  slack: {
    label: 'Slack',
    icon: '💬',
    color: '#4A154B',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  chatwork: {
    label: 'Chatwork',
    icon: '🔵',
    color: '#DE5246',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
} as const;

export const APP_NAME = 'NodeMap';

export const ITEMS_PER_PAGE = 50;
