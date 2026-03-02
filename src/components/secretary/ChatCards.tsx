// Phase A-1: 秘書AI会話内インラインカード
'use client';

import { useState } from 'react';
import {
  Mail, MessageSquare, Hash, Clock, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Loader2, Edit3, Send,
  Zap, CheckSquare, FileText, AlertCircle,
  Calendar, AlertTriangle, TrendingUp,
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
  | 'deadline_alert';     // 期限アラート

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
    default:
      return null;
  }
}
