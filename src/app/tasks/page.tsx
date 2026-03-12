// v5.0: タスク管理ページ（統合カンバンボード）
// 個人/チーム区分を廃止。プロジェクト選択 + 担当者フィルタで管理
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ChevronDown, Filter, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import AppLayout from '@/components/shared/AppLayout';
import TaskStageColumn from '@/components/v4/TaskStageColumn';
import TeamTaskCard from '@/components/v4/TeamTaskCard';
import QuickTaskForm from '@/components/v4/QuickTaskForm';
import TaskDetailPanel from '@/components/v4/TaskDetailPanel';
import type { MyTask } from '@/components/v4/MyTaskCard';

interface Project {
  id: string;
  name: string;
}

type FilterType = 'all' | 'today' | 'this_week' | 'overdue';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'today', label: '今日' },
  { value: 'this_week', label: '今週' },
  { value: 'overdue', label: '期限切れ' },
];

export default function TasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<MyTask | null>(null);
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // プロジェクト一覧取得
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            const pjs = data.data.map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            }));
            setProjects(pjs);
            if (pjs.length > 0 && !selectedProjectId) {
              setSelectedProjectId(pjs[0].id);
            }
          }
        }
      } catch (error) {
        console.error('プロジェクト取得エラー:', error);
      }
    };
    fetchProjects();
  }, []);

  // タスク取得
  const fetchTasks = useCallback(async () => {
    if (!selectedProjectId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ filter, project_id: selectedProjectId });
      const res = await fetch(`/api/tasks/my?${params}`);
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
  }, [selectedProjectId, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // プロジェクト変更時にフィルタリセット
  useEffect(() => {
    setSelectedAssigneeId('all');
  }, [selectedProjectId]);

  // 担当者一覧を抽出
  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach(t => {
      if (t.assigned_contact_id && t.assignee_name) {
        map.set(t.assigned_contact_id, t.assignee_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [tasks]);

  // フィルタ適用
  const filteredTasks = useMemo(() => {
    if (selectedAssigneeId === 'all') return tasks;
    if (selectedAssigneeId === 'unassigned') return tasks.filter(t => !t.assigned_contact_id);
    return tasks.filter(t => t.assigned_contact_id === selectedAssigneeId);
  }, [tasks, selectedAssigneeId]);

  // ステータスごとにグループ化
  const todoTasks = filteredTasks.filter(t => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');
  const doneTasks = filteredTasks.filter(t => t.status === 'done' || fadingTasks.has(t.id));

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

    let newStatus: string | null = null;
    if (overId.startsWith('stage-')) {
      newStatus = overId.replace('stage-', '');
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }

    if (!newStatus) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // 楽観的更新
    if (newStatus === 'done') {
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
        setFadingTasks(prev => { const next = new Set(prev); next.delete(taskId); return next; });
      }, 4000);
    } else {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus! } : t
      ));
    }

    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.error('ステータス更新エラー:', error);
      fetchTasks();
    }
  };

  // チェックボックスで完了
  const handleComplete = async (taskId: string) => {
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
      setFadingTasks(prev => { const next = new Set(prev); next.delete(taskId); return next; });
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
          projectId: selectedProjectId || undefined,
        }),
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('タスク作成エラー:', error);
    }
  };

  const overdueCount = tasks.filter(t => {
    if (!t.due_date || t.status === 'done') return false;
    return new Date(t.due_date) < new Date(new Date().toISOString().split('T')[0]);
  }).length;

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-nm-bg">
        {/* ヘッダー */}
        <header className="shrink-0 bg-white border-b border-nm-border px-6 py-4">
          <h1 className="text-lg font-bold text-nm-text">タスク</h1>
        </header>

        {/* フィルタバー */}
        <div className="shrink-0 px-6 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-4 flex-wrap">
            {/* プロジェクト選択 */}
            <div className="flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
              <div className="relative">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="text-sm font-medium text-nm-text bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-blue-400 appearance-none"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 担当者フィルタ */}
            {assignees.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <div className="relative">
                  <select
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    className={cn(
                      'text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-blue-400 appearance-none',
                      selectedAssigneeId !== 'all' ? 'text-blue-600 font-medium border-blue-200 bg-blue-50' : 'text-nm-text'
                    )}
                  >
                    <option value="all">全員</option>
                    {assignees.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                    <option value="unassigned">未割り当て</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {selectedAssigneeId !== 'all' && (
                  <button
                    onClick={() => setSelectedAssigneeId('all')}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    解除
                  </button>
                )}
              </div>
            )}

            {/* 区切り線 */}
            <div className="h-5 w-px bg-slate-200" />

            {/* 期限フィルタ */}
            <div className="flex items-center gap-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                    filter === f.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  {f.label}
                  {f.value === 'overdue' && overdueCount > 0 && (
                    <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full px-1">!</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* カンバン */}
        {isLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400">
            <div className="animate-pulse text-sm">読み込み中...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-slate-400">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-30">📂</div>
              <div className="text-sm">プロジェクトがありません</div>
            </div>
          </div>
        ) : (
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
                  headerExtra={<QuickTaskForm onSubmit={handleQuickAdd} />}
                >
                  {todoTasks.map(task => (
                    <TeamTaskCard key={task.id} task={task} onComplete={handleComplete} onClick={setSelectedTaskId} />
                  ))}
                </TaskStageColumn>

                {/* 進行中 */}
                <TaskStageColumn
                  stageId="in_progress"
                  itemIds={inProgressTasks.map(t => t.id)}
                  count={inProgressTasks.length}
                >
                  {inProgressTasks.map(task => (
                    <TeamTaskCard key={task.id} task={task} onComplete={handleComplete} onClick={setSelectedTaskId} />
                  ))}
                </TaskStageColumn>

                {/* 完了 */}
                <TaskStageColumn
                  stageId="done"
                  itemIds={doneTasks.map(t => t.id)}
                  count={doneTasks.length}
                >
                  {doneTasks.map(task => (
                    <TeamTaskCard
                      key={task.id}
                      task={{ ...task, isFading: fadingTasks.has(task.id) && task.isFading }}
                    />
                  ))}
                </TaskStageColumn>
              </div>
            </div>

            <DragOverlay>
              {activeTask ? (
                <div className="w-[280px] opacity-90">
                  <TeamTaskCard task={activeTask} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* タスク詳細パネル */}
        {selectedTaskId && (
          <TaskDetailPanel
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
            onStatusChange={(taskId, newStatus) => {
              setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: newStatus } : t
              ));
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}
