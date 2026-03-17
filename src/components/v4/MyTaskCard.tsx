// v4.0: 個人タスクカード（D&D対応）
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { MessageSquare, Bot, Calendar } from 'lucide-react';

export interface MyTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  phase: string;
  task_type: string;
  due_date?: string;
  source_type?: string;
  project_id?: string;
  project_name?: string;
  milestone_title?: string;
  theme_title?: string;
  assigned_contact_id?: string;
  assignee_name?: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  // フェードアウト用
  isFading?: boolean;
}

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

function getSourceIcon(sourceType?: string) {
  if (sourceType === 'slack' || sourceType === 'chatwork') {
    return <Bot className="w-3 h-3 text-indigo-400" title="Bot作成" />;
  }
  if (sourceType === 'meeting_record') {
    return <MessageSquare className="w-3 h-3 text-blue-400" title="会議録から" />;
  }
  return null;
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

interface MyTaskCardProps {
  task: MyTask;
  onComplete?: (taskId: string) => void;
  onClick?: (taskId: string) => void;
}

export default function MyTaskCard({ task, onComplete, onClick }: MyTaskCardProps) {
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
  const sourceIcon = getSourceIcon(task.source_type);

  // パンくず生成
  const breadcrumbs: string[] = [];
  if (task.project_name) breadcrumbs.push(task.project_name);
  if (task.theme_title) breadcrumbs.push(task.theme_title);
  if (task.milestone_title) breadcrumbs.push(task.milestone_title);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task.id)}
      className={cn(
        'rounded-lg border bg-white cursor-grab active:cursor-grabbing transition-all duration-300',
        'hover:shadow-md',
        onClick && 'cursor-pointer',
        task.status === 'done' && 'opacity-60',
        task.isFading && 'transition-opacity duration-1000',
        isDragging ? 'shadow-xl ring-2 ring-blue-300 z-50' : 'border-nm-border hover:border-slate-300',
      )}
    >
      <div className="p-3">
        {/* 上段: パンくず + ソースアイコン */}
        {(breadcrumbs.length > 0 || sourceIcon) && (
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] text-nm-text-secondary truncate">
              {breadcrumbs.join(' > ')}
            </span>
            {sourceIcon}
          </div>
        )}

        {/* タスク名 */}
        <div className="flex items-start gap-2">
          {/* 完了チェックボックス */}
          {task.status !== 'done' && onComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onComplete(task.id);
              }}
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

        {/* 下段: 優先度 + 期限 */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium)} />
            <span className="text-[10px] text-slate-400 capitalize">{task.priority}</span>
          </div>
          {dueInfo && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', dueInfo.color, dueInfo.bgColor)}>
              <Calendar className="w-3 h-3 inline mr-0.5 -mt-0.5" />
              {dueInfo.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
