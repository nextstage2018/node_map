'use client';

import type { Task } from '@/lib/types';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
import Image from 'next/image';

interface DateColumnProps {
  label: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  isPast?: boolean;
  isUndated?: boolean;
}

export default function DateColumn({
  label,
  tasks,
  selectedTaskId,
  onSelectTask,
  isPast = false,
  isUndated = false,
}: DateColumnProps) {
  const headerColor = isPast
    ? 'text-red-600'
    : isUndated
    ? 'text-slate-400'
    : label === '今日'
    ? 'text-blue-600'
    : 'text-slate-700';

  const headerBg = label === '今日' ? 'bg-blue-50' : 'bg-slate-50';

  return (
    <div className="flex flex-col min-w-[240px] max-w-[280px]">
      {/* カラムヘッダー */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${headerBg}`}>
        <h3 className={`text-sm font-medium ${headerColor}`}>{label}</h3>
        <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      {/* タスクリスト */}
      <div className="flex-1 space-y-2 p-2 bg-slate-50/50 rounded-b-lg border border-slate-100 min-h-[100px]">
        {tasks.length === 0 ? (
          <p className="text-xs text-slate-300 text-center py-6">タスクなし</p>
        ) : (
          tasks.map((task) => {
            const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
            const phaseConfig = TASK_PHASE_CONFIG[task.phase];
            const isSelected = task.id === selectedTaskId;

            return (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors
                  ${isSelected
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
              >
                {/* タイトル */}
                <h4 className="text-sm font-medium text-slate-900 line-clamp-1">
                  {task.title}
                </h4>

                {/* メタ */}
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${priorityConfig.color}`}>
                    {priorityConfig.label}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${phaseConfig.color}`}>
                    <Image
                      src={phaseConfig.icon}
                      alt={phaseConfig.label}
                      width={10}
                      height={10}
                    />
                    {phaseConfig.label}
                  </span>
                </div>

                {/* 説明 */}
                {task.description && (
                  <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                    {task.description}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
