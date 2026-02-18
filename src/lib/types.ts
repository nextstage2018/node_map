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

// ===== Phase 2: タスクボード + AI会話 =====

// タスクの3フェーズ
export type TaskPhase = 'ideation' | 'progress' | 'result';

// タスクのステータス
export type TaskStatus = 'todo' | 'in_progress' | 'done';

// タスクの優先度
export type TaskPriority = 'high' | 'medium' | 'low';

// AI会話メッセージ
export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase: TaskPhase;
}

// タスク
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  phase: TaskPhase;
  // メッセージ起点の場合
  sourceMessageId?: string;
  sourceChannel?: ChannelType;
  // AI会話履歴
  conversations: AiConversationMessage[];
  // 構想フェーズの要約
  ideationSummary?: string;
  // 結果フェーズの要約
  resultSummary?: string;
  // タイムスタンプ
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // メタ情報
  tags: string[];
  assignee?: string;
}

// タスク作成リクエスト
export interface CreateTaskRequest {
  title: string;
  description: string;
  priority: TaskPriority;
  sourceMessageId?: string;
  sourceChannel?: ChannelType;
  tags?: string[];
}

// タスク更新リクエスト
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  phase?: TaskPhase;
  ideationSummary?: string;
  resultSummary?: string;
  tags?: string[];
}

// AI会話リクエスト
export interface TaskAiChatRequest {
  taskId: string;
  message: string;
  phase: TaskPhase;
}

// AI会話レスポンス
export interface TaskAiChatResponse {
  reply: string;
  suggestedPhaseTransition?: TaskPhase; // フェーズ遷移の提案
}

// タスク提案（メッセージからの自動提案）
export interface TaskSuggestion {
  title: string;
  description: string;
  priority: TaskPriority;
  sourceMessageId: string;
  sourceChannel: ChannelType;
  reason: string; // なぜ提案するか
  // ソース元の判断材料
  sourceFrom: string; // 誰から
  sourceDate: string; // いつ（ISO文字列）
  sourceSubject?: string; // 件名
  sourceExcerpt: string; // 元メッセージの抜粋
}

// ===== Phase 3: 設定画面 / API接続 =====

// サービス接続タイプ
export type ServiceType = 'email' | 'slack' | 'chatwork' | 'openai' | 'supabase';

// 接続ステータス
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'testing';

// サービス接続情報
export interface ServiceConnection {
  type: ServiceType;
  status: ConnectionStatus;
  lastTested?: string;
  errorMessage?: string;
}

// Gmail設定
export interface GmailSettings {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

// Slack設定
export interface SlackSettings {
  botToken: string;
  appToken?: string;
  defaultChannel?: string;
}

// Chatwork設定
export interface ChatworkSettings {
  apiToken: string;
  defaultRoomId?: string;
}

// OpenAI設定
export interface OpenAISettings {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

// Supabase設定
export interface SupabaseSettings {
  url: string;
  anonKey: string;
}

// プロフィール設定
export interface ProfileSettings {
  displayName: string;
  email: string;
  timezone: string;
  language: string;
}

// アプリ全体の設定
export interface AppSettings {
  profile: ProfileSettings;
  gmail?: GmailSettings;
  slack?: SlackSettings;
  chatwork?: ChatworkSettings;
  openai?: OpenAISettings;
  supabase?: SupabaseSettings;
  connections: ServiceConnection[];
}

// 設定更新リクエスト
export interface UpdateSettingsRequest {
  service: ServiceType;
  settings: Record<string, string | number | boolean>;
}

// 接続テストレスポンス
export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  latencyMs?: number;
}
