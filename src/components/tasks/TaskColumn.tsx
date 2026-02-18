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
}

export default function TaskColumn({
  status,
  tasks,
  selectedTaskId,
  onSelectTask,
}: TaskColumnProps) {
  const config = TASK_STATUS_CONFIG[status];

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status },
  });

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] w-full">
      {/* カラムヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
        <h3 className="text-sm font-semibold text-gray-700">{config.label}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {tasks.length}
        </span>
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
            <div className="text-center py-8 text-gray-300 text-sm">
              タスクがありません
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={task.id === selectedTaskId}
                onClick={() => onSelectTask(task)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
