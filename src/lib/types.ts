// NodeMap 型定義

// メッセージのソースチャネル
export type ChannelType = 'email' | 'slack' | 'chatwork';

// メッセージのステータス
export type MessageStatus = 'unread' | 'read' | 'replied';

// メッセージの方向（送信/受信）
export type MessageDirection = 'received' | 'sent';

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
    cc?: {
          name: string;
          address: string;
    }[];
  subject?: string; // email only
  body: string;
  bodyHtml?: string;
  timestamp: string; // ISO 8601
  isRead: boolean;
  status: MessageStatus;
  direction?: MessageDirection; // Phase 38: 送信/受信の区別
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

// メッセージグループ（同一スレッド/ルーム/チャンネルの統合表示用）
export interface MessageGroup {
  groupKey: string;           // グループ識別子
  channel: ChannelType;
  groupLabel: string;         // 表示名（ルーム名/チャンネル名/件名）
  latestMessage: UnifiedMessage; // 最新メッセージ（一覧のプレビュー用）
  messages: UnifiedMessage[];    // グループ内の全メッセージ（時系列順）
  messageCount: number;
  unreadCount: number;
  latestTimestamp: string;
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

// Phase 17: 会話タグ分類（BugFix①: 型定義追加）
export type ConversationTag =
  | '情報収集'
  | '判断相談'
  | '壁の突破'
  | 'アウトプット生成'
  | '確認・検証'
  | '整理・構造化'
  | 'その他';

// AI会話メッセージ
export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase: TaskPhase;
  conversationTag?: ConversationTag; // Phase 17: 会話タグ
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
  // Phase 7 追加フィールド
  seedId?: string;       // 種ボックス経由で作成された場合の種ID
  dueDate?: string;      // 期限日（タイムラインビュー用、ISO日付）
  // Phase 40c: プロジェクト紐づけ
  projectId?: string;
}

// タスク作成リクエスト
export interface CreateTaskRequest {
  title: string;
  description: string;
  priority: TaskPriority;
  sourceMessageId?: string;
  sourceChannel?: ChannelType;
  tags?: string[];
  seedId?: string;       // Phase 40c: 種から変換時の種ID
  projectId?: string;    // Phase 40c: プロジェクト紐づけ
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
  dueDate?: string;
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
  conversationTag?: ConversationTag; // Phase 17: 会話タグ
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

// ===== Phase 7: ジョブ/タスク分離・種ボックス・表示切り替え =====

// ジョブステータス（AI定型作業の流れ：下書き→提案→実行 or 却下）
export type JobStatus = 'draft' | 'proposed' | 'executed' | 'dismissed';

// ジョブの種別
export type JobType = 'email_reply' | 'document_update' | 'data_entry' | 'routine_admin';

// ジョブ（AI起点の定型作業。思考マップ対象外）
export interface Job {
  id: string;
  type: JobType;
  title: string;
  description: string;
  status: JobStatus;
  priority: TaskPriority;
  draftContent?: string;       // AI生成の下書き内容
  sourceMessageId?: string;
  sourceChannel?: ChannelType;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  dismissedAt?: string;
}

// 種の状態
export type SeedStatus = 'pending' | 'confirmed';

// 種（タスク化前のアイデア・メモ）
export interface Seed {
  id: string;
  content: string;             // ユーザーが入力した生テキスト or AI要約
  sourceChannel?: ChannelType;
  sourceMessageId?: string;
  sourceFrom?: string;         // Phase 40b: 発信者（名前 or アドレス）
  sourceDate?: string;         // Phase 40b: 元メッセージの日時
  projectId?: string;          // Phase 40b: 紐づくプロジェクト
  projectName?: string;        // Phase 40b: プロジェクト名（表示用）
  createdAt: string;
  status: SeedStatus;
  tags?: string[];             // Phase 40: タグ
  // AI構造化結果（確認フェーズで生成）
  structured?: {
    goal: string;
    content: string;
    concerns: string;
    deadline?: string;
  };
}

// タスクボードの表示モード
export type TaskBoardViewMode = 'status' | 'timeline';

// タスクボードのタブ
export type TaskBoardTab = 'tasks' | 'jobs';

// ジョブ作成リクエスト
export interface CreateJobRequest {
  type: JobType;
  title: string;
  description: string;
  priority: TaskPriority;
  draftContent?: string;
  sourceMessageId?: string;
  sourceChannel?: ChannelType;
}

// 種作成リクエスト
export interface CreateSeedRequest {
  content: string;
  sourceChannel?: ChannelType;
  sourceMessageId?: string;
  sourceFrom?: string;         // Phase 40b: 発信者
  sourceDate?: string;         // Phase 40b: 元メッセージ日時
  projectId?: string;          // Phase 40b: プロジェクトID
  contextMessages?: {          // Phase 40b: AI種化用の前後コンテキスト
    from: string;
    body: string;
    timestamp: string;
    isTarget?: boolean;        // 種化ボタンを押したメッセージ
  }[];
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
  accountName?: string;
  accountIcon?: string;
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
  label: string;
  type: NodeType;
  userId: string;
  frequency: number;
  understandingLevel: UnderstandingLevel;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceContexts: NodeSourceContext[];
  createdAt: string;
  updatedAt: string;
  masterEntryId?: string;
  domainId?: string;
  fieldId?: string;
  contactId?: string;
  relationshipType?: PersonRelationshipType;
  userConfirmed?: boolean;
  confirmedAt?: string;
}

// ノードの出現コンテキスト
export interface NodeSourceContext {
  sourceType: 'message' | 'task_conversation' | 'task_ideation' | 'task_result';
  sourceId: string;
  direction: 'received' | 'sent' | 'self';
  phase?: TaskPhase;
  timestamp: string;
}

// エッジ（線）：ノード間の思考のつながり
export interface EdgeData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  userId: string;
  weight: number;
  taskIds: string[];
  edgeType: 'co_occurrence' | 'causal' | 'sequence';
  flowType: 'main' | 'tributary';
  direction: 'forward' | 'backward' | 'bidirectional';
  checkpointId?: string;
  createdAt: string;
  updatedAt: string;
}

// クラスター（面）：タスクに対する認識範囲
export interface ClusterData {
  id: string;
  taskId: string;
  userId: string;
  clusterType: 'ideation' | 'result';
  nodeIds: string[];
  summary?: string;
  createdAt: string;
}

// 面の差分データ
export interface ClusterDiff {
  taskId: string;
  userId: string;
  ideationNodeIds: string[];
  resultNodeIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  discoveredOnPath: string[];
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
  confidence: number;
}

// ノードマップ全体ビュー
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

// ===== Phase 5: 思考マップUI =====

export type MapViewMode = 'base' | 'ideation' | 'path' | 'result';

export interface MapUser {
  id: string;
  displayName: string;
  avatarColor: string;
}

export interface D3Node extends NodeData {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  isHighlighted: boolean;
  isInCluster: boolean;
  clusterType?: 'ideation' | 'result';
}

export interface D3Edge extends EdgeData {
  source: string | D3Node;
  target: string | D3Node;
  isHighlighted: boolean;
}

export interface MapState {
  viewMode: MapViewMode;
  selectedTaskId: string | null;
  selectedUserId: string;
  compareUserId: string | null;
  isCompareMode: boolean;
}

// ===== Phase 8: ナレッジマスタ基盤 =====

export interface KnowledgeDomain {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface KnowledgeField {
  id: string;
  domainId: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
}

export interface KnowledgeMasterEntry {
  id: string;
  fieldId: string;
  label: string;
  synonyms: string[];
  description?: string;
  createdAt: string;
}

export interface NodeMasterLink {
  nodeId: string;
  masterEntryId: string;
  confidence: number;
  confirmed: boolean;
  createdAt: string;
}

export interface KnowledgeHierarchy {
  domains: (KnowledgeDomain & {
    fields: (KnowledgeField & {
      entries: KnowledgeMasterEntry[];
      nodeCount: number;
    })[];
  })[];
  totalEntries: number;
  unclassifiedCount: number;
}

export interface ClassificationResult {
  domainId: string;
  domainName: string;
  fieldId: string;
  fieldName: string;
  masterEntryId?: string;
  confidence: number;
}

// ===== Phase 9: 関係値情報基盤 =====

export type PersonRelationshipType = 'internal' | 'client' | 'partner';

export interface ContactChannel {
  channel: ChannelType;
  address: string;
  frequency: number;
}

export interface ContactPerson {
  id: string;
  name: string;
  channels: ContactChannel[];
  relationshipType: PersonRelationshipType;
  confidence: number;
  confirmed: boolean;
  mainChannel: ChannelType;
  associatedNodeIds: string[];
  messageCount: number;
  lastContactAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactFilter {
  relationshipType?: PersonRelationshipType;
  channel?: ChannelType;
  searchQuery?: string;
}

export interface ContactStats {
  total: number;
  byRelationship: Record<PersonRelationshipType, number>;
  byChannel: Record<ChannelType, number>;
  unconfirmedCount: number;
}

// ===== Phase 10: 思考マップUI改修 =====

export interface CheckpointData {
  id: string;
  taskId: string;
  userId: string;
  nodeIds: string[];
  timestamp: string;
  source: 'auto' | 'manual';
  summary?: string;
  createdAt: string;
}

export type NodeFilterMode = 'keyword_only' | 'with_person' | 'with_project' | 'all';

// ===== Phase 30: マスターデータ基盤 =====

// 組織（会社・団体）
export interface Organization {
  id: string;
  name: string;
  domain?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// プロジェクトメンバー
export interface ProjectMember {
  id: string;
  projectId: string;
  contactId: string;
  role?: string;
  userId: string;
  createdAt: string;
}

// ===== Phase 30d: ビジネスログ基盤 =====

// プロジェクト
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  organizationId?: string;
  organizationName?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// グループ
export interface Group {
  id: string;
  name: string;
  projectId?: string;
  userId: string;
  createdAt: string;
}

// ビジネスイベントの種別
export type BusinessEventType = 'note' | 'meeting' | 'call' | 'email' | 'chat';

// ビジネスイベント
export interface BusinessEvent {
  id: string;
  title: string;
  content?: string;
  eventType: BusinessEventType;
  projectId?: string;
  groupId?: string;
  contactId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ===== Phase 20: 週次ノードバナー =====

export interface WeeklyNodeConfirmRequest {
  userId: string;
  nodeIds: string[];
  weekStart: string;
}

export interface WeeklyNodeConfirmResponse {
  confirmedCount: number;
  updatedNodes: NodeData[];
}

export interface WeeklyNodesResponse {
  nodes: NodeData[];
  weekStart: string;
  alreadyConfirmed: boolean;
}
