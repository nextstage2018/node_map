'use client';

import { Task } from '@/lib/types';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  onClick: () => void;
}

export default function TaskCard({ task, isSelected, onClick }: TaskCardProps) {
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm',
        isSelected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      {/* タイトル行 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
          {task.title}
        </h3>
        <span className="text-xs shrink-0">{priority.icon}</span>
      </div>

      {/* 説明 */}
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* タグ */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
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
        <span className="text-[10px] text-gray-400">
          {formatRelativeTime(task.updatedAt)}
        </span>
      </div>

      {/* 会話数 */}
      {task.conversations.length > 0 && (
        <div className="mt-1.5 text-[10px] text-gray-400">
          💬 {task.conversations.length}件の会話
        </div>
      )}
    </div>
  );
}
