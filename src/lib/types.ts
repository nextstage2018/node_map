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
export type ServiceType = 'email' | 'slack' | 'chatwork' | 'anthropic' | 'supabase';

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

// Anthropic設定
export interface AnthropicSettings {
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

// ===== Admin設定（管理者のみ） =====
export interface AdminSettings {
  gmail?: GmailSettings;
  slack?: SlackSettings;
  chatwork?: ChatworkSettings;
  anthropic?: AnthropicSettings;
  supabase?: SupabaseSettings;
  connections: ServiceConnection[];
}

// ===== 個人認証状態 =====
export type ChannelAuthType = 'email' | 'slack' | 'chatwork';

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'expired';

export interface ChannelAuth {
  channel: ChannelAuthType;
  status: AuthStatus;
  accountName?: string; // 認証済みアカウント名（例: tanaka@company.com）
  accountIcon?: string; // アバターURL
  authenticatedAt?: string;
  expiresAt?: string;
}

export interface UserSettings {
  profile: ProfileSettings;
  channelAuths: ChannelAuth[];
  preferences: UserPreferences;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  emailDigest: 'none' | 'daily' | 'weekly';
  defaultInboxFilter: ChannelType | 'all';
  aiAutoSuggest: boolean;
}

// アプリ全体の設定（後方互換）
export interface AppSettings {
  profile: ProfileSettings;
  gmail?: GmailSettings;
  slack?: SlackSettings;
  chatwork?: ChatworkSettings;
  anthropic?: AnthropicSettings;
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

// ===== Phase 4: データ収集基盤（点・線・面） =====

// 理解度レベル（認知→理解→習熟）
export type UnderstandingLevel = 'recognition' | 'understanding' | 'mastery';

// ノードの種類
export type NodeType = 'keyword' | 'person' | 'project';

// ノード（点）：知識・情報の単位
export interface NodeData {
  id: string;
  label: string;           // キーワード・人名・案件名
  type: NodeType;
  userId: string;           // このノードの所有ユーザー
  frequency: number;        // 頻出度（触れた回数）
  understandingLevel: UnderstandingLevel;
  // 出現コンテキスト
  firstSeenAt: string;      // 初めて触れた日時
  lastSeenAt: string;       // 最後に触れた日時
  sourceContexts: NodeSourceContext[]; // どこで出現したか
  createdAt: string;
  updatedAt: string;
}

// ノードの出現コンテキスト
export interface NodeSourceContext {
  sourceType: 'message' | 'task_conversation' | 'task_ideation' | 'task_result';
  sourceId: string;         // メッセージIDまたはタスクID
  direction: 'received' | 'sent' | 'self'; // 受信/送信/自分のメモ
  phase?: TaskPhase;        // タスク会話の場合のフェーズ
  timestamp: string;
}

// エッジ（線）：ノード間の思考のつながり
export interface EdgeData {
  id: string;
  sourceNodeId: string;     // 始点ノード
  targetNodeId: string;     // 終点ノード
  userId: string;
  weight: number;           // 線の太さ（共起頻度）
  taskIds: string[];        // 関連するタスクID群
  edgeType: 'co_occurrence' | 'causal' | 'sequence'; // 共起/因果/順序
  createdAt: string;
  updatedAt: string;
}

// クラスター（面）：タスクに対する認識範囲
export interface ClusterData {
  id: string;
  taskId: string;           // 対応するタスク
  userId: string;
  clusterType: 'ideation' | 'result'; // 構想面 or 結果面
  nodeIds: string[];        // 含まれるノードID群
  summary?: string;         // AIによる要約
  createdAt: string;
}

// 面の差分データ
export interface ClusterDiff {
  taskId: string;
  userId: string;
  ideationNodeIds: string[];
  resultNodeIds: string[];
  addedNodeIds: string[];   // 結果にあって構想になかったノード
  removedNodeIds: string[]; // 構想にあって結果になかったノード
  discoveredOnPath: string[]; // 経路上で発見されたノード
}

// キーワード抽出リクエスト
export interface KeywordExtractionRequest {
  text: string;
  sourceType: NodeSourceContext['sourceType'];
  sourceId: string;
  direction: NodeSourceContext['direction'];
  userId: string;
  phase?: TaskPhase;
}

// キーワード抽出レスポンス
export interface KeywordExtractionResponse {
  keywords: ExtractedKeyword[];
  persons: ExtractedKeyword[];
  projects: ExtractedKeyword[];
}

// 抽出されたキーワード
export interface ExtractedKeyword {
  label: string;
  type: NodeType;
  confidence: number;       // 信頼度 0.0〜1.0
}

// ノードマップ全体ビュー（Phase 5 UI用の事前定義）
export interface NodeMapView {
  nodes: NodeData[];
  edges: EdgeData[];
  clusters: ClusterData[];
  selectedTaskId?: string;
}

// ノード取得フィルター
export interface NodeFilter {
  userId?: string;
  type?: NodeType;
  understandingLevel?: UnderstandingLevel;
  minFrequency?: number;
  searchQuery?: string;
}
