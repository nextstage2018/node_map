// v4.0: カンバンボード ステージ列コンポーネント（共用）
'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export interface StageConfig {
  id: string;
  label: string;
  dotColor: string;
  emptyIcon: string;
  emptyText: string;
}

export const STAGE_CONFIGS: Record<string, StageConfig> = {
  ai_proposal: {
    id: 'ai_proposal',
    label: 'AI提案',
    dotColor: 'bg-indigo-400',
    emptyIcon: '🤖',
    emptyText: 'AI提案はありません',
  },
  todo: {
    id: 'todo',
    label: '着手前',
    dotColor: 'bg-slate-400',
    emptyIcon: '📋',
    emptyText: 'タスクがありません',
  },
  in_progress: {
    id: 'in_progress',
    label: '進行中',
    dotColor: 'bg-blue-400',
    emptyIcon: '🔄',
    emptyText: 'タスクがありません',
  },
  done: {
    id: 'done',
    label: '完了',
    dotColor: 'bg-green-400',
    emptyIcon: '✅',
    emptyText: '完了タスクはありません',
  },
};

interface TaskStageColumnProps {
  stageId: string;
  itemIds: string[];
  count: number;
  children: ReactNode;
  headerExtra?: ReactNode;
}

export default function TaskStageColumn({
  stageId,
  itemIds,
  count,
  children,
  headerExtra,
}: TaskStageColumnProps) {
  const config = STAGE_CONFIGS[stageId] || STAGE_CONFIGS.todo;

  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stageId}`,
    data: { type: 'stage', stageId },
  });

  return (
    <div className={cn(
      'flex flex-col min-w-[280px] w-[300px] shrink-0',
      stageId === 'ai_proposal' && 'bg-indigo-50/30 rounded-xl'
    )}>
      {/* カラムヘッダー */}
      <div className="flex items-center gap-2 px-3 py-3 mb-1">
        <div className={cn('w-2.5 h-2.5 rounded-full', config.dotColor)} />
        <h3 className="text-sm font-bold text-slate-700">{config.label}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 font-medium">
          {count}
        </span>
        {headerExtra}
      </div>

      {/* ドロップゾーン */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto space-y-2 px-2 pb-2 rounded-xl min-h-[120px] transition-all duration-200',
          isOver && 'bg-blue-50/80 ring-2 ring-blue-200 ring-dashed shadow-inner'
        )}
      >
        <SortableContext
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {count === 0 ? (
            <div className="text-center py-10 text-slate-300 text-sm">
              <div className="text-2xl mb-2 opacity-40">{config.emptyIcon}</div>
              {config.emptyText}
            </div>
          ) : (
            children
          )}
        </SortableContext>
      </div>
    </div>
  );
}
