// NodeMap 型定義

// メッセージのソースチャネル
export type ChannelType = 'email' | 'slack' | 'chatwork';

// メッセージのステータス
export type MessageStatus = 'unread' | 'read' | 'replied';

// 統合メッセージの共通型
export interface UnifiedMessage {
  id: string;
  channel: ChannelType;
  channelIcon: string;
  from: {
    name: string;
    address: string; // email address, slack user id, chatwork account id
  };
  to?: {
    name: string;
    address: string;
  }[];
  subject?: string; // email only
  body: string;
  bodyHtml?: string;
  timestamp: string; // ISO 8601
  isRead: boolean;
  status: MessageStatus;
  threadId?: string;
  threadMessages?: ThreadMessage[]; // スレッド内の前後メッセージ
  // Channel-specific metadata
  metadata: {
    // Email
    messageId?: string;
    // Slack
    slackChannel?: string;
    slackChannelName?: string;
    slackTs?: string;
    slackThreadTs?: string;
    // Chatwork
    chatworkRoomId?: string;
    chatworkRoomName?: string;
    chatworkMessageId?: string;
  };
}

// スレッド内の個別メッセージ
export interface ThreadMessage {
  id: string;
  from: {
    name: string;
    address: string;
  };
  body: string;
  timestamp: string;
  isOwn: boolean; // 自分の送信か
}

// 返信リクエスト
export interface ReplyRequest {
  messageId: string;
  channel: ChannelType;
  body: string;
  metadata: UnifiedMessage['metadata'];
}

// AI返信下書きリクエスト
export interface AiDraftRequest {
  originalMessage: UnifiedMessage;
  instruction?: string; // ユーザーからの追加指示（例：「丁寧に断る」）
}

// AI返信下書きレスポンス
export interface AiDraftResponse {
  draft: string;
  suggestions?: string[]; // 代替案
}

// APIレスポンス共通
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// フィルター
export interface InboxFilter {
  channel?: ChannelType | 'all';
  isRead?: boolean;
  searchQuery?: string;
}
