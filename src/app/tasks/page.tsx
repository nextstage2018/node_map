'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
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
import type { Task, TaskStatus, CreateTaskRequest } from '@/lib/types';
import { useTasks } from '@/hooks/useTasks';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import TaskColumn from '@/components/tasks/TaskColumn';
import TaskDetail from '@/components/tasks/TaskDetail';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import Button from '@/components/ui/Button';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface ProjectOption {
  id: string;
  name: string;
  organizationId?: string;
  organizationName?: string;
}

export default function TasksPage() {
  const {
    tasks,
    isLoading,
    error,
    statusCounts,
    refresh,
    createTask,
    updateTask,
  } = useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // tasks配列が更新されたら selectedTask も最新データに同期
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      } else {
        // タスクが削除された場合
        setSelectedTask(null);
      }
    }
  }, [tasks]);

  // フィルタ
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects?status=active');
        const data = await res.json();
        if (data.success) {
          setProjects((data.data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            organizationId: p.organization_id,
            organizationName: p.organization_name,
          })));
        }
      } catch { /* silent */ }
    })();
  }, []);

  // フィルタリング（プロジェクトのみ）
  const filteredTasks = useMemo(() => {
    if (!filterProjectId) return tasks;
    return tasks.filter((t) => t.projectId === filterProjectId);
  }, [tasks, filterProjectId]);

  const proposedCount = filteredTasks.filter(t => t.status === 'proposed').length;
  const todoCount = filteredTasks.filter(t => t.status === 'todo').length;
  const progressCount = filteredTasks.filter(t => t.status === 'in_progress').length;

  // ドラッグ&ドロップ設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const overData = over.data.current;

      let targetStatus: TaskStatus | null = null;
      if (overData?.type === 'column') {
        targetStatus = overData.status as TaskStatus;
      } else if (overData?.type === 'task') {
        targetStatus = (overData.task as Task).status;
      }
      if (!targetStatus) return;

      const originalTask = tasks.find((t) => t.id === taskId);
      if (!originalTask || originalTask.status === targetStatus) return;

      await updateTask(taskId, { status: targetStatus });
      refresh();
    },
    [tasks, updateTask, refresh]
  );

  const handleCreateTask = useCallback(
    async (req: CreateTaskRequest) => {
      const newTask = await createTask(req);
      if (newTask) setSelectedTask(newTask);
    },
    [createTask]
  );

  const handleRefresh = useCallback(() => {
    refresh().then(() => { /* selected task auto-refresh */ });
  }, [refresh]);

  // 提案承認: proposed → todo
  const handleApprove = useCallback(async (taskId: string) => {
    await updateTask(taskId, { status: 'todo' });
    refresh();
  }, [updateTask, refresh]);

  // 提案却下: タスク削除
  const handleReject = useCallback(async (taskId: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (res.ok) {
        if (selectedTask?.id === taskId) setSelectedTask(null);
        refresh();
      }
    } catch { /* silent */ }
  }, [refresh, selectedTask]);

  const handleQuickChat = useCallback(async (taskId: string, message: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      const res = await fetch('/api/tasks/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, message, phase: task.phase }),
      });
      const data = await res.json();
      if (data.success) {
        refresh();
        setSelectedTask(task);
      }
    } catch { /* error */ }
  }, [tasks, refresh]);

  // 完了タスクはアーカイブ（ビジネスログ）されるため、カンバンは3列（提案+未着手+進行中）
  const statusColumns: TaskStatus[] = ['proposed', 'todo', 'in_progress'];

  return (
    <AppLayout>
      <ContextBar title="タスク" />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-slate-50/50 to-white">
          {/* ヘッダーバー */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              {/* ステータスカウント */}
              <div className="flex items-center gap-3">
                {proposedCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs text-amber-600 font-medium">提案 {proposedCount}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="text-xs text-nm-text-light font-medium">未着手 {todoCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-nm-accent" />
                  <span className="text-xs text-nm-text-light font-medium">進行中 {progressCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* プロジェクトフィルタ */}
                {projects.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={filterProjectId}
                      onChange={(e) => setFilterProjectId(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-nm-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-nm-accent shadow-nm-sm"
                    >
                      <option value="">全プロジェクト</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.organizationName ? `${p.organizationName} / ${p.name}` : p.name}
                        </option>
                      ))}
                    </select>
                    {filterProjectId && (
                      <button
                        onClick={() => setFilterProjectId('')}
                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
                <button
                  onClick={refresh}
                  className="text-xs text-nm-text-light hover:text-nm-accent transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? '更新中...' : '更新'}
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-nm-accent hover:bg-blue-700 rounded-xl shadow-nm-sm transition-colors"
                >
                  + 新規タスク
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          {/* カンバンボード */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-x-auto px-4 pb-4">
              <div className="flex gap-4 h-full min-w-0">
                {statusColumns.map((status) => (
                  <TaskColumn
                    key={status}
                    status={status}
                    tasks={filteredTasks.filter((t) => t.status === status)}
                    selectedTaskId={selectedTask?.id || null}
                    onSelectTask={(task) => setSelectedTask(task)}
                    onQuickChat={handleQuickChat}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            </div>

            <DragOverlay>
              {activeTask ? <DragOverlayCard task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* 右：タスク詳細 + AI会話 */}
        <div className="w-[480px] border-l border-nm-border bg-white shrink-0 overflow-hidden">
          <TaskDetail
            task={selectedTask}
            onUpdate={updateTask}
            onRefresh={handleRefresh}
            onDelete={() => setSelectedTask(null)}
          />
        </div>
      </div>

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTask}
        />
      )}
    </AppLayout>
  );
}

// ドラッグ中のオーバーレイ
function DragOverlayCard({ task }: { task: Task }) {
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];

  return (
    <div className="p-3 rounded-xl border border-nm-accent bg-white shadow-2xl w-[290px] rotate-2 opacity-95">
      {task.projectName && (
        <span className="text-[10px] text-nm-accent bg-blue-50 px-1.5 py-0.5 rounded-md font-medium mb-1 inline-block">
          {task.projectName}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[13px] font-semibold text-nm-text leading-snug line-clamp-2">
          {task.title}
        </h3>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0', priority.badgeColor)}>
          {priority.label}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', phase.color)}>
          {phase.label}
        </span>
      </div>
    </div>
  );
}
