'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/lib/types';
import { TASK_STATUS_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
import TaskCard from './TaskCard';

interface TaskColumnProps {
  status: TaskStatus;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
  onQuickChat?: (taskId: string, message: string) => Promise<void>;
  onApprove?: (taskId: string) => Promise<void>;
  onReject?: (taskId: string) => Promise<void>;
}

export default function TaskColumn({
  status,
  tasks,
  selectedTaskId,
  onSelectTask,
  onQuickChat,
  onApprove,
  onReject,
}: TaskColumnProps) {
  const config = TASK_STATUS_CONFIG[status];

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });

  // 未読カウント
  const unreadCount = tasks.filter((t) => {
    const convos = t.conversations;
    if (!convos || convos.length === 0) return false;
    return convos[convos.length - 1].role === 'assistant';
  }).length;

  const handleQuickChat = onQuickChat
    ? async (taskId: string, message: string) => {
        try {
          await onQuickChat(taskId, message);
        } catch (error) {
          console.error('Quick chat error:', error);
        }
      }
    : undefined;

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] w-full">
      {/* カラムヘッダー */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 mb-3">
        <div className={cn('w-2.5 h-2.5 rounded-full', config.dotColor)} />
        <h3 className="text-sm font-bold text-slate-700 tracking-wide">{config.label}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 font-medium">
          {tasks.length}
        </span>
        {unreadCount > 0 && (
          <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 rounded-full px-2 py-0.5" title="AIからの未読返信">
            AI {unreadCount}
          </span>
        )}
      </div>

      {/* タスクリスト */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto space-y-2.5 px-1 rounded-xl py-1 min-h-[100px] transition-all duration-200',
          isOver && 'bg-blue-50/80 ring-2 ring-blue-200 ring-dashed shadow-inner'
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-slate-300 text-sm">
              <div className="text-2xl mb-2 opacity-40">📋</div>
              タスクがありません
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                onClick={() => onSelectTask(task)}
                onQuickChat={handleQuickChat}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
