// Phase A-1: 秘書AI会話内インラインカード
'use client';

import { useState } from 'react';
import {
  Mail, MessageSquare, Hash, Clock, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Loader2, Edit3,
  Zap, CheckSquare, FileText, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ========================================
// カード共通の型定義
// ========================================

// 秘書AIが返すカードの種類
export type CardType =
  | 'inbox_summary'    // メッセージ要約一覧
  | 'message_detail'   // 個別メッセージ詳細
  | 'job_approval'     // ジョブ承認カード
  | 'task_created'     // タスク作成完了
  | 'task_resume'      // タスク再開提案
  | 'navigate'         // 画面遷移カード
  | 'action_result';   // アクション実行結果

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
// ジョブ承認カード
// ========================================
interface JobApprovalData {
  id: string;
  title: string;
  type: string;
  draft: string;        // AI下書き（送信文面など）
  targetName?: string;  // 送信先名
}

export function JobApprovalCard({
  job,
  onApprove,
  onEdit,
  onReject,
}: {
  job: JobApprovalData;
  onApprove?: () => void;
  onEdit?: () => void;
  onReject?: () => void;
}) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    await onApprove?.();
    setStatus('approved');
    setIsProcessing(false);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onReject?.();
    setStatus('rejected');
    setIsProcessing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm my-2">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-semibold text-amber-800">{job.title}</span>
        {job.targetName && (
          <span className="text-[10px] text-amber-600">→ {job.targetName}</span>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
          {job.draft}
        </p>
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
              onClick={onEdit}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5"
            >
              <Edit3 className="w-3 h-3" /> 修正する
            </button>
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-3 h-3" /> 却下
            </button>
          </>
        ) : status === 'approved' ? (
          <span className="text-xs text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 承認済み — 実行中
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
          onApprove={() => onAction?.('approve_job', card.data)}
          onEdit={() => onAction?.('edit_job', card.data)}
          onReject={() => onAction?.('reject_job', card.data)}
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
    default:
      return null;
  }
}
