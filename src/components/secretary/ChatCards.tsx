// Phase UI-3: 秘書AI会話内インラインカード（統一デザイン）
'use client';

import { useState } from 'react';
import {
  Mail, MessageSquare, MessageCircle, Hash, Clock, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Loader2, Edit3, Send,
  Zap, CheckSquare, FileText, AlertCircle,
  Calendar, AlertTriangle, TrendingUp,
  FolderInput, Check, X, ChevronDown, ChevronUp, Sparkles, ListChecks, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ========================================
// Phase UI-3: 統一カードラッパー
// 左ボーダー色ルール:
//   blue: 情報系（ブリーフィング、一覧表示）
//   green: 完了系（タスク作成完了、承認完了）
//   yellow: 要対応（ジョブ承認、返信下書き）
//   red: 緊急（期限超過、重要メッセージ）
//   slate: デフォルト
// ========================================
export type CardAccentColor = 'blue' | 'green' | 'yellow' | 'red' | 'slate';

const accentStyles: Record<CardAccentColor, string> = {
  blue: 'border-l-blue-500',
  green: 'border-l-green-500',
  yellow: 'border-l-amber-500',
  red: 'border-l-red-500',
  slate: 'border-l-slate-300',
};

// カード種別→アクセント色のマッピング
const cardAccentMap: Partial<Record<CardType, CardAccentColor>> = {
  inbox_summary: 'blue',
  message_detail: 'blue',
  briefing_summary: 'blue',
  calendar_events: 'blue',
  document_list: 'blue',
  business_summary: 'blue',
  contact_search_result: 'blue',
  pattern_insights: 'blue',
  task_progress: 'blue',
  navigate: 'blue',

  task_created: 'green',
  action_result: 'green',  // 動的に判定（失敗時はred）
  storage_confirmation: 'green',

  job_approval: 'yellow',
  reply_draft: 'yellow',
  file_intake: 'yellow',
  knowledge_proposal: 'yellow',
  org_recommendation: 'yellow',
  task_negotiation: 'yellow',
  business_event_form: 'yellow',
  task_form: 'yellow',
  contact_form: 'yellow',
  org_form: 'yellow',
  project_form: 'yellow',

  task_proposal: 'yellow',
  deadline_alert: 'red',
  task_resume: 'blue',
  task_external_resource: 'blue',
  action_selector: 'blue',
  project_selector: 'blue',
  milestone_selector: 'blue',
  project_status_card: 'blue',
  quick_status_overview: 'blue',
};

export function UnifiedCardWrapper({
  type,
  children,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data,
}: {
  type: CardType;
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}) {
  // action_resultは成功/失敗で色を動的に変更
  let accent: CardAccentColor = cardAccentMap[type] || 'slate';
  if (type === 'action_result' && data) {
    accent = data.success ? 'green' : 'red';
  }

  return (
    <div className={cn(
      'border-l-4 rounded-xl overflow-hidden shadow-nm-sm my-2',
      'border border-slate-200 bg-white',
      accentStyles[accent]
    )}>
      {children}
    </div>
  );
}

// ========================================
// カード共通の型定義
// ========================================

// 秘書AIが返すカードの種類
export type CardType =
  | 'inbox_summary'       // メッセージ要約一覧
  | 'message_detail'      // 個別メッセージ詳細
  | 'job_approval'        // ジョブ承認カード
  | 'reply_draft'         // 返信下書き承認カード
  | 'task_created'        // タスク作成完了
  | 'task_resume'         // タスク再開提案
  | 'navigate'            // 画面遷移カード
  | 'action_result'       // アクション実行結果
  | 'briefing_summary'    // ブリーフィングサマリー
  | 'calendar_events'     // カレンダー予定一覧
  | 'deadline_alert'      // 期限アラート
  | 'document_list'       // ドキュメント一覧
  | 'file_intake'         // ファイル確認・承認
  | 'storage_confirmation' // ファイル格納確認
  | 'business_summary'    // ビジネス活動要約
  | 'business_event_form' // ビジネスイベント登録フォーム
  | 'knowledge_proposal' // ナレッジ構造化提案
  | 'task_form'          // タスク作成フォーム
  | 'task_progress'      // タスク進行カード
  | 'org_recommendation' // Phase 52: 組織レコメンド
  | 'pattern_insights'   // Phase 51c: パターンインサイト
  | 'contact_form'       // Phase 53c: コンタクト登録フォーム
  | 'contact_search_result' // Phase 53c: コンタクト検索結果
  | 'org_form'           // Phase 53c: 組織作成フォーム
  | 'project_form'       // Phase 53c: プロジェクト作成フォーム
  | 'task_negotiation'   // Phase 56c: タスク修正提案・調整
  | 'task_external_resource' // Phase E: タスク外部資料取り込み
  | 'action_selector'    // V3.0: アクション選択カード
  | 'project_selector'   // V3.0: プロジェクト選択カード
  | 'milestone_selector' // V3.0: マイルストーン選択カード
  | 'task_proposal'      // V3.0: タスク提案カード（会議録→承認）
  | 'project_status_card'   // v3.1: プロジェクト進捗ステータス
  | 'quick_status_overview'; // v3.1: 全PJ進捗概要

// カードデータ共通
export interface CardData {
  type: CardType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// チャットメッセージ（テキスト + カード混在）
export interface SecretaryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;           // テキスト部分
  cards?: CardData[];        // インラインカード（AIレスポンス時）
  timestamp: string;
}

// ========================================
// インボックス要約カード
// ========================================
interface InboxItem {
  id: string;
  channel: 'email' | 'slack' | 'chatwork';
  from: string;
  subject?: string;
  preview: string;
  urgency: 'high' | 'medium' | 'low';
  timestamp: string;
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  switch (channel) {
    case 'email': return <Mail className={className} />;
    case 'slack': return <Hash className={className} />;
    case 'chatwork': return <MessageSquare className={className} />;
    default: return <Mail className={className} />;
  }
}

function UrgencyDot({ urgency }: { urgency: string }) {
  const colors = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-green-500',
  };
  return <span className={cn('w-2 h-2 rounded-full shrink-0', colors[urgency as keyof typeof colors] || 'bg-slate-300')} />;
}

export function InboxSummaryCard({
  items,
  onSelectMessage,
}: {
  items: InboxItem[];
  onSelectMessage?: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
        <Mail className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">新着メッセージ {items.length}件</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectMessage?.(item.id)}
            className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left"
          >
            <UrgencyDot urgency={item.urgency} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <ChannelIcon channel={item.channel} className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-800 truncate">{item.from}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{item.timestamp}</span>
              </div>
              {item.subject && (
                <p className="text-xs text-slate-600 truncate mt-0.5">{item.subject}</p>
              )}
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.preview}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ========================================
// メッセージ詳細カード
// ========================================
interface MessageDetailData {
  id: string;
  channel: 'email' | 'slack' | 'chatwork';
  from: string;
  subject?: string;
  body: string;
  timestamp: string;
}

export function MessageDetailCard({
  message,
  onReply,
  onCreateJob,
  onCreateTask,
}: {
  message: MessageDetailData;
  onReply?: () => void;
  onCreateJob?: () => void;
  onCreateTask?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const bodyText = message.body || '（本文なし）';
  // 本文が長い場合は折りたたみ（200文字 or 6行以上）
  const lineCount = bodyText.split('\n').length;
  const isLong = bodyText.length > 200 || lineCount > 6;
  const previewText = isLong && !isExpanded
    ? bodyText.split('\n').slice(0, 5).join('\n').slice(0, 200) + '…'
    : bodyText;

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <ChannelIcon channel={message.channel} className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-800">{message.from}</span>
          <span className="text-[10px] text-slate-400">{message.timestamp}</span>
        </div>
        {message.subject && (
          <p className="text-sm font-medium text-slate-700">{message.subject}</p>
        )}
      </div>
      <div className="px-4 py-3">
        <p className={cn(
          "text-sm text-slate-600 whitespace-pre-wrap leading-relaxed",
          !isExpanded && isLong && "max-h-32 overflow-hidden"
        )}>
          {previewText}
        </p>
        {isLong && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
          >
            {isExpanded ? (
              <><ChevronUp className="w-3 h-3" /> 折りたたむ</>
            ) : (
              <><ChevronDown className="w-3 h-3" /> 全文を表示（{bodyText.length}文字）</>
            )}
          </button>
        )}
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex gap-2">
        <button
          onClick={onReply}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
        >
          <Edit3 className="w-3 h-3" /> 返信する
        </button>
        <button
          onClick={onCreateJob}
          className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-1.5"
        >
          <Zap className="w-3 h-3" /> ジョブにする
        </button>
        <button
          onClick={onCreateTask}
          className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1.5"
        >
          <CheckSquare className="w-3 h-3" /> タスクにする
        </button>
      </div>
    </div>
  );
}

// ========================================
// ジョブ承認カード（Phase B拡張: 編集対応 + 実行状態表示）
// ========================================
interface JobApprovalData {
  id: string;
  title: string;
  type: string;
  draft: string;        // AI下書き（送信文面など）
  targetName?: string;  // 送信先名
  // Phase B拡張: 実行に必要な情報
  channel?: string;
  replyToMessageId?: string;
  targetAddress?: string;
  metadata?: Record<string, unknown>;
}

export function JobApprovalCard({
  job,
  onApprove,
  onEdit,
  onReject,
}: {
  job: JobApprovalData;
  onApprove?: (editedDraft?: string) => void;
  onEdit?: () => void;
  onReject?: () => void;
}) {
  const [status, setStatus] = useState<'pending' | 'executing' | 'done' | 'failed' | 'rejected'>('pending');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedDraft, setEditedDraft] = useState(job.draft);
  const [resultMessage, setResultMessage] = useState('');

  const handleApprove = async () => {
    setIsProcessing(true);
    setStatus('executing');
    try {
      await onApprove?.(editedDraft);
      setStatus('done');
      setResultMessage('実行完了しました');
    } catch {
      setStatus('failed');
      setResultMessage('実行に失敗しました');
    }
    setIsProcessing(false);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onReject?.();
    setStatus('rejected');
    setIsProcessing(false);
  };

  const typeLabel = {
    reply: '返信',
    schedule: '日程調整',
    check: '確認',
    other: 'その他',
  };

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-semibold text-amber-800">{job.title}</span>
        {job.type && (
          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
            {typeLabel[job.type as keyof typeof typeLabel] || job.type}
          </span>
        )}
        {job.targetName && (
          <span className="text-[10px] text-amber-600 ml-auto">→ {job.targetName}</span>
        )}
      </div>
      <div className="px-4 py-3">
        {editMode ? (
          <textarea
            value={editedDraft}
            onChange={(e) => setEditedDraft(e.target.value)}
            className="w-full text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            rows={6}
          />
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
            {editedDraft}
          </p>
        )}
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
        {status === 'pending' ? (
          <>
            <button
              onClick={handleApprove}
              disabled={isProcessing}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              承認して実行
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5"
            >
              <Edit3 className="w-3 h-3" /> {editMode ? '完了' : '修正する'}
            </button>
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-3 h-3" /> 却下
            </button>
          </>
        ) : status === 'executing' ? (
          <span className="text-xs text-blue-600 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 実行中...
          </span>
        ) : status === 'done' ? (
          <span className="text-xs text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {resultMessage || '実行完了'}
          </span>
        ) : status === 'failed' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {resultMessage || '実行失敗'}
            </span>
            <button
              onClick={() => { setStatus('pending'); setResultMessage(''); }}
              className="px-2 py-1 text-[10px] font-medium text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
            >
              再試行
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> 却下しました
          </span>
        )}
      </div>
    </div>
  );
}

// ========================================
// タスク作成完了カード
// ========================================
interface TaskCreatedData {
  id: string;
  title: string;
  priority: string;
  dueDate?: string;
  projectName?: string;
}

export function TaskCreatedCard({ task }: { task: TaskCreatedData }) {
  const priorityColors = {
    high: 'text-red-600 bg-red-50',
    medium: 'text-amber-600 bg-amber-50',
    low: 'text-green-600 bg-green-50',
  };
  const priorityLabels = { high: '高', medium: '中', low: '低' };

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span className="text-xs font-semibold text-green-800">タスク登録完了</span>
      </div>
      <div className="px-4 py-3 flex items-start gap-3">
        <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{task.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
              priorityColors[task.priority as keyof typeof priorityColors] || 'text-slate-600 bg-slate-100')}>
              優先度: {priorityLabels[task.priority as keyof typeof priorityLabels] || task.priority}
            </span>
            {task.dueDate && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {task.dueDate}
              </span>
            )}
            {task.projectName && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {task.projectName}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// タスク再開提案カード
// ========================================
interface TaskResumeData {
  id: string;
  title: string;
  status: string;
  lastActivity: string;
  remainingItems?: string[];
}

export function TaskResumeCard({
  task,
  onResume,
}: {
  task: TaskResumeData;
  onResume?: (taskId: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{task.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">前回: {task.lastActivity}</p>
          {task.remainingItems && task.remainingItems.length > 0 && (
            <div className="mt-2 space-y-1">
              {task.remainingItems.map((item, i) => (
                <p key={i} className="text-xs text-slate-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-500" /> {item}
                </p>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onResume?.(task.id)}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <ArrowRight className="w-3 h-3" /> 続ける
        </button>
      </div>
    </div>
  );
}

// ========================================
// タスク作成フォームカード
// ========================================
interface TaskFormProject {
  id: string;
  name: string;
  organizationName?: string;
}

interface TaskFormData {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedPriority: string;
  suggestedProjectId: string;
  suggestedMilestoneId?: string;  // v3.1: ウィザードから渡される
  suggestedDueDate: string;
  projects: TaskFormProject[];
}

export function TaskFormCard({
  data,
  onSubmit,
}: {
  data: TaskFormData;
  onSubmit?: (taskData: {
    title: string;
    description: string;
    priority: string;
    projectId: string;
    milestoneId?: string;
    dueDate: string;
  }) => void;
}) {
  const [title, setTitle] = useState(data.suggestedTitle || '');
  const [description, setDescription] = useState(data.suggestedDescription || '');
  const [priority, setPriority] = useState(data.suggestedPriority || 'medium');
  const [projectId, setProjectId] = useState(data.suggestedProjectId || '');
  const [dueDate, setDueDate] = useState(data.suggestedDueDate || '');
  const milestoneId = data.suggestedMilestoneId || '';
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      onSubmit?.({ title: title.trim(), description: description.trim(), priority, projectId, milestoneId, dueDate });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">タスク「{title}」を作成しました</span>
        </div>
      </div>
    );
  }

  const priorityOptions = [
    { value: 'high', label: '高', color: 'text-red-600 bg-red-50 border-red-200' },
    { value: 'medium', label: '中', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { value: 'low', label: '低', color: 'text-green-600 bg-green-50 border-green-200' },
  ];

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-blue-800">タスク作成</span>
      </div>
      <div className="p-4 space-y-3">
        {/* タイトル */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タスクのタイトルを入力"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 説明 */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">説明</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="タスクの説明（任意）"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* 優先度 */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">優先度</label>
          <div className="flex gap-2">
            {priorityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPriority(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                  priority === opt.value
                    ? opt.color + ' ring-1 ring-current'
                    : 'text-slate-400 bg-white border-slate-200 hover:bg-slate-50'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* プロジェクト */}
        {data.projects.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">プロジェクト</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">プロジェクトなし</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.organizationName ? `${p.organizationName} / ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 期限 */}
        <div>
          <label className="text-[11px] font-medium text-slate-500 mb-1 block">期限</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 送信ボタン */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:bg-slate-200 disabled:text-slate-400 transition-colors flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            作成する
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// タスク進行カード
// ========================================
interface TaskProgressData {
  id: string;
  title: string;
  status: string;
  phase: string;
  priority: string;
  dueDate?: string | null;
  recentConversations?: Array<{ role: string; content: string; timestamp: string }>;
}

export function TaskProgressCard({
  data,
  onResume,
}: {
  data: TaskProgressData;
  onResume?: (taskId: string) => void;
  onSendMessage?: (taskId: string, message: string) => void;
}) {
  const phaseLabels: Record<string, { label: string; icon: string; color: string }> = {
    ideation: { label: '構想', icon: '💡', color: 'bg-amber-50 text-amber-700' },
    progress: { label: '進行', icon: '🔧', color: 'bg-blue-50 text-blue-700' },
    result: { label: '結果', icon: '📊', color: 'bg-purple-50 text-purple-700' },
  };
  const priorityLabels: Record<string, { label: string; color: string }> = {
    high: { label: '高', color: 'text-red-600 bg-red-50' },
    medium: { label: '中', color: 'text-amber-600 bg-amber-50' },
    low: { label: '低', color: 'text-green-600 bg-green-50' },
  };

  const phase = phaseLabels[data.phase] || { label: data.phase, icon: '📋', color: 'bg-slate-50 text-slate-700' };
  const prio = priorityLabels[data.priority] || { label: data.priority, color: 'text-slate-600 bg-slate-50' };

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-semibold text-indigo-800">タスク進行</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium', phase.color)}>
            {phase.icon} {phase.label}
          </span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold', prio.color)}>
            {prio.label}
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">{data.title}</h4>
        {data.dueDate && (
          <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-2">
            <Clock className="w-3 h-3" /> 期限: {data.dueDate}
          </p>
        )}

        {/* タスクページへ */}
        <button
          onClick={() => onResume?.(data.id)}
          className="mt-1 w-full px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <ArrowRight className="w-3 h-3" /> タスクページで詳しく見る
        </button>
      </div>
    </div>
  );
}

// ========================================
// 画面遷移カード
// ========================================
interface NavigateData {
  href: string;
  label: string;
  description?: string;
}

export function NavigateCard({ nav }: { nav: NavigateData }) {
  return (
    <a
      href={nav.href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-blue-700">{nav.label}</span>
        {nav.description && (
          <p className="text-[11px] text-slate-400 mt-0.5">{nav.description}</p>
        )}
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
    </a>
  );
}

// ========================================
// アクション結果カード
// ========================================
interface ActionResultData {
  success: boolean;
  message: string;
  details?: string;
}

export function ActionResultCard({ result }: { result: ActionResultData }) {
  return (
    <div className={cn(
      'px-4 py-3 flex items-start gap-3',
      result.success
        ? 'bg-green-50'
        : 'bg-red-50'
    )}>
      {result.success
        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      }
      <div>
        <p className={cn('text-sm font-medium', result.success ? 'text-green-800' : 'text-red-800')}>
          {result.message}
        </p>
        {result.details && (
          <p className="text-xs text-slate-500 mt-0.5">{result.details}</p>
        )}
      </div>
    </div>
  );
}

// ========================================
// 返信下書き承認カード（Phase C）
// ========================================
interface ReplyDraftData {
  originalMessageId: string;
  channel: string;
  to: string;           // 送信先アドレス
  toName: string;       // 送信先名
  subject?: string;
  draft: string;        // AI生成の返信文面
  metadata?: Record<string, unknown>;  // 元メッセージのメタデータ（返信時に必要）
}

export function ReplyDraftCard({
  reply,
  onApprove,
  onEdit,
  onReject,
}: {
  reply: ReplyDraftData;
  onApprove?: (data: ReplyDraftData) => void;
  onEdit?: (data: ReplyDraftData) => void;
  onReject?: () => void;
}) {
  const [status, setStatus] = useState<'pending' | 'sending' | 'sent' | 'rejected'>('pending');
  const [editMode, setEditMode] = useState(false);
  const [editedDraft, setEditedDraft] = useState(reply.draft);

  const handleApprove = async () => {
    setStatus('sending');
    await onApprove?.({ ...reply, draft: editedDraft });
    setStatus('sent');
  };

  const handleReject = () => {
    setStatus('rejected');
    onReject?.();
  };

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
        <Send className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-blue-800">
          返信下書き → {reply.toName || reply.to}
        </span>
        <ChannelIcon channel={reply.channel} className="w-3.5 h-3.5 text-blue-400 ml-auto" />
      </div>
      <div className="px-4 py-3">
        {reply.subject && (
          <p className="text-xs text-slate-500 mb-2">件名: {reply.subject}</p>
        )}
        {editMode ? (
          <textarea
            value={editedDraft}
            onChange={(e) => setEditedDraft(e.target.value)}
            className="w-full text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={6}
          />
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
            {editedDraft}
          </p>
        )}
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
        {status === 'pending' ? (
          <>
            <button
              onClick={handleApprove}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" /> 承認して送信
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5"
            >
              <Edit3 className="w-3 h-3" /> {editMode ? '完了' : '修正する'}
            </button>
            <button
              onClick={handleReject}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-3 h-3" /> 却下
            </button>
          </>
        ) : status === 'sending' ? (
          <span className="text-xs text-blue-600 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 送信中...
          </span>
        ) : status === 'sent' ? (
          <span className="text-xs text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 送信完了
          </span>
        ) : (
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> 却下しました
          </span>
        )}
      </div>
    </div>
  );
}

// ========================================
// ブリーフィングサマリーカード
// ========================================
interface BriefingSummaryData {
  date: string;           // 表示日付（例: "3月2日（月）"）
  unreadCount: number;
  urgentCount: number;
  activeTaskCount: number;
  proposedTaskCount?: number; // Phase 56b: 提案中タスク数
  pendingJobCount: number;
  todayEventCount: number;
  pendingFileCount?: number;  // 未確認ファイル数
  pendingKnowledgeProposals?: number; // ナレッジ提案数
  pendingTaskSuggestions?: number; // Phase 56: タスク提案数
  pendingNegotiations?: number;   // Phase 56c: 調整待ちタスク数
  consultingJobCount?: number;       // Phase 58: 相談中ジョブ数
  draftReadyJobCount?: number;       // Phase 58: 回答あり（返信下書き生成済み）
  pendingConsultationCount?: number; // Phase 58: あなた宛ての未回答相談数
  nextEvent?: {           // 次の予定
    title: string;
    time: string;         // "10:00〜11:00"
    minutesUntil?: number;
  };
}

export function BriefingSummaryCard({ summary }: { summary: BriefingSummaryData }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-semibold text-blue-800">{summary.date} のブリーフィング</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-500" />
          <div>
            <span className="text-lg font-bold text-slate-800">{summary.unreadCount}</span>
            <span className="text-[10px] text-slate-500 ml-1">未読</span>
            {summary.urgentCount > 0 && (
              <span className="text-[10px] text-red-600 ml-1">({summary.urgentCount}件 緊急)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-slate-500" />
          <div>
            <span className="text-lg font-bold text-slate-800">{summary.activeTaskCount}</span>
            <span className="text-[10px] text-slate-500 ml-1">進行中タスク</span>
          </div>
        </div>
        {(summary.proposedTaskCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-amber-500" />
            <div>
              <span className="text-lg font-bold text-amber-700">{summary.proposedTaskCount}</span>
              <span className="text-[10px] text-amber-600 ml-1">承認待ちタスク</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-slate-500" />
          <div>
            <span className="text-lg font-bold text-slate-800">{summary.pendingJobCount}</span>
            <span className="text-[10px] text-slate-500 ml-1">未処理ジョブ</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div>
            <span className="text-lg font-bold text-slate-800">{summary.todayEventCount}</span>
            <span className="text-[10px] text-slate-500 ml-1">今日の予定</span>
          </div>
        </div>
        {(summary.pendingFileCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-amber-500" />
            <div>
              <span className="text-lg font-bold text-amber-700">{summary.pendingFileCount}</span>
              <span className="text-[10px] text-amber-600 ml-1">確認待ちファイル</span>
            </div>
          </div>
        )}
        {(summary.pendingKnowledgeProposals ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <div>
              <span className="text-lg font-bold text-purple-700">{summary.pendingKnowledgeProposals}</span>
              <span className="text-[10px] text-purple-600 ml-1">ナレッジ提案</span>
            </div>
          </div>
        )}
        {(summary.pendingTaskSuggestions ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-teal-500" />
            <div>
              <span className="text-lg font-bold text-teal-700">{summary.pendingTaskSuggestions}</span>
              <span className="text-[10px] text-teal-600 ml-1">タスク提案</span>
            </div>
          </div>
        )}
        {(summary.pendingNegotiations ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-orange-500" />
            <div>
              <span className="text-lg font-bold text-orange-700">{summary.pendingNegotiations}</span>
              <span className="text-[10px] text-orange-600 ml-1">調整待ちタスク</span>
            </div>
          </div>
        )}
        {(summary.pendingConsultationCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-purple-500" />
            <div>
              <span className="text-lg font-bold text-purple-700">{summary.pendingConsultationCount}</span>
              <span className="text-[10px] text-purple-600 ml-1">あなた宛ての相談</span>
            </div>
          </div>
        )}
        {(summary.draftReadyJobCount ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            <div>
              <span className="text-lg font-bold text-indigo-700">{summary.draftReadyJobCount}</span>
              <span className="text-[10px] text-indigo-600 ml-1">回答あり（要確認）</span>
            </div>
          </div>
        )}
      </div>
      {summary.nextEvent && (
        <div className="px-4 py-2 bg-white/60 border-t border-blue-100 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs text-blue-800">
            次の予定: <span className="font-medium">{summary.nextEvent.title}</span>
            <span className="text-blue-600 ml-1">({summary.nextEvent.time})</span>
            {summary.nextEvent.minutesUntil !== undefined && summary.nextEvent.minutesUntil > 0 && (
              <span className="text-blue-500 ml-1">あと{summary.nextEvent.minutesUntil}分</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ========================================
// カレンダー予定カード
// ========================================
interface CalendarEventItem {
  id: string;
  title: string;
  startTime: string;     // "10:00"
  endTime: string;       // "11:00"
  location?: string;
  isAllDay?: boolean;
  isNow?: boolean;       // 現在進行中
}

interface CalendarEventsData {
  date: string;           // "今日" or "3月2日"
  events: CalendarEventItem[];
}

export function CalendarEventsCard({ calendar }: { calendar: CalendarEventsData }) {
  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-purple-600" />
        <span className="text-xs font-semibold text-purple-800">{calendar.date}の予定 {calendar.events.length}件</span>
      </div>
      {calendar.events.length === 0 ? (
        <div className="px-4 py-3 text-xs text-slate-400">予定はありません</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {calendar.events.map((ev) => (
            <div
              key={ev.id}
              className={cn(
                'px-4 py-2.5 flex items-center gap-3',
                ev.isNow && 'bg-purple-50/50'
              )}
            >
              <div className="w-14 shrink-0">
                {ev.isAllDay ? (
                  <span className="text-[10px] font-medium text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">終日</span>
                ) : (
                  <span className={cn('text-xs font-medium', ev.isNow ? 'text-purple-700' : 'text-slate-600')}>
                    {ev.startTime}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs truncate', ev.isNow ? 'font-semibold text-purple-800' : 'text-slate-700')}>
                  {ev.isNow && <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5 animate-pulse" />}
                  {ev.title}
                </p>
                {!ev.isAllDay && (
                  <p className="text-[10px] text-slate-400">{ev.startTime} 〜 {ev.endTime}</p>
                )}
                {ev.location && (
                  <p className="text-[10px] text-slate-400 truncate">{ev.location}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========================================
// 期限アラートカード
// ========================================
interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string;       // "2026-03-02"
  dueLabel: string;      // "今日" / "明日" / "3日後"
  priority: string;
  type: 'task' | 'job';
  urgency: 'overdue' | 'today' | 'soon';  // 期限切れ / 今日 / 近日
}

interface DeadlineAlertData {
  items: DeadlineItem[];
}

export function DeadlineAlertCard({
  deadlines,
  onClickItem,
}: {
  deadlines: DeadlineAlertData;
  onClickItem?: (id: string, type: string) => void;
}) {
  const urgencyStyle = {
    overdue: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
    today: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
    soon: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  };

  const overdueItems = deadlines.items.filter(d => d.urgency === 'overdue');
  const todayItems = deadlines.items.filter(d => d.urgency === 'today');
  const soonItems = deadlines.items.filter(d => d.urgency === 'soon');

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-semibold text-amber-800">期限アラート {deadlines.items.length}件</span>
      </div>
      <div className="divide-y divide-slate-100">
        {[...overdueItems, ...todayItems, ...soonItems].map((item) => {
          const style = urgencyStyle[item.urgency];
          return (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => onClickItem?.(item.id, item.type)}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
            >
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', style.badge)}>
                {item.dueLabel}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">
                  {item.type === 'task' ? 'タスク' : 'ジョブ'} ・ 優先度{item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                </p>
              </div>
              <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ========================================
// ドキュメント一覧カード（Google Drive）
// ========================================
interface DocumentItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  driveUrl: string;
  sourceChannel?: string;
  uploadedAt: string;
  isShared: boolean;
}

function getFileIcon(mimeType: string): string {
  if (!mimeType) return '📄';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📙';
  if (mimeType.includes('document') || mimeType.includes('word')) return '📘';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
  return '📄';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function DocumentListCard({
  documents,
  totalCount,
  onShare,
}: {
  documents: DocumentItem[];
  totalCount: number;
  onShare?: (docId: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-800">ドキュメント（{totalCount}件）</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3"
          >
            <span className="text-lg flex-shrink-0">{getFileIcon(doc.mimeType)}</span>
            <div className="flex-1 min-w-0">
              <a
                href={doc.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
              >
                {doc.fileName}
              </a>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                {doc.fileSizeBytes > 0 && <span>{formatFileSize(doc.fileSizeBytes)}</span>}
                {doc.sourceChannel && (
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                    {doc.sourceChannel}
                  </span>
                )}
                {doc.isShared && <span className="text-green-600">共有済み</span>}
                <span>{new Date(doc.uploadedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              <a
                href={doc.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:bg-gray-100 rounded"
                title="Driveで開く"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </a>
              {onShare && (
                <button
                  onClick={() => onShare(doc.id)}
                  className="p-1.5 hover:bg-blue-50 rounded"
                  title="共有リンク生成"
                >
                  <Send className="w-3.5 h-3.5 text-blue-500" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// ファイル確認・承認カード（Phase 44c）
// ========================================
interface FileIntakeItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes?: number;
  organizationId?: string;
  projectId?: string;
  aiDocumentType: string;
  aiDirection: string;
  aiYearMonth: string;
  aiSuggestedName: string;
  aiConfidence: number;
  sourceType?: string;
  createdAt: string;
}

const DOCUMENT_TYPES = [
  '見積書', '契約書', '請求書', '発注書', '納品書',
  '仕様書', '議事録', '報告書', '提案書', '企画書', 'その他',
];

export function FileIntakeCard({
  files,
  totalCount,
  onApprove,
  onReject,
  onApproveAll,
}: {
  files: FileIntakeItem[];
  totalCount: number;
  onApprove?: (fileId: string, overrides: { documentType: string; direction: string; yearMonth: string }) => void;
  onReject?: (fileId: string) => void;
  onApproveAll?: () => void;
}) {
  // 各ファイルの編集状態
  const [editStates, setEditStates] = useState<Record<string, {
    documentType: string;
    direction: string;
    yearMonth: string;
    expanded: boolean;
  }>>(() => {
    const initial: Record<string, { documentType: string; direction: string; yearMonth: string; expanded: boolean }> = {};
    files.forEach(f => {
      initial[f.id] = {
        documentType: f.aiDocumentType,
        direction: f.aiDirection,
        yearMonth: f.aiYearMonth,
        expanded: false,
      };
    });
    return initial;
  });
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const updateState = (id: string, field: string, value: string) => {
    setEditStates(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const toggleExpand = (id: string) => {
    setEditStates(prev => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id]?.expanded },
    }));
  };

  const handleApprove = async (fileId: string) => {
    const state = editStates[fileId];
    if (!state) return;
    setLoadingId(fileId);
    onApprove?.(fileId, {
      documentType: state.documentType,
      direction: state.direction,
      yearMonth: state.yearMonth,
    });
    setApprovedIds(prev => new Set([...prev, fileId]));
    setLoadingId(null);
  };

  const handleReject = (fileId: string) => {
    onReject?.(fileId);
    setRejectedIds(prev => new Set([...prev, fileId]));
  };

  const pendingFiles = files.filter(f => !approvedIds.has(f.id) && !rejectedIds.has(f.id));

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderInput className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">
            確認待ちファイル {totalCount}件
          </span>
        </div>
        {pendingFiles.length > 1 && onApproveAll && (
          <button
            onClick={onApproveAll}
            className="px-3 py-1 text-[11px] font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            一括承認
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {files.map((file) => {
          const state = editStates[file.id];
          const isApproved = approvedIds.has(file.id);
          const isRejected = rejectedIds.has(file.id);
          const isLoading = loadingId === file.id;

          if (isApproved) {
            return (
              <div key={file.id} className="px-4 py-3 bg-green-50 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700">{file.fileName} — 承認済み</span>
              </div>
            );
          }
          if (isRejected) {
            return (
              <div key={file.id} className="px-4 py-3 bg-red-50 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-red-600">{file.fileName} — 却下</span>
              </div>
            );
          }

          return (
            <div key={file.id} className="px-4 py-3">
              {/* ファイル基本情報 */}
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800 truncate">{file.fileName}</span>
                    {file.fileSizeBytes && (
                      <span className="text-[10px] text-slate-400 shrink-0">{formatFileSize(file.fileSizeBytes)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      'px-1.5 py-0.5 text-[10px] font-medium rounded',
                      file.aiConfidence >= 0.8 ? 'bg-green-100 text-green-700' :
                      file.aiConfidence >= 0.5 ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {state?.documentType || file.aiDocumentType}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {(state?.direction || file.aiDirection) === 'received' ? '受領' : '提出'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {state?.yearMonth || file.aiYearMonth}
                    </span>
                    <button
                      onClick={() => toggleExpand(file.id)}
                      className="ml-auto text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                    >
                      <Edit3 className="w-3 h-3" />
                      {state?.expanded ? '閉じる' : '編集'}
                    </button>
                  </div>

                  {/* 展開時の編集フォーム */}
                  {state?.expanded && (
                    <div className="mt-2 p-2 bg-slate-50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 w-14 shrink-0">書類種別</label>
                        <div className="relative flex-1">
                          <select
                            value={state.documentType}
                            onChange={(e) => updateState(file.id, 'documentType', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1 appearance-none bg-white pr-6"
                          >
                            {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 w-14 shrink-0">方向</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateState(file.id, 'direction', 'received')}
                            className={cn(
                              'px-2 py-0.5 text-[10px] rounded border transition-colors',
                              state.direction === 'received'
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            )}
                          >
                            受領
                          </button>
                          <button
                            onClick={() => updateState(file.id, 'direction', 'submitted')}
                            className={cn(
                              'px-2 py-0.5 text-[10px] rounded border transition-colors',
                              state.direction === 'submitted'
                                ? 'bg-purple-50 border-purple-300 text-purple-700'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            )}
                          >
                            提出
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 w-14 shrink-0">年月</label>
                        <input
                          type="month"
                          value={state.yearMonth}
                          onChange={(e) => updateState(file.id, 'yearMonth', e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="flex gap-2 mt-2 ml-7">
                <button
                  onClick={() => handleApprove(file.id)}
                  disabled={isLoading || !file.organizationId || !file.projectId}
                  className={cn(
                    'px-3 py-1 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1',
                    (!file.organizationId || !file.projectId)
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  承認
                </button>
                <button
                  onClick={() => handleReject(file.id)}
                  className="px-3 py-1 text-[11px] font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  却下
                </button>
                {(!file.organizationId || !file.projectId) && (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    組織/プロジェクト未設定
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 処理済みサマリー */}
      {(approvedIds.size > 0 || rejectedIds.size > 0) && pendingFiles.length === 0 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-xs text-slate-600">
            全{files.length}件処理完了（承認: {approvedIds.size}件、却下: {rejectedIds.size}件）
          </p>
        </div>
      )}
    </div>
  );
}

// ========================================
// Phase 56c: タスク修正提案・調整カード
// ========================================
const CHANGE_TYPE_LABELS: Record<string, string> = {
  deadline: '納期変更',
  priority: '優先度変更',
  content: '内容変更',
  reassign: '担当者変更',
  other: 'その他',
};

interface NegotiationRequestItem {
  id: string;
  requesterName: string;
  changeType: string;
  proposedValue: string;
  reason: string | null;
  currentValue: string | null;
}

interface TaskNegotiationData {
  taskId: string;
  taskTitle: string;
  taskPriority: string;
  taskDueDate: string | null;
  pendingRequests: NegotiationRequestItem[];
  pendingCount: number;
  adjustment?: {
    adjustedTitle?: string;
    adjustedDeadline?: string;
    adjustedPriority?: string;
    adjustedDescription?: string;
    adjustedAssigneeName?: string;
    reasoning: string;
  };
}

function TaskNegotiationCard({
  data,
  onGenerateAdjustment,
  onApplyAdjustment,
  onDismiss,
}: {
  data: TaskNegotiationData;
  onGenerateAdjustment?: (taskId: string) => void;
  onApplyAdjustment?: (taskId: string, adjustment: TaskNegotiationData['adjustment']) => void;
  onDismiss?: (taskId: string) => void;
}) {
  const [showAdjustment, setShowAdjustment] = useState(false);

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
        <Edit3 className="w-4 h-4 text-orange-600" />
        <span className="text-xs font-semibold text-orange-800">タスク修正提案</span>
        <span className="text-[10px] text-orange-500 ml-auto">{data.pendingCount}件の修正希望</span>
      </div>

      {/* タスク情報 */}
      <div className="px-4 py-2 border-b border-orange-50">
        <p className="text-sm font-medium text-slate-800">{data.taskTitle}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-500">優先度: {data.taskPriority}</span>
          {data.taskDueDate && (
            <span className="text-[10px] text-slate-500">期限: {data.taskDueDate}</span>
          )}
        </div>
      </div>

      {/* 修正リクエスト一覧 */}
      <div className="px-4 py-2 space-y-2">
        {data.pendingRequests.map((req) => (
          <div key={req.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium shrink-0">
              {CHANGE_TYPE_LABELS[req.changeType] || req.changeType}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-700">
                <span className="font-medium">{req.requesterName}</span>: {req.proposedValue}
              </p>
              {req.reason && (
                <p className="text-[10px] text-slate-400 mt-0.5">理由: {req.reason}</p>
              )}
              {req.currentValue && (
                <p className="text-[10px] text-slate-400">現在: {req.currentValue}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI調整案 */}
      {data.adjustment && showAdjustment && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-1 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">AI調整案</span>
          </div>
          <div className="space-y-1">
            {data.adjustment.adjustedTitle && (
              <p className="text-xs text-slate-700">タイトル → <span className="font-medium">{data.adjustment.adjustedTitle}</span></p>
            )}
            {data.adjustment.adjustedDeadline && (
              <p className="text-xs text-slate-700">期限 → <span className="font-medium">{data.adjustment.adjustedDeadline}</span></p>
            )}
            {data.adjustment.adjustedPriority && (
              <p className="text-xs text-slate-700">優先度 → <span className="font-medium">{data.adjustment.adjustedPriority}</span></p>
            )}
            {data.adjustment.adjustedDescription && (
              <p className="text-xs text-slate-700">内容 → <span className="font-medium line-clamp-2">{data.adjustment.adjustedDescription}</span></p>
            )}
            {data.adjustment.adjustedAssigneeName && (
              <p className="text-xs text-slate-700">担当者 → <span className="font-medium">{data.adjustment.adjustedAssigneeName}</span></p>
            )}
          </div>
          <p className="text-[10px] text-blue-600 mt-2">{data.adjustment.reasoning}</p>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => onApplyAdjustment?.(data.taskId, data.adjustment)}
              className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              承認して反映
            </button>
            <button
              onClick={() => setShowAdjustment(false)}
              className="py-1.5 px-3 text-[11px] font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* アクションボタン */}
      <div className="px-4 pb-3 flex gap-1.5">
        {data.pendingCount > 0 && !data.adjustment && (
          <button
            onClick={() => onGenerateAdjustment?.(data.taskId)}
            className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center justify-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            AI調整案を生成
          </button>
        )}
        {data.adjustment && !showAdjustment && (
          <button
            onClick={() => setShowAdjustment(true)}
            className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            AI調整案を表示
          </button>
        )}
        <button
          onClick={() => onDismiss?.(data.taskId)}
          className="py-1.5 px-3 text-[11px] font-semibold rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
        >
          却下
        </button>
      </div>
    </div>
  );
}

// ========================================
// カードレンダラー（型に応じて適切なカードを表示）
// ========================================
// ========================================
// Phase 58: 社内相談一覧カード
// ========================================
interface ConsultationItem {
  id: string;
  jobTitle: string;
  question: string;
  threadSummary?: string;
  createdAt: string;
}

export function ConsultationListCard({
  consultations,
  onAnswer,
}: {
  consultations: ConsultationItem[];
  onAnswer?: (consultationId: string, answer: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleSubmit = async (id: string) => {
    const answer = answers[id];
    if (!answer?.trim()) return;
    setSubmitting(id);
    onAnswer?.(id, answer.trim());
    // Optimistic: clear after submit
    setTimeout(() => setSubmitting(null), 2000);
  };

  return (
    <div className="bg-purple-50 overflow-hidden">
      <div className="px-4 py-3 border-b border-purple-100 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-purple-600" />
        <span className="text-xs font-semibold text-purple-800">あなた宛ての社内相談（{consultations.length}件）</span>
      </div>
      <div className="divide-y divide-purple-100">
        {consultations.map(c => (
          <div key={c.id} className="px-4 py-3">
            <div className="text-xs text-purple-500 mb-1">{c.jobTitle}</div>
            {c.threadSummary && (
              <div className="text-[11px] text-gray-400 mb-1 p-2 bg-white/60 rounded">
                {c.threadSummary.slice(0, 150)}
              </div>
            )}
            <div className="text-sm text-gray-700 mb-2">{c.question}</div>
            <textarea
              value={answers[c.id] || ''}
              onChange={e => setAnswers(prev => ({ ...prev, [c.id]: e.target.value }))}
              placeholder="回答を入力..."
              className="w-full px-2 py-1.5 border border-purple-200 rounded text-xs resize-none focus:ring-1 focus:ring-purple-300"
              rows={2}
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={() => handleSubmit(c.id)}
                disabled={!answers[c.id]?.trim() || submitting === c.id}
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting === c.id ? '送信中...' : '回答を送信'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardRenderer({
  card,
  onAction,
}: {
  card: CardData;
  onAction?: (action: string, data: unknown) => void;
}) {
  // 防御: card.dataがnull/undefinedの場合は描画しない
  if (!card || !card.type || !card.data) return null;

  // Phase UI-3: 内部カードをレンダリングしてUnifiedCardWrapperで包む
  let inner: React.ReactNode = null;

  switch (card.type) {
    case 'inbox_summary':
      inner = (
        <InboxSummaryCard
          items={card.data.items || []}
          onSelectMessage={(id) => onAction?.('select_message', { id })}
        />
      );
      break;
    case 'message_detail':
      inner = (
        <MessageDetailCard
          message={card.data}
          onReply={() => onAction?.('reply', card.data)}
          onCreateJob={() => onAction?.('create_job', card.data)}
          onCreateTask={() => onAction?.('create_task', card.data)}
        />
      );
      break;
    case 'job_approval':
      inner = (
        <JobApprovalCard
          job={card.data}
          onApprove={(editedDraft?: string) => onAction?.('approve_job', { ...card.data, editedDraft })}
          onEdit={() => onAction?.('edit_job', card.data)}
          onReject={() => onAction?.('reject_job', card.data)}
        />
      );
      break;
    case 'reply_draft':
      inner = (
        <ReplyDraftCard
          reply={card.data}
          onApprove={(data) => onAction?.('send_reply', data)}
          onEdit={(data) => onAction?.('edit_reply', data)}
          onReject={() => onAction?.('reject_reply', card.data)}
        />
      );
      break;
    case 'task_created':
      inner = <TaskCreatedCard task={card.data} />;
      break;
    case 'task_resume':
      inner = (
        <TaskResumeCard
          task={card.data}
          onResume={(taskId) => onAction?.('resume_task', { taskId })}
        />
      );
      break;
    case 'task_form':
      inner = (
        <TaskFormCard
          data={card.data}
          onSubmit={(taskData) => onAction?.('submit_task_form', taskData)}
        />
      );
      break;
    case 'task_progress':
      inner = (
        <TaskProgressCard
          data={card.data}
          onResume={(taskId) => onAction?.('resume_task', { taskId })}
          onSendMessage={(taskId, message) => onAction?.('task_chat', { taskId, message, phase: card.data.phase || 'ideation' })}
        />
      );
      break;
    case 'navigate':
      inner = <NavigateCard nav={card.data} />;
      break;
    case 'action_result':
      inner = <ActionResultCard result={card.data} />;
      break;
    case 'briefing_summary':
      inner = <BriefingSummaryCard summary={card.data} />;
      break;
    case 'calendar_events':
      inner = <CalendarEventsCard calendar={card.data} />;
      break;
    case 'deadline_alert':
      inner = (
        <DeadlineAlertCard
          deadlines={card.data}
          onClickItem={(id, type) => onAction?.('click_deadline', { id, type })}
        />
      );
      break;
    case 'document_list':
      inner = (
        <DocumentListCard
          documents={card.data.documents || []}
          totalCount={card.data.totalCount || 0}
          onShare={(docId) => onAction?.('share_document', { docId })}
        />
      );
      break;
    case 'file_intake':
      inner = (
        <FileIntakeCard
          files={card.data.files || []}
          totalCount={card.data.totalCount || 0}
          onApprove={(fileId, overrides) => onAction?.('approve_file', { fileId, ...overrides })}
          onReject={(fileId) => onAction?.('reject_file', { fileId })}
          onApproveAll={() => onAction?.('approve_all_files', {})}
        />
      );
      break;
    case 'storage_confirmation':
      inner = (
        <StorageConfirmationCard
          data={card.data}
          onConfirm={(storeData) => onAction?.('confirm_storage', storeData)}
        />
      );
      break;
    case 'business_summary':
      inner = (
        <BusinessSummaryCard
          data={card.data}
        />
      );
      break;
    case 'business_event_form':
      inner = (
        <BusinessEventFormCard
          data={card.data}
          onCreate={(eventData) => onAction?.('create_business_event', eventData)}
          onCancel={() => onAction?.('cancel_event_creation', {})}
        />
      );
      break;
    case 'knowledge_proposal':
      inner = (
        <KnowledgeProposalCard
          data={card.data}
          onApprove={(proposalId) => onAction?.('approve_knowledge_proposal', { proposalId })}
          onReject={(proposalId) => onAction?.('reject_knowledge_proposal', { proposalId })}
        />
      );
      break;
    case 'org_recommendation':
      inner = (
        <OrgRecommendationCard
          data={card.data}
          onSetup={(candidate, rel) => onAction?.('create_org', { candidate, relationship: rel })}
          onSkip={(domain) => onAction?.('skip_org', { domain })}
        />
      );
      break;
    case 'contact_form':
      inner = (
        <ContactFormCard
          data={card.data}
          onSubmit={(contactData) => onAction?.('submit_contact_form', contactData)}
        />
      );
      break;
    case 'contact_search_result':
      inner = (
        <ContactSearchResultCard
          data={card.data}
        />
      );
      break;
    case 'org_form':
      inner = (
        <OrgFormCard
          data={card.data}
          onSubmit={(orgData) => onAction?.('submit_org_form', orgData)}
        />
      );
      break;
    case 'project_form':
      inner = (
        <ProjectFormCard
          data={card.data}
          onSubmit={(projData) => onAction?.('submit_project_form', projData)}
        />
      );
      break;
    case 'task_negotiation':
      inner = (
        <TaskNegotiationCard
          data={card.data}
          onGenerateAdjustment={(taskId) => onAction?.('generate_task_adjustment', { taskId })}
          onApplyAdjustment={(taskId, adjustment) => onAction?.('approve_task_adjustment', { taskId, adjustment })}
          onDismiss={(taskId) => onAction?.('dismiss_task_negotiation', { taskId })}
        />
      );
      break;
    case 'task_external_resource':
      inner = (
        <TaskExternalResourceCard
          data={card.data}
        />
      );
      break;
    case 'consultation_list':
      inner = (
        <ConsultationListCard
          consultations={card.data.consultations || []}
          onAnswer={(consultationId, answer) => onAction?.('answer_consultation', { consultationId, answer })}
        />
      );
      break;
    case 'action_selector':
      inner = (
        <ActionSelectorCard
          data={card.data}
          onSelect={(actionId) => onAction?.('select_action', { actionId })}
        />
      );
      break;
    case 'project_selector':
      inner = (
        <ProjectSelectorCard
          data={card.data}
          onSelect={(projectId) => onAction?.('select_project', {
            projectId,
            wizardAction: card.data?.wizardAction,
            suggestedTitle: card.data?.suggestedTitle,
            suggestedDescription: card.data?.suggestedDescription,
            suggestedPriority: card.data?.suggestedPriority,
            suggestedDueDate: card.data?.suggestedDueDate,
          })}
        />
      );
      break;
    case 'milestone_selector':
      inner = (
        <MilestoneSelectorCard
          data={card.data}
          onSelect={(milestoneId) => onAction?.('select_milestone', {
            milestoneId,
            wizardAction: card.data?.wizardAction,
            projectId: card.data?.projectId,
            suggestedTitle: card.data?.suggestedTitle,
            suggestedDescription: card.data?.suggestedDescription,
            suggestedPriority: card.data?.suggestedPriority,
            suggestedDueDate: card.data?.suggestedDueDate,
          })}
        />
      );
      break;
    case 'project_status_card':
      inner = (
        <ProjectStatusCard
          data={card.data}
          onAction={(actionId) => onAction?.(actionId, card.data)}
        />
      );
      break;
    case 'quick_status_overview':
      inner = (
        <QuickStatusOverview
          data={card.data}
          onSelectProject={(projectId) => onAction?.('select_project', { projectId })}
        />
      );
      break;
    case 'task_proposal':
      inner = (
        <TaskProposalCard
          data={card.data}
          onApprove={(payload) => onAction?.('approve_task_proposal', payload)}
          onDismiss={(suggestionId) => onAction?.('dismiss_task_proposal', { suggestionId })}
        />
      );
      break;
    default:
      return null;
  }

  // Phase UI-3: 統一カードラッパーで包む
  return (
    <UnifiedCardWrapper type={card.type} data={card.data}>
      {inner}
    </UnifiedCardWrapper>
  );
}

// ========================================
// ファイル格納確認カード（Phase 45b）
// ========================================
interface StorageConfirmationData {
  urls: Array<{ url: string; linkType: string; documentId: string; title?: string }>;
  rawMessage: string;
  organizations: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; organizationId: string }>;
}

function StorageConfirmationCard({
  data,
  onConfirm,
}: {
  data: StorageConfirmationData;
  onConfirm: (storeData: Record<string, unknown>) => void;
}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('その他');
  const [direction, setDirection] = useState<string>('submitted');
  const [yearMonth, setYearMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [isStored, setIsStored] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const DOCUMENT_TYPES = ['見積書', '契約書', '請求書', '発注書', '納品書', '仕様書', '議事録', '報告書', '提案書', '企画書', 'その他'];

  const filteredProjects = data.projects.filter(
    p => !selectedOrgId || p.organizationId === selectedOrgId
  );

  const handleConfirm = () => {
    setIsLoading(true);
    const urls = data.urls.filter(u => u.url);
    onConfirm({
      urls,
      organizationId: selectedOrgId || undefined,
      projectId: selectedProjectId || undefined,
      documentType,
      direction,
      yearMonth,
    });
    setTimeout(() => {
      setIsStored(true);
      setIsLoading(false);
    }, 500);
  };

  if (isStored) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Check className="w-5 h-5" />
          <span className="font-medium">格納完了</span>
        </div>
        <p className="text-sm text-green-600 dark:text-green-500 mt-1">
          {data.urls.filter(u => u.url).length}件のリンクを記録しました
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800">
        <div className="flex items-center gap-2">
          <FolderInput className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-medium text-blue-900 dark:text-blue-200">ファイル格納</h3>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* 検出URL表示 */}
        {data.urls.filter(u => u.url).length > 0 && (
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">検出URL</label>
            {data.urls.filter(u => u.url).map((u, i) => (
              <div key={i} className="flex items-center gap-2 mt-1 text-sm">
                <FileText className="w-4 h-4 text-gray-400" />
                <a href={u.url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate">
                  {u.url}
                </a>
                <span className="text-xs text-gray-400">({u.linkType})</span>
              </div>
            ))}
          </div>
        )}

        {/* 組織選択 */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">組織</label>
          <select
            value={selectedOrgId}
            onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedProjectId(''); }}
            className="w-full mt-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700"
          >
            <option value="">選択してください</option>
            {data.organizations.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* プロジェクト選択 */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">プロジェクト</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full mt-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700"
          >
            <option value="">選択してください</option>
            {filteredProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* 書類種別 + 方向 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">書類種別</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full mt-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700"
            >
              {DOCUMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">方向</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setDirection('submitted')}
                className={cn(
                  'flex-1 text-xs py-1.5 rounded border',
                  direction === 'submitted'
                    ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                )}
              >
                提出
              </button>
              <button
                onClick={() => setDirection('received')}
                className={cn(
                  'flex-1 text-xs py-1.5 rounded border',
                  direction === 'received'
                    ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                )}
              >
                受領
              </button>
            </div>
          </div>
        </div>

        {/* 年月 */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">年月</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-full mt-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700"
          />
        </div>

        {/* 格納ボタン */}
        <button
          onClick={handleConfirm}
          disabled={isLoading || data.urls.filter(u => u.url).length === 0}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
          格納する
        </button>
      </div>
    </div>
  );
}

// ========================================
// ビジネス活動要約カード（Phase 45c）
// ========================================
interface BusinessSummaryItem {
  id: string;
  projectId: string;
  projectName: string;
  period: string;
  content: string;
  eventDate: string;
}

function BusinessSummaryCard({
  data,
}: {
  data: { summaries: BusinessSummaryItem[] };
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!data.summaries || data.summaries.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
        活動要約はまだありません。毎週月曜日にAIが自動生成します。
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-medium text-indigo-900 dark:text-indigo-200">活動要約</h3>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {data.summaries.map((summary) => (
          <div key={summary.id} className="p-4">
            <button
              onClick={() => setExpandedId(expandedId === summary.id ? null : summary.id)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {summary.projectName}
                  </div>
                  {summary.period && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {summary.period}
                    </div>
                  )}
                </div>
                <ChevronDown className={cn(
                  'w-4 h-4 text-gray-400 transition-transform',
                  expandedId === summary.id && 'rotate-180'
                )} />
              </div>
            </button>
            {expandedId === summary.id && (
              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {summary.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// ビジネスイベント登録フォームカード
// ========================================
const EVENT_TYPES = [
  { key: 'meeting', label: '打ち合わせ', color: 'bg-blue-100 text-blue-700' },
  { key: 'call', label: '電話', color: 'bg-green-100 text-green-700' },
  { key: 'email', label: 'メール', color: 'bg-orange-100 text-orange-700' },
  { key: 'chat', label: 'チャット', color: 'bg-purple-100 text-purple-700' },
  { key: 'decision', label: '意思決定', color: 'bg-red-100 text-red-700' },
  { key: 'note', label: 'メモ', color: 'bg-slate-100 text-slate-600' },
];

interface BusinessEventFormData {
  suggestedTitle: string;
  suggestedType: string;
  suggestedContactIds: string[];
  projects: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string; companyName: string }>;
}

function BusinessEventFormCard({
  data,
  onCreate,
  onCancel,
}: {
  data: BusinessEventFormData;
  onCreate: (eventData: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(data.suggestedTitle || '');
  const [eventType, setEventType] = useState(data.suggestedType || 'note');
  const [projectId, setProjectId] = useState('');
  const [content, setContent] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>(data.suggestedContactIds || []);
  const [showContacts, setShowContacts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleContact = (id: string) => {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    setIsSubmitting(true);

    // 参加者の名前をコンテンツに追加
    let fullContent = content.trim();
    if (selectedContacts.length > 0) {
      const names = selectedContacts
        .map(id => data.contacts.find(c => c.id === id)?.name || id)
        .join(', ');
      fullContent = `【参加者】${names}\n\n${fullContent}`;
    }

    onCreate({
      title: title.trim(),
      content: fullContent || null,
      eventType,
      projectId: projectId || null,
      participants: selectedContacts,
    });
  };

  return (
    <div className="overflow-hidden">
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-900">ビジネスイベント登録</h3>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-blue-100 text-blue-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* イベント種別 */}
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">種別</label>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setEventType(t.key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                  eventType === t.key ? 'ring-2 ring-offset-1 ring-blue-400' : '',
                  t.color
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* タイトル */}
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例: A社との打ち合わせ"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* プロジェクト */}
        {data.projects.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">プロジェクト</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">選択しない</option>
              {data.projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* コンタクト（参加者） */}
        {(eventType === 'meeting' || eventType === 'call') && data.contacts.length > 0 && (
          <div>
            <button
              onClick={() => setShowContacts(!showContacts)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5 hover:text-slate-700"
            >
              参加者 {selectedContacts.length > 0 && `(${selectedContacts.length}名)`}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showContacts && 'rotate-180')} />
            </button>
            {showContacts && (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-slate-50 rounded-lg">
                {data.contacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleContact(c.id)}
                    className={cn(
                      'px-2 py-1 rounded-full text-xs transition-colors',
                      selectedContacts.includes(c.id)
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    )}
                  >
                    {c.name}{c.companyName ? ` (${c.companyName})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 内容 */}
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">内容（任意）</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="詳細やメモを記入..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* ボタン */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isSubmitting}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
              title.trim() && !isSubmitting
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            記録する
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// ナレッジ構造化提案カード（Phase 47）
// ========================================
interface KnowledgeProposalData {
  id: string;
  proposedStructure: {
    domains: {
      label: string;
      description: string;
      color: string;
      fields: {
        label: string;
        description: string;
        entries: { id: string; label: string; confidence: number }[];
      }[];
    }[];
  };
  clusteringConfidence: number;
  aiReasoning: string;
  entryCount: number;
  proposalWeek: string;
}

function KnowledgeProposalCard({
  data,
  onApprove,
  onReject,
}: {
  data: KnowledgeProposalData;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const confidencePercent = Math.round((data.clusteringConfidence || 0) * 100);
  const domains = data.proposedStructure?.domains || [];

  const handleApprove = () => {
    setIsProcessing(true);
    onApprove(data.id);
  };

  const handleReject = () => {
    setIsProcessing(true);
    onReject(data.id);
  };

  return (
    <div className="border-l-4 border-purple-400 bg-gradient-to-r from-purple-50 to-white rounded-lg p-4 shadow-sm">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h3 className="text-sm font-bold text-slate-800">
            ナレッジ構造化提案
          </h3>
          <span className="text-xs text-slate-500">({data.entryCount}個のキーワード)</span>
        </div>
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          confidencePercent >= 80 ? 'bg-green-100 text-green-700' :
          confidencePercent >= 60 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        )}>
          信頼度 {confidencePercent}%
        </span>
      </div>

      {/* 提案構造ツリー */}
      <div className="space-y-2 mb-3">
        {domains.map((domain, dIdx) => (
          <div key={dIdx} className="bg-white rounded-lg border border-slate-100 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', domain.color || 'bg-slate-100 text-slate-700')}>
                領域
              </span>
              <span className="text-sm font-semibold text-slate-800">{domain.label}</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">{domain.description}</p>
            {domain.fields.map((field, fIdx) => (
              <div key={fIdx} className="ml-4 mb-1.5">
                <div className="text-xs font-medium text-slate-600 mb-0.5">
                  ├ {field.label}
                </div>
                <div className="ml-4 flex flex-wrap gap-1">
                  {field.entries.slice(0, 5).map((entry, eIdx) => (
                    <span key={eIdx} className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                      {entry.label}
                    </span>
                  ))}
                  {field.entries.length > 5 && (
                    <span className="text-[10px] text-slate-400">
                      +{field.entries.length - 5}個
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* AI説明（折りたたみ） */}
      {data.aiReasoning && (
        <div className="mb-3">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="text-xs text-purple-600 hover:text-purple-800 transition-colors"
          >
            {showReasoning ? '▼' : '▶'} AI分析の説明
          </button>
          {showReasoning && (
            <p className="mt-1 text-xs text-slate-600 bg-purple-50 p-2 rounded border border-purple-100 whitespace-pre-wrap">
              {data.aiReasoning}
            </p>
          )}
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={isProcessing}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5',
            isProcessing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          )}
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          承認して適用
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            isProcessing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
          )}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ========================================
// 組織レコメンドカード（Phase 52）
// ========================================
interface OrgRecommendationData {
  candidates: Array<{
    domain: string;
    suggestedName: string;
    contactCount: number;
    messageCount: number;
    contactIds: string[];
    channels: Array<{ serviceName: string; channelId: string; channelName: string }>;
    suggestedRelationship: string;
    confidence: number;
  }>;
}

export function OrgRecommendationCard({
  data,
  onSetup,
  onSkip,
}: {
  data: OrgRecommendationData;
  onSetup: (candidate: OrgRecommendationData['candidates'][0], relationship: string) => void;
  onSkip: (domain: string) => void;
}) {
  const [relationships, setRelationships] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, 'created' | 'skipped'>>({});
  const [isBulk, setIsBulk] = useState(false);

  const pendingCandidates = data.candidates.filter(c => !done[c.domain]);

  const handleSetup = async (candidate: OrgRecommendationData['candidates'][0]) => {
    setProcessing(p => ({ ...p, [candidate.domain]: true }));
    const rel = relationships[candidate.domain] || candidate.suggestedRelationship;
    await onSetup(candidate, rel);
    setDone(d => ({ ...d, [candidate.domain]: 'created' }));
    setProcessing(p => ({ ...p, [candidate.domain]: false }));
  };

  const handleSkip = (domain: string) => {
    setDone(d => ({ ...d, [domain]: 'skipped' }));
    onSkip(domain);
  };

  const handleBulkSetup = async () => {
    setIsBulk(true);
    for (const c of pendingCandidates) {
      await handleSetup(c);
    }
    setIsBulk(false);
  };

  const relOptions = [
    { value: 'client', label: '取引先' },
    { value: 'partner', label: 'パートナー' },
    { value: 'vendor', label: '仕入先' },
    { value: 'prospect', label: '見込み客' },
  ];

  const channelIcon = (svc: string) => {
    if (svc === 'email') return '📧';
    if (svc === 'slack') return '#';
    if (svc === 'chatwork') return '💬';
    return '🔗';
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
        <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
          🏢 組織の登録をおすすめします
        </p>
        <p className="text-[10px] text-blue-600 mt-0.5">
          メッセージ履歴から未登録の組織を検出しました
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {data.candidates.map((c) => {
          const status = done[c.domain];
          const isProcessingThis = processing[c.domain];

          return (
            <div key={c.domain} className={cn(
              'px-4 py-3 transition-colors',
              status === 'created' && 'bg-green-50',
              status === 'skipped' && 'bg-slate-50 opacity-60',
            )}>
              {/* 組織名 + ドメイン */}
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-sm font-semibold text-slate-900">{c.suggestedName}</span>
                  <span className="text-[10px] text-slate-400 ml-2">({c.domain})</span>
                </div>
                {status === 'created' && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">作成済み</span>
                )}
                {status === 'skipped' && (
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">スキップ</span>
                )}
              </div>

              {/* 統計 */}
              <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-2">
                <span>👤 {c.contactCount}人</span>
                <span>📨 {c.messageCount}件のやり取り</span>
                {c.channels.length > 0 && (
                  <span>
                    {c.channels.map((ch, i) => (
                      <span key={i} className="mr-1">{channelIcon(ch.serviceName)}{ch.channelName}</span>
                    ))}
                  </span>
                )}
              </div>

              {/* アクション（未処理時のみ） */}
              {!status && (
                <div className="flex items-center gap-2">
                  <select
                    value={relationships[c.domain] || c.suggestedRelationship}
                    onChange={(e) => setRelationships(r => ({ ...r, [c.domain]: e.target.value }))}
                    className="text-[11px] px-2 py-1 border border-slate-200 rounded-md bg-white"
                  >
                    {relOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSetup(c)}
                    disabled={isProcessingThis || isBulk}
                    className={cn(
                      'text-[11px] px-3 py-1 rounded-md font-medium transition-colors',
                      isProcessingThis
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {isProcessingThis ? '作成中...' : '作成する'}
                  </button>
                  <button
                    onClick={() => handleSkip(c.domain)}
                    disabled={isProcessingThis || isBulk}
                    className="text-[11px] px-2 py-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    スキップ
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 一括作成ボタン */}
      {pendingCandidates.length >= 2 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
          <button
            onClick={handleBulkSetup}
            disabled={isBulk}
            className={cn(
              'w-full py-2 rounded-lg text-sm font-medium transition-colors',
              isBulk
                ? 'bg-slate-200 text-slate-400'
                : 'bg-green-600 text-white hover:bg-green-700'
            )}
          >
            {isBulk ? '一括作成中...' : `🔄 一括作成（${pendingCandidates.length}件）`}
          </button>
        </div>
      )}
    </div>
  );
}

// ========================================
// Phase 53c: コンタクト登録フォームカード
// ========================================
export function ContactFormCard({
  data,
  onSubmit,
}: {
  data: { suggestedName: string; organizations: Array<{ id: string; name: string }> };
  onSubmit: (contactData: Record<string, string>) => void;
}) {
  const [name, setName] = useState(data.suggestedName || '');
  const [companyName, setCompanyName] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relationshipType, setRelationshipType] = useState('client');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    onSubmit({ name, companyName, department, email, phone, relationshipType });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">👤</span>
        <h4 className="text-sm font-bold text-slate-800">コンタクト登録</h4>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">名前 *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="山田太郎" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">会社名</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="株式会社ABC" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">部署</label>
            <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="営業部" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">メール</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="taro@abc.co.jp" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">電話</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="03-1234-5678" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">関係性</label>
          <select value={relationshipType} onChange={e => setRelationshipType(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="client">取引先</option>
            <option value="partner">パートナー</option>
            <option value="internal">社内</option>
            <option value="prospect">見込み客</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            !name.trim() || isSubmitting
              ? 'bg-slate-200 text-slate-400'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isSubmitting ? '登録中...' : '✅ 登録する'}
        </button>
      </div>
    </div>
  );
}

// ========================================
// Phase 53c: コンタクト検索結果カード
// ========================================
export function ContactSearchResultCard({
  data,
}: {
  data: {
    contacts: Array<{
      id: string; name: string; companyName: string; department: string;
      relationshipType: string; channels: Array<{ channel: string; address: string }>;
    }>;
  };
}) {
  const relLabels: Record<string, string> = { client: '取引先', partner: 'パートナー', internal: '社内', prospect: '見込み客' };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔍</span>
        <h4 className="text-sm font-bold text-slate-800">コンタクト検索結果</h4>
      </div>
      <div className="space-y-3">
        {data.contacts.map(c => (
          <div key={c.id} className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-slate-800">{c.name}</span>
              {c.companyName && <span className="text-xs text-slate-500">{c.companyName}</span>}
              {c.department && <span className="text-xs text-slate-400">{c.department}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded',
                c.relationshipType === 'client' ? 'bg-blue-100 text-blue-700' :
                c.relationshipType === 'partner' ? 'bg-green-100 text-green-700' :
                c.relationshipType === 'internal' ? 'bg-purple-100 text-purple-700' :
                'bg-slate-100 text-slate-600'
              )}>
                {relLabels[c.relationshipType] || c.relationshipType}
              </span>
            </div>
            {c.channels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.channels.map((ch, i) => (
                  <span key={i} className="text-[11px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {ch.channel === 'email' ? '📧' : ch.channel === 'slack' ? '💬' : '💭'} {ch.address}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// Phase 53c: 組織作成フォームカード
// ========================================
export function OrgFormCard({
  data,
  onSubmit,
}: {
  data: { suggestedName: string; suggestedDomain: string };
  onSubmit: (orgData: Record<string, string>) => void;
}) {
  const [name, setName] = useState(data.suggestedName || '');
  const [domain, setDomain] = useState(data.suggestedDomain || '');
  const [relationshipType, setRelationshipType] = useState('client');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    onSubmit({ name, domain, relationshipType });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏢</span>
        <h4 className="text-sm font-bold text-slate-800">組織作成</h4>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">組織名 *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="株式会社ABC" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">ドメイン</label>
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="abc.co.jp" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">関係性</label>
          <select value={relationshipType} onChange={e => setRelationshipType(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="client">取引先</option>
            <option value="partner">パートナー</option>
            <option value="vendor">仕入先</option>
            <option value="prospect">見込み客</option>
            <option value="internal">自社</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            !name.trim() || isSubmitting
              ? 'bg-slate-200 text-slate-400'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isSubmitting ? '作成中...' : '✅ 作成する'}
        </button>
      </div>
    </div>
  );
}

// ========================================
// Phase 53c: プロジェクト作成フォームカード
// ========================================
export function ProjectFormCard({
  data,
  onSubmit,
}: {
  data: {
    suggestedName: string;
    organizations: Array<{ id: string; name: string }>;
  };
  onSubmit: (projData: Record<string, string>) => void;
}) {
  const [name, setName] = useState(data.suggestedName || '');
  const [organizationId, setOrganizationId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    onSubmit({ name, organizationId });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📂</span>
        <h4 className="text-sm font-bold text-slate-800">プロジェクト作成</h4>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">プロジェクト名 *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="新規プロジェクト" />
        </div>
        {data.organizations.length > 0 && (
          <div>
            <label className="block text-xs text-slate-500 mb-0.5">組織（任意）</label>
            <select value={organizationId} onChange={e => setOrganizationId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">組織を選択...</option>
              {data.organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            !name.trim() || isSubmitting
              ? 'bg-slate-200 text-slate-400'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isSubmitting ? '作成中...' : '✅ 作成する'}
        </button>
      </div>
    </div>
  );
}

// ========================================
// V3.0: アクション選択カード
// ========================================
interface ActionSelectorData {
  title: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
    icon: string;
  }>;
}

function ActionSelectorCard({ data, onSelect }: { data: ActionSelectorData; onSelect?: (actionId: string) => void }) {
  const iconMap: Record<string, React.ReactNode> = {
    task: <CheckSquare className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />,
    progress: <TrendingUp className="w-4 h-4" />,
    job: <Zap className="w-4 h-4" />,
    note: <FileText className="w-4 h-4" />,
  };
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-sm font-medium text-slate-800">{data.title}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {data.options.map(opt => (
          <button key={opt.id} onClick={() => onSelect?.(opt.id)}
            className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-left transition-colors">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              {iconMap[opt.icon] || <FileText className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.description}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ========================================
// V3.0: プロジェクト選択カード
// ========================================
interface ProjectSelectorData {
  title: string;
  projects: Array<{
    id: string;
    name: string;
    organizationName?: string;
    status?: string;
  }>;
}

function ProjectSelectorCard({ data, onSelect }: { data: ProjectSelectorData; onSelect?: (projectId: string) => void }) {
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-sm font-medium text-slate-800">{data.title}</p>
      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
        {data.projects.map(proj => (
          <button key={proj.id} onClick={() => onSelect?.(proj.id)}
            className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-left transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800">{proj.name}</div>
              {proj.organizationName && <div className="text-xs text-slate-400">{proj.organizationName}</div>}
            </div>
            {proj.status && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 shrink-0">{proj.status}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ========================================
// V3.0: マイルストーン選択カード
// ========================================
interface MilestoneSelectorData {
  title: string;
  milestones: Array<{
    id: string;
    title: string;
    status: string;
    targetDate?: string;
  }>;
  allowSkip?: boolean;
}

function MilestoneSelectorCard({ data, onSelect }: { data: MilestoneSelectorData; onSelect?: (milestoneId: string | null) => void }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: '未開始', color: 'bg-slate-100 text-slate-600' },
    in_progress: { label: '進行中', color: 'bg-blue-50 text-blue-600' },
    achieved: { label: '達成', color: 'bg-green-50 text-green-600' },
    missed: { label: '未達', color: 'bg-red-50 text-red-600' },
  };
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-sm font-medium text-slate-800">{data.title}</p>
      <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto">
        {data.milestones.map(ms => {
          const sc = statusConfig[ms.status] || statusConfig.pending;
          return (
            <button key={ms.id} onClick={() => onSelect?.(ms.id)}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-left transition-colors">
              <Calendar className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800">{ms.title}</div>
                {ms.targetDate && <div className="text-xs text-slate-400">{new Date(ms.targetDate).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</div>}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sc.color} shrink-0`}>{sc.label}</span>
            </button>
          );
        })}
        {data.allowSkip !== false && (
          <button onClick={() => onSelect?.(null)}
            className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-slate-300 hover:bg-slate-50 text-left transition-colors">
            <span className="text-xs text-slate-500">マイルストーンに紐づけない</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ========================================
// V3.0: タスク提案カード（会議録→承認→タスク作成）
// ========================================
interface TaskProposalItem {
  title: string;
  assignee: string;
  assigneeContactId?: string;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  relatedTopic: string;
}

interface TaskProposalData {
  suggestionId: string;
  meetingTitle: string;
  projectId: string;
  projectName: string;
  items: TaskProposalItem[];
  milestones: Array<{ id: string; title: string; status: string }>;
}

function TaskProposalCard({
  data,
  onApprove,
  onDismiss,
}: {
  data: TaskProposalData;
  onApprove?: (payload: {
    suggestionId: string;
    projectId: string;
    milestoneId: string;
    items: Array<{ title: string; priority: string; dueDate: string | null; assignee: string; assigneeContactId?: string }>;
  }) => void;
  onDismiss?: (suggestionId: string) => void;
}) {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(
    new Set(data.items.map((_, i) => i))
  );
  const [editedTitles, setEditedTitles] = useState<Record<number, string>>({});
  const [milestoneId, setMilestoneId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const toggleItem = (index: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleApprove = () => {
    if (submitting || selectedItems.size === 0) return;
    setSubmitting(true);
    const items = data.items
      .filter((_, i) => selectedItems.has(i))
      .map((item, _idx) => {
        const originalIdx = data.items.indexOf(item);
        return {
          title: editedTitles[originalIdx] || item.title,
          priority: item.priority,
          dueDate: item.dueDate,
          assignee: item.assignee,
          assigneeContactId: item.assigneeContactId,
        };
      });
    onApprove?.({
      suggestionId: data.suggestionId,
      projectId: data.projectId,
      milestoneId,
      items,
    });
    setSubmitted(true);
    setSubmitting(false);
  };

  const handleDismiss = () => {
    onDismiss?.(data.suggestionId);
    setDismissed(true);
  };

  if (dismissed) {
    return (
      <div className="px-4 py-3 text-sm text-nm-text-secondary">
        提案を却下しました
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-green-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          <span className="text-sm font-medium">{selectedItems.size}件のタスクを作成しました</span>
        </div>
      </div>
    );
  }

  const priorityLabel: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const priorityColor: Record<string, string> = {
    high: 'text-red-600 bg-red-50',
    medium: 'text-yellow-700 bg-yellow-50',
    low: 'text-slate-600 bg-slate-100',
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        <p className="text-sm font-medium text-nm-text">
          会議「{data.meetingTitle}」からの提案（{data.items.length}件）
        </p>
      </div>

      <div className="space-y-2">
        {data.items.map((item, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors ${
              selectedItems.has(i)
                ? 'border-blue-200 bg-blue-50/50'
                : 'border-slate-200 bg-slate-50 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedItems.has(i)}
              onChange={() => toggleItem(i)}
              className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={editedTitles[i] !== undefined ? editedTitles[i] : item.title}
                onChange={(e) => setEditedTitles(prev => ({ ...prev, [i]: e.target.value }))}
                className="w-full text-sm font-medium text-nm-text bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
              />
              <div className="flex items-center gap-2 mt-1 text-xs text-nm-text-secondary">
                {item.assignee && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {item.assignee}
                  </span>
                )}
                {item.dueDate && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {item.dueDate}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs ${priorityColor[item.priority] || ''}`}>
                  {priorityLabel[item.priority] || item.priority}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* マイルストーン選択 */}
      {data.milestones && data.milestones.length > 0 && (
        <div>
          <label className="text-xs text-nm-text-secondary block mb-1">マイルストーン（任意）</label>
          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">なし</option>
            {data.milestones.map(ms => (
              <option key={ms.id} value={ms.id}>{ms.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleApprove}
          disabled={submitting || selectedItems.size === 0}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? '作成中...' : `${selectedItems.size}件を承認してタスク作成`}
        </button>
        <button
          onClick={handleDismiss}
          className="px-4 py-2 text-sm text-nm-text-secondary border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          却下
        </button>
      </div>
    </div>
  );
}

// ========================================
// Phase E: タスク外部資料取り込みカード
// ========================================
interface TaskExternalResourceData {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    phase: string;
    projectId: string | null;
  }>;
  message: string;
}

function TaskExternalResourceCard({ data }: { data: TaskExternalResourceData }) {
  const statusLabel: Record<string, string> = {
    todo: '未着手',
    in_progress: '進行中',
  };
  const phaseLabel: Record<string, string> = {
    ideation: '構想',
    progress: '進行',
    result: '結果',
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-800">外部資料の取り込み</span>
        </div>
        <p className="text-xs text-indigo-600 mt-1">{data.message}</p>
      </div>

      <div className="divide-y divide-slate-100">
        {data.tasks.map(task => (
          <a
            key={task.id}
            href="/tasks"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{task.title}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400">
                  {statusLabel[task.status] || task.status}
                </span>
                <span className="text-[10px] text-slate-300">|</span>
                <span className="text-[10px] text-slate-400">
                  {phaseLabel[task.phase] || task.phase}フェーズ
                </span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </a>
        ))}
      </div>

      <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-400">
          📚 タスク詳細画面の「外部資料 → + 取り込み」からテキスト・ファイル・URLを追加できます
        </p>
      </div>
    </div>
  );
}

// ========================================
// v3.1: プロジェクトステータスカード
// ========================================
interface ProjectStatusCardData {
  projectId: string;
  projectName: string;
  organizationName?: string;
  milestones: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      targetDate: string;
    }>;
  };
  tasks: {
    total: number;
    done: number;
    progressPercent: number;
  };
  recentActivity: Array<{
    eventType: string;
    title: string;
    timestamp: string;
  }>;
}

function ProjectStatusCard({
  data,
  onAction,
}: {
  data: ProjectStatusCardData;
  onAction?: (action: string) => void;
}) {
  const eventTypeIcons: Record<string, string> = {
    meeting: '📅',
    message: '💬',
    task_completed: '✅',
    file_shared: '📄',
    milestone_achieved: '🏁',
    summary: '📊',
  };

  const msStatusDot = (status: string) => {
    switch (status) {
      case 'achieved': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'missed': return 'bg-red-500';
      default: return 'bg-slate-300';
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-nm-text">{data.projectName}</h3>
          {data.organizationName && (
            <p className="text-xs text-nm-text-muted">{data.organizationName}</p>
          )}
        </div>
      </div>

      {/* MS進捗 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-nm-text-secondary font-medium">マイルストーン</span>
          <span className="text-xs text-nm-text-muted">
            {data.milestones.completed}/{data.milestones.total} 完了
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {data.milestones.items.map((ms) => (
            <div
              key={ms.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 text-[10px]"
              title={`${ms.title} (${ms.status})`}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', msStatusDot(ms.status))} />
              <span className="text-nm-text-secondary truncate max-w-[100px]">{ms.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* タスク進捗バー */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-nm-text-secondary font-medium">タスク進捗</span>
          <span className="text-xs text-nm-text-muted">
            {data.tasks.done}/{data.tasks.total}（{data.tasks.progressPercent}%）
          </span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${data.tasks.progressPercent}%` }}
          />
        </div>
      </div>

      {/* 直近アクティビティ */}
      {data.recentActivity.length > 0 && (
        <div>
          <span className="text-xs text-nm-text-secondary font-medium">最近の動き</span>
          <div className="mt-1 space-y-1">
            {data.recentActivity.map((event, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span>{eventTypeIcons[event.eventType] || '📌'}</span>
                <span className="flex-1 text-nm-text-secondary truncate">{event.title}</span>
                <span className="text-nm-text-muted whitespace-nowrap">
                  {new Date(event.timestamp).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onAction?.('view_tasks')}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          タスク一覧
        </button>
        <button
          onClick={() => onAction?.('create_task_for_project')}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          タスク追加
        </button>
        <button
          onClick={() => onAction?.('create_milestone_for_project')}
          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          MS作成
        </button>
        <button
          onClick={() => onAction?.('view_detail')}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
        >
          詳細ページ
        </button>
      </div>
    </div>
  );
}

// ========================================
// v3.1: 全PJ進捗概要カード
// ========================================
interface QuickStatusOverviewData {
  projects: Array<{
    projectId: string;
    projectName: string;
    organizationName?: string;
    msTotal: number;
    msCompleted: number;
    msInProgress: number;
    taskTotal: number;
    taskDone: number;
    urgentCount: number;
  }>;
}

function QuickStatusOverview({
  data,
  onSelectProject,
}: {
  data: QuickStatusOverviewData;
  onSelectProject?: (projectId: string) => void;
}) {
  return (
    <div className="p-4 space-y-2">
      <h3 className="text-xs font-bold text-nm-text-secondary uppercase tracking-wider">プロジェクト進捗</h3>
      <div className="space-y-1">
        {data.projects.map((proj) => {
          const taskPercent = proj.taskTotal > 0 ? Math.round((proj.taskDone / proj.taskTotal) * 100) : 0;
          return (
            <button
              key={proj.projectId}
              onClick={() => onSelectProject?.(proj.projectId)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
            >
              {/* プロジェクト名 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-nm-text truncate group-hover:text-blue-600 transition-colors">
                  {proj.projectName}
                </p>
                {proj.organizationName && (
                  <p className="text-[10px] text-nm-text-muted">{proj.organizationName}</p>
                )}
              </div>

              {/* MS進捗 */}
              <div className="flex items-center gap-1 text-[10px] text-nm-text-muted">
                <span>MS</span>
                <span className="font-medium text-nm-text-secondary">{proj.msCompleted}/{proj.msTotal}</span>
              </div>

              {/* タスク進捗バー */}
              <div className="w-16">
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${taskPercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-nm-text-muted text-right mt-0.5">{taskPercent}%</p>
              </div>

              {/* 緊急 */}
              {proj.urgentCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 rounded-full">
                  {proj.urgentCount}件
                </span>
              )}

              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

