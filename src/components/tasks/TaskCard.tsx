'use client';

import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
  onQuickChat?: (taskId: string, message: string) => Promise<void>;
}

export default function TaskCard({ task, isSelected, onClick, onQuickChat }: TaskCardProps) {
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];
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

  // 未読判定：最新メッセージがAIの場合は未読の可能性
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
        'p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:shadow-sm',
        isSelected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300',
        isDragging && 'shadow-lg ring-2 ring-blue-300'
      )}
    >
      {/* タイトル行 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-slate-900 leading-tight line-clamp-2">
          {task.title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {hasUnread && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="未読の返信あり" />
          )}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', priority.badgeColor)}>
            {priority.label}
          </span>
        </div>
      </div>

      {/* 説明 */}
      {task.description && !lastAiMessage && (
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* 最新AI発言プレビュー */}
      {lastAiMessage && (
        <div className="mb-2 p-1.5 rounded-md bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[9px] text-slate-400">🤖 AI</span>
            <span className="text-[9px] text-slate-300">
              {formatRelativeTime(lastAiMessage.timestamp)}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
            {lastAiMessage.content}
          </p>
        </div>
      )}

      {/* タグ */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* フッター */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            phase.color
          )}
        >
          {phase.icon} {phase.label}
        </span>
        <div className="flex items-center gap-1.5">
          {task.conversations.length > 0 && (
            <span className="text-[10px] text-slate-400">
              💬 {task.conversations.length}
            </span>
          )}
          <span className="text-[10px] text-slate-400">
            {formatRelativeTime(task.updatedAt)}
          </span>
        </div>
      </div>

      {/* インライン入力フィールド（カードを開かずにAIに話しかける） */}
      {task.status !== 'done' && (
        <form
          onSubmit={handleQuickSend}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 flex gap-1"
        >
          <input
            ref={inputRef}
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="AIにひとこと..."
            disabled={isSending}
            className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-slate-200 rounded-md bg-white
              focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400
              placeholder:text-slate-300 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!quickInput.trim() || isSending}
            className="shrink-0 px-2 py-1 text-[10px] font-medium rounded-md
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
