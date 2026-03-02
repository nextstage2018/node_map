// Phase A-1: 秘書AI会話内インラインカード
'use client';

import { useState } from 'react';
import {
  Mail, MessageSquare, Hash, Clock, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Loader2, Edit3, Send,
  Zap, CheckSquare, FileText, AlertCircle,
  Calendar, AlertTriangle, TrendingUp,
  FolderInput, Check, X, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  | 'business_summary';   // ビジネス活動要約

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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm my-2">
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
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm my-2">
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
        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </p>
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm my-2">
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
    <div className="bg-white rounded-xl border border-green-200 overflow-hidden shadow-sm my-2">
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
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm my-2">
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
      className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 my-2 hover:bg-slate-50 transition-colors shadow-sm"
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
      'rounded-xl border px-4 py-3 my-2 flex items-start gap-3 shadow-sm',
      result.success
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
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
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm my-2">
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
  pendingJobCount: number;
  todayEventCount: number;
  pendingFileCount?: number;  // 未確認ファイル数
  nextEvent?: {           // 次の予定
    title: string;
    time: string;         // "10:00〜11:00"
    minutesUntil?: number;
  };
}

export function BriefingSummaryCard({ summary }: { summary: BriefingSummaryData }) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 overflow-hidden shadow-sm my-2">
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
    <div className="bg-white rounded-xl border border-purple-200 overflow-hidden shadow-sm my-2">
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
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm my-2">
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm my-2">
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
// カードレンダラー（型に応じて適切なカードを表示）
// ========================================
export function CardRenderer({
  card,
  onAction,
}: {
  card: CardData;
  onAction?: (action: string, data: unknown) => void;
}) {
  switch (card.type) {
    case 'inbox_summary':
      return (
        <InboxSummaryCard
          items={card.data.items || []}
          onSelectMessage={(id) => onAction?.('select_message', { id })}
        />
      );
    case 'message_detail':
      return (
        <MessageDetailCard
          message={card.data}
          onReply={() => onAction?.('reply', card.data)}
          onCreateJob={() => onAction?.('create_job', card.data)}
          onCreateTask={() => onAction?.('create_task', card.data)}
        />
      );
    case 'job_approval':
      return (
        <JobApprovalCard
          job={card.data}
          onApprove={(editedDraft?: string) => onAction?.('approve_job', { ...card.data, editedDraft })}
          onEdit={() => onAction?.('edit_job', card.data)}
          onReject={() => onAction?.('reject_job', card.data)}
        />
      );
    case 'reply_draft':
      return (
        <ReplyDraftCard
          reply={card.data}
          onApprove={(data) => onAction?.('send_reply', data)}
          onEdit={(data) => onAction?.('edit_reply', data)}
          onReject={() => onAction?.('reject_reply', card.data)}
        />
      );
    case 'task_created':
      return <TaskCreatedCard task={card.data} />;
    case 'task_resume':
      return (
        <TaskResumeCard
          task={card.data}
          onResume={(taskId) => onAction?.('resume_task', { taskId })}
        />
      );
    case 'navigate':
      return <NavigateCard nav={card.data} />;
    case 'action_result':
      return <ActionResultCard result={card.data} />;
    case 'briefing_summary':
      return <BriefingSummaryCard summary={card.data} />;
    case 'calendar_events':
      return <CalendarEventsCard calendar={card.data} />;
    case 'deadline_alert':
      return (
        <DeadlineAlertCard
          deadlines={card.data}
          onClickItem={(id, type) => onAction?.('click_deadline', { id, type })}
        />
      );
    case 'document_list':
      return (
        <DocumentListCard
          documents={card.data.documents || []}
          totalCount={card.data.totalCount || 0}
          onShare={(docId) => onAction?.('share_document', { docId })}
        />
      );
    case 'file_intake':
      return (
        <FileIntakeCard
          files={card.data.files || []}
          totalCount={card.data.totalCount || 0}
          onApprove={(fileId, overrides) => onAction?.('approve_file', { fileId, ...overrides })}
          onReject={(fileId) => onAction?.('reject_file', { fileId })}
          onApproveAll={() => onAction?.('approve_all_files', {})}
        />
      );
    case 'storage_confirmation':
      return (
        <StorageConfirmationCard
          data={card.data}
          onConfirm={(storeData) => onAction?.('confirm_storage', storeData)}
        />
      );
    case 'business_summary':
      return (
        <BusinessSummaryCard
          data={card.data}
        />
      );
    default:
      return null;
  }
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
