'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task } from '@/lib/types';
import { TASK_PHASE_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** フェーズバッジの配色（構想=blue, 進行=amber, 結果=green） */
const PHASE_BADGE_COLOR: Record<string, string> = {
  ideation: 'text-blue-600 bg-blue-50 border-blue-200',
  progress: 'text-amber-600 bg-amber-50 border-amber-200',
  result: 'text-green-600 bg-green-50 border-green-200',
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
  return { label, color: 'text-nm-text-light' };
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
  const phase = TASK_PHASE_CONFIG[task.phase];
  const phaseBadge = PHASE_BADGE_COLOR[task.phase] || 'text-nm-text-light bg-slate-50 border-nm-border';
  const dueInfo = formatDueDate(task.dueDate);

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

  // 未読判定（最後のメッセージがAIなら未読扱い）
  const hasUnread = task.conversations.length > 0 &&
    task.conversations[task.conversations.length - 1].role === 'assistant';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'rounded-xl border cursor-grab active:cursor-grabbing transition-all',
        'bg-white shadow-nm-sm hover:shadow-nm-md',
        isSelected
          ? 'border-nm-accent ring-1 ring-blue-200'
          : 'border-nm-border hover:border-slate-300',
        isDragging && 'shadow-xl ring-2 ring-blue-300'
      )}
    >
      {/* プロジェクト名 */}
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between gap-1">
        <div className="min-w-0 truncate">
          {task.projectName ? (
            <span className="text-[10px] text-nm-accent font-medium truncate">
              {task.projectName}
            </span>
          ) : task.organizationName ? (
            <span className="text-[10px] text-nm-text-light truncate">
              {task.organizationName}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUnread && (
            <span className="w-2 h-2 rounded-full bg-nm-accent animate-pulse" title="未読の返信あり" />
          )}
        </div>
      </div>

      {/* タスク名 */}
      <div className="px-3 pb-2">
        <h3 className="text-[13px] font-semibold text-nm-text leading-snug line-clamp-2">
          {task.title}
        </h3>
      </div>

      {/* フッター: フェーズバッジ + 期限 */}
      <div className="px-3 pb-2.5 flex items-center justify-between">
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full font-medium border',
          phaseBadge
        )}>
          {phase.label}
        </span>
        <div className="flex items-center gap-2">
          {dueInfo && (
            <span className={cn('text-[10px] font-medium', dueInfo.color)}>
              {dueInfo.label}
            </span>
          )}
          {task.conversations.length > 0 && (
            <span className="text-[10px] text-nm-text-light">
              {task.conversations.length}件
            </span>
          )}
        </div>
      </div>

      {/* 提案中: 承認/却下ボタン */}
      {task.status === 'proposed' && onApprove && onReject && (
        <div
          className="mx-3 mb-2.5 flex gap-1.5"
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
            承認
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              setIsApproving(true);
              try { await onReject(task.id); } finally { setIsApproving(false); }
            }}
            disabled={isApproving}
            className="py-1.5 px-3 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
          >
            却下
          </button>
        </div>
      )}
    </div>
  );
}
