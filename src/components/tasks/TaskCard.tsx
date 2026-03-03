'use client';

import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';

const CATEGORY_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  routine: { label: '定型', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  team: { label: 'チーム', bg: 'bg-violet-50', text: 'text-violet-600' },
  individual: { label: '個別', bg: 'bg-slate-50', text: 'text-slate-500' },
};

function formatDueDate(dateStr?: string): { label: string; color: string } | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = `${due.getMonth() + 1}/${due.getDate()}`;
  if (diff < 0) return { label: `${label} (超過)`, color: 'text-red-500' };
  if (diff === 0) return { label: `${label} (今日)`, color: 'text-amber-600' };
  if (diff <= 3) return { label, color: 'text-amber-500' };
  return { label, color: 'text-slate-400' };
}

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  onQuickChat?: (taskId: string, message: string) => Promise<void>;
  onApprove?: (taskId: string) => Promise<void>;
  onReject?: (taskId: string) => Promise<void>;
}

export default function TaskCard({ task, isSelected, onClick, onQuickChat, onApprove, onReject }: TaskCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];
  const category = CATEGORY_STYLE[task.taskCategory || 'individual'];
  const dueInfo = formatDueDate(task.dueDate);
  const [quickInput, setQuickInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 最新のAI発言を取得
  const lastAiMessage = [...task.conversations]
    .reverse()
    .find((c) => c.role === 'assistant');

  // 未読判定
  const hasUnread = lastAiMessage && task.conversations.length > 0 &&
    task.conversations[task.conversations.length - 1].role === 'assistant';

  // クイック送信
  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quickInput.trim() || isSending || !onQuickChat) return;
    setIsSending(true);
    try {
      await onQuickChat(task.id, quickInput.trim());
      setQuickInput('');
    } catch {
      // エラー処理
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'rounded-xl border cursor-grab active:cursor-grabbing transition-all group',
        isSelected
          ? 'border-blue-400 bg-blue-50/60 shadow-md ring-1 ring-blue-200'
          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm',
        isDragging && 'shadow-xl ring-2 ring-blue-300'
      )}
    >
      {/* 上部: プロジェクト名 + カテゴリ */}
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.projectName && (
            <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md truncate max-w-[140px] font-medium">
              {task.projectName}
            </span>
          )}
          {task.organizationName && !task.projectName && (
            <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
              {task.organizationName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasUnread && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="未読の返信あり" />
          )}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold', priority.badgeColor)}>
            {priority.label}
          </span>
        </div>
      </div>

      {/* タイトル */}
      <div className="px-3 pb-1.5">
        <h3 className="text-[13px] font-semibold text-slate-800 leading-snug line-clamp-2">
          {task.title}
        </h3>
      </div>

      {/* 説明 or 最新AI発言 */}
      {lastAiMessage ? (
        <div className="mx-3 mb-2 p-2 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-100">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-slate-400 font-medium">AI</span>
            <span className="text-[9px] text-slate-300">
              {formatRelativeTime(lastAiMessage.timestamp)}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
            {lastAiMessage.content}
          </p>
        </div>
      ) : task.description ? (
        <p className="px-3 text-[11px] text-slate-500 mb-2 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      ) : null}

      {/* タグ */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* フッター */}
      <div className="px-3 pb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', phase.color)}>
            {phase.icon} {phase.label}
          </span>
          <span className={cn('text-[10px] px-1 py-0.5 rounded-md', category.bg, category.text)}>
            {category.label}
          </span>
          {task.recurrenceType && (
            <span className="text-[10px] text-slate-400" title={`繰り返し: ${task.recurrenceType}`}>🔄</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {dueInfo && (
            <span className={cn('text-[10px] font-medium', dueInfo.color)}>
              📅 {dueInfo.label}
            </span>
          )}
          {task.estimatedHours && (
            <span className="text-[10px] text-slate-400">⏱{task.estimatedHours}h</span>
          )}
          {task.childTasks && task.childTasks.length > 0 && (
            <span className="text-[10px] text-slate-500 font-medium" title={`子タスク ${task.childTasks.filter(c => c.status === 'done').length}/${task.childTasks.length} 完了`}>
              📎 {task.childTasks.filter(c => c.status === 'done').length}/{task.childTasks.length}
            </span>
          )}
          {task.conversations.length > 0 && (
            <span className="text-[10px] text-slate-400">
              💬 {task.conversations.length}
            </span>
          )}
          <span className="text-[10px] text-slate-300">
            {formatRelativeTime(task.updatedAt)}
          </span>
        </div>
      </div>

      {/* 提案中: 承認/却下ボタン */}
      {task.status === 'proposed' && onApprove && onReject && (
        <div
          className="mx-3 mb-2 flex gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={async (e) => {
              e.stopPropagation();
              setIsApproving(true);
              try { await onApprove(task.id); } finally { setIsApproving(false); }
            }}
            disabled={isApproving}
            className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
          >
            ✓ 承認
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              setIsApproving(true);
              try { await onReject(task.id); } finally { setIsApproving(false); }
            }}
            disabled={isApproving}
            className="flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
          >
            ✕ 却下
          </button>
        </div>
      )}

      {/* インライン入力 */}
      {task.status !== 'done' && task.status !== 'proposed' && (
        <form
          onSubmit={handleQuickSend}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mx-3 mb-2.5 flex gap-1"
        >
          <input
            ref={inputRef}
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="AIにひとこと..."
            disabled={isSending}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-slate-50/50
              focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 focus:bg-white
              placeholder:text-slate-300 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!quickInput.trim() || isSending}
            className="shrink-0 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg
              bg-blue-600 text-white hover:bg-blue-700
              disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
          >
            {isSending ? '...' : '送信'}
          </button>
        </form>
      )}
    </div>
  );
}
