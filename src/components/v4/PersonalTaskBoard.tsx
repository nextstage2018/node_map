// v4.0: 個人タスクカンバンボード（3列: 着手前/進行中/完了）
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskStageColumn from './TaskStageColumn';
import MyTaskCard, { MyTask } from './MyTaskCard';
import QuickTaskForm from './QuickTaskForm';

type FilterType = 'all' | 'today' | 'this_week' | 'overdue';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'today', label: '今日' },
  { value: 'this_week', label: '今週' },
  { value: 'overdue', label: '期限切れ' },
];

export default function PersonalTaskBoard() {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<MyTask | null>(null);
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // タスク取得
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/my?filter=${filter}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTasks(data.data || []);
        }
      }
    } catch (error) {
      console.error('タスク取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  // ステータスごとにグループ化
  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done' || fadingTasks.has(t.id));

  // D&Dイベント
  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as MyTask;
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // ドロップ先のステージを判定
    let newStatus: string | null = null;
    if (overId.startsWith('stage-')) {
      newStatus = overId.replace('stage-', '');
    } else {
      // タスクの上にドロップした場合、そのタスクが属するステージを判定
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }

    if (!newStatus) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // 楽観的更新
    if (newStatus === 'done') {
      // 完了の場合: フェードアウト→消える
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'done' } : t
      ));
      setFadingTasks(prev => new Set(prev).add(taskId));

      // 3秒後にフェード開始
      setTimeout(() => {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, isFading: true } : t
        ));
      }, 2000);

      // 5秒後にリストから除去
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setFadingTasks(prev => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }, 4000);
    } else {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus! } : t
      ));
    }

    // API呼び出し
    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.error('ステータス更新エラー:', error);
      fetchTasks(); // エラー時はリフェッチ
    }
  };

  // チェックボックスで完了
  const handleComplete = async (taskId: string) => {
    // フェードアウトアニメーション
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'done' } : t
    ));
    setFadingTasks(prev => new Set(prev).add(taskId));

    setTimeout(() => {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, isFading: true } : t
      ));
    }, 2000);

    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setFadingTasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 4000);

    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
    } catch (error) {
      console.error('完了処理エラー:', error);
      fetchTasks();
    }
  };

  // クイック追加
  const handleQuickAdd = async (title: string, dueDate?: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          due_date: dueDate,
          status: 'todo',
          priority: 'medium',
          phase: 'ideation',
          taskType: 'personal',
        }),
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('タスク作成エラー:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="animate-pulse text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* フィルター */}
      <div className="shrink-0 px-6 py-3 flex items-center gap-2 border-b border-slate-100">
        <Filter className="w-4 h-4 text-slate-400" />
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            {f.label}
            {f.value === 'overdue' && todoTasks.filter(t => {
              if (!t.due_date) return false;
              return new Date(t.due_date) < new Date(new Date().toISOString().split('T')[0]);
            }).length > 0 && (
              <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1">
                !
              </span>
            )}
          </button>
        ))}
      </div>

      {/* カンバン3列 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto px-4 py-4">
          <div className="flex gap-4 h-full min-w-max">
            {/* 着手前 */}
            <TaskStageColumn
              stageId="todo"
              itemIds={todoTasks.map(t => t.id)}
              count={todoTasks.length}
              headerExtra={
                <QuickTaskForm onSubmit={handleQuickAdd} />
              }
            >
              {todoTasks.map(task => (
                <MyTaskCard key={task.id} task={task} onComplete={handleComplete} />
              ))}
            </TaskStageColumn>

            {/* 進行中 */}
            <TaskStageColumn
              stageId="in_progress"
              itemIds={inProgressTasks.map(t => t.id)}
              count={inProgressTasks.length}
            >
              {inProgressTasks.map(task => (
                <MyTaskCard key={task.id} task={task} onComplete={handleComplete} />
              ))}
            </TaskStageColumn>

            {/* 完了 */}
            <TaskStageColumn
              stageId="done"
              itemIds={doneTasks.map(t => t.id)}
              count={doneTasks.length}
            >
              {doneTasks.map(task => (
                <MyTaskCard key={task.id} task={{ ...task, isFading: fadingTasks.has(task.id) && task.isFading }} />
              ))}
            </TaskStageColumn>
          </div>
        </div>

        {/* ドラッグオーバーレイ */}
        <DragOverlay>
          {activeTask ? (
            <div className="w-[280px] opacity-90">
              <MyTaskCard task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
