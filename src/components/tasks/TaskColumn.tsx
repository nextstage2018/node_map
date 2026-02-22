'use client';

// BugFix⑪: 非同期エラーハンドリング追加

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
}

export default function TaskColumn({
  status,
  tasks,
  selectedTaskId,
  onSelectTask,
  onQuickChat,
}: TaskColumnProps) {
  const config = TASK_STATUS_CONFIG[status];

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });

  // 未読カウント（最新メッセージがAIの返信であるタスク数）
  // BugFix⑪: conversations が undefined/null の場合の安全性追加
  const unreadCount = tasks.filter((t) => {
    const convos = t.conversations;
    if (!convos || convos.length === 0) return false;
    return convos[convos.length - 1].role === 'assistant';
  }).length;

  // BugFix⑪: onQuickChat のエラーハンドリングラッパー
  const handleQuickChat = onQuickChat
    ? async (taskId: string, message: string) => {
        try {
          await onQuickChat(taskId, message);
        } catch (error) {
          console.error('Quick chat error:', error);
          // エラーを握りつぶさず、UIには影響させない
        }
      }
    : undefined;

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] w-full">
      {/* カラムヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
        <h3 className="text-sm font-semibold text-slate-700">{config.label}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
        {unreadCount > 0 && (
          <span className="text-[10px] font-medium bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5" title="AIからの未読返信">
            🤖 {unreadCount}
          </span>
        )}
      </div>

      {/* タスクリスト（ドロップ対象） */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto space-y-2 px-1 rounded-lg py-1 min-h-[100px] transition-colors',
          isOver && 'bg-blue-50 ring-2 ring-blue-200 ring-dashed'
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-slate-300 text-sm">
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
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
