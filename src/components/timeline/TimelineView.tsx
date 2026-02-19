'use client';

import { useMemo, useState } from 'react';
import type { Task } from '@/lib/types';
import DateColumn from './DateColumn';

interface TimelineViewProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

function getDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  if (diff === 2) return '明後日';
  if (diff < 0) return '期限超過';
  return `${target.getMonth() + 1}/${target.getDate()}`;
}

function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default function TimelineView({
  tasks,
  selectedTaskId,
  onSelectTask,
}: TimelineViewProps) {
  const [showPast, setShowPast] = useState(false);

  // 日付ごとにグループ化
  const { columns, undated } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dated: Record<string, { label: string; date: Date; tasks: Task[] }> = {};
    const undatedTasks: Task[] = [];

    // 今日〜明後日の3カラムを必ず用意
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const key = getDateKey(d);
      dated[key] = { label: getDateLabel(d), date: d, tasks: [] };
    }

    // 期限超過カラム
    const pastKey = '__past';
    dated[pastKey] = { label: '期限超過', date: new Date(0), tasks: [] };

    tasks
      .filter((t) => t.status !== 'done')
      .forEach((task) => {
        if (!task.dueDate) {
          undatedTasks.push(task);
          return;
        }
        const key = task.dueDate;
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);

        if (taskDate < today) {
          dated[pastKey].tasks.push(task);
        } else if (dated[key]) {
          dated[key].tasks.push(task);
        } else {
          // 4日目以降は個別カラムに
          dated[key] = { label: getDateLabel(taskDate), date: taskDate, tasks: [task] };
        }
      });

    // ソートして配列化
    const cols = Object.entries(dated)
      .filter(([key]) => {
        if (key === pastKey) return showPast && dated[pastKey].tasks.length > 0;
        return true;
      })
      .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
      .map(([, v]) => v);

    return { columns: cols, undated: undatedTasks };
  }, [tasks, showPast]);

  const pastCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done'
    ).length;
  }, [tasks]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 期限超過トグル */}
      {pastCount > 0 && (
        <div className="px-4 py-2 border-b border-slate-100">
          <button
            onClick={() => setShowPast(!showPast)}
            className="text-xs text-red-600 hover:text-red-700 transition-colors"
          >
            {showPast ? '期限超過を隠す' : `期限超過のタスクが${pastCount}件あります`}
          </button>
        </div>
      )}

      {/* タイムラインカラム */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
        {columns.map((col) => (
          <DateColumn
            key={col.label}
            label={col.label}
            tasks={col.tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            isPast={col.label === '期限超過'}
          />
        ))}

        {/* 期限未設定 */}
        {undated.length > 0 && (
          <DateColumn
            label="期限未設定"
            tasks={undated}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            isUndated
          />
        )}
      </div>
    </div>
  );
}
