// v4.0: チームタスクカード（担当者表示付きD&D対応）
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Calendar, User, Trash2, Briefcase } from 'lucide-react';
import type { MyTask } from './MyTaskCard';

function formatDueDate(dateStr?: string): { label: string; color: string; bgColor: string } | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = `${due.getMonth() + 1}/${due.getDate()}`;
  if (diff < 0) return { label: `${label} (${Math.abs(diff)}日超過)`, color: 'text-red-600', bgColor: 'bg-red-50' };
  if (diff === 0) return { label: `${label} (今日)`, color: 'text-amber-600', bgColor: 'bg-amber-50' };
  if (diff <= 3) return { label: `${label} (${diff}日後)`, color: 'text-amber-500', bgColor: 'bg-amber-50' };
  return { label, color: 'text-slate-500', bgColor: 'bg-slate-50' };
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

interface TeamTaskCardProps {
  task: MyTask;
  onComplete?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onClick?: (taskId: string) => void;
}

export default function TeamTaskCard({ task, onComplete, onDelete, onClick }: TeamTaskCardProps) {
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
    opacity: isDragging ? 0.5 : task.isFading ? 0 : 1,
  };

  const dueInfo = formatDueDate(task.due_date);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task.id)}
      className={cn(
        'rounded-lg border bg-white cursor-grab active:cursor-grabbing transition-all duration-300 group',
        'hover:shadow-md',
        onClick && 'cursor-pointer',
        task.status === 'done' && 'opacity-60',
        task.isFading && 'transition-opacity duration-1000',
        isDragging ? 'shadow-xl ring-2 ring-blue-300 z-50' : 'border-nm-border hover:border-slate-300',
      )}
    >
      <div className="p-3">
        {/* プロジェクト名 + パンくず */}
        {(task.project_name || task.theme_title || task.milestone_title) && (
          <div className="flex items-center gap-1 text-[10px] text-nm-text-secondary truncate mb-1">
            {task.project_name && (
              <span className="inline-flex items-center gap-0.5 text-slate-500">
                <Briefcase className="w-2.5 h-2.5" />
                {task.project_name}
              </span>
            )}
            {task.project_name && task.milestone_title && <span className="text-slate-300">›</span>}
            {[task.theme_title, task.milestone_title].filter(Boolean).join(' > ')}
          </div>
        )}

        {/* タスク名 */}
        <div className="flex items-start gap-2">
          {task.status !== 'done' && onComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onComplete(task.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors shrink-0"
              title="完了にする"
            />
          )}
          {task.status === 'done' && (
            <div className="mt-0.5 w-4 h-4 rounded bg-green-500 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <h4 className={cn(
            'text-sm font-medium text-nm-text leading-snug line-clamp-2',
            task.status === 'done' && 'line-through text-slate-400'
          )}>
            {task.title}
          </h4>
        </div>

        {/* 下段: 担当者 + 優先度 + 期限 + 削除 */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {/* 担当者（常に表示、未設定時は「自分」） */}
            <span className="flex items-center gap-0.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              <User className="w-3 h-3" />
              {task.assignee_name || '自分'}
            </span>
            {/* 優先度 */}
            <div className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium)} />
          </div>
          <div className="flex items-center gap-1.5">
            {dueInfo && (
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', dueInfo.color, dueInfo.bgColor)}>
                <Calendar className="w-3 h-3 inline mr-0.5 -mt-0.5" />
                {dueInfo.label}
              </span>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(task.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-all"
                title="タスクを削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
