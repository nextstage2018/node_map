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
import type { Task, TaskStatus, TaskCategory, CreateTaskRequest, TaskBoardViewMode } from '@/lib/types';
import { useTasks } from '@/hooks/useTasks';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import TaskColumn from '@/components/tasks/TaskColumn';
import TaskDetail from '@/components/tasks/TaskDetail';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TimelineView from '@/components/timeline/TimelineView';
import Button from '@/components/ui/Button';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG, VIEW_MODE_CONFIG } from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';

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
  const [viewMode, setViewMode] = useState<TaskBoardViewMode>('status');

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
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterOrgId, setFilterOrgId] = useState<string>('');
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

  // 組織一覧（プロジェクトから抽出）
  const organizations = useMemo(() => {
    const orgMap = new Map<string, string>();
    projects.forEach((p) => {
      if (p.organizationId && p.organizationName) {
        orgMap.set(p.organizationId, p.organizationName);
      }
    });
    return Array.from(orgMap.entries()).map(([id, name]) => ({ id, name }));
  }, [projects]);

  // フィルタリング済みプロジェクト（組織でフィルタ）
  const filteredProjects = useMemo(() => {
    if (!filterOrgId) return projects;
    return projects.filter((p) => p.organizationId === filterOrgId);
  }, [projects, filterOrgId]);

  // フィルタリング
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterOrgId) {
      const orgProjectIds = new Set(projects.filter((p) => p.organizationId === filterOrgId).map((p) => p.id));
      result = result.filter((t) => t.projectId && orgProjectIds.has(t.projectId));
    }
    if (filterProjectId) {
      result = result.filter((t) => t.projectId === filterProjectId);
    }
    if (filterCategory) {
      result = result.filter((t) => (t.taskCategory || 'individual') === filterCategory);
    }
    return result;
  }, [tasks, filterProjectId, filterCategory, filterOrgId, projects]);

  const todoCount = filteredTasks.filter(t => t.status === 'todo').length;
  const progressCount = filteredTasks.filter(t => t.status === 'in_progress').length;
  const hasFilter = Boolean(filterProjectId || filterCategory || filterOrgId);

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

  // 完了タスクはアーカイブ（ビジネスログ）されるため、カンバンは2列
  const statusColumns: TaskStatus[] = ['todo', 'in_progress'];

  return (
    <AppLayout>
      <ContextBar title="タスク" />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-slate-50/50 to-white">
          {/* ヘッダーバー */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                {/* ビュー切り替え */}
                <div className="flex bg-white rounded-xl border border-slate-200 p-0.5 shadow-sm">
                  {(Object.keys(VIEW_MODE_CONFIG) as TaskBoardViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        'px-4 py-1.5 text-sm font-medium rounded-lg transition-all',
                        viewMode === mode
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {VIEW_MODE_CONFIG[mode].label}
                    </button>
                  ))}
                </div>

                {/* ステータスカウント */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-xs text-slate-500 font-medium">未着手 {todoCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-slate-500 font-medium">進行中 {progressCount}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={refresh}
                  className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? '更新中...' : '↻ 更新'}
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors"
                >
                  ＋ 新規タスク
                </button>
              </div>
            </div>

            {/* フィルタバー */}
            <div className="flex items-center gap-2 pb-1">
              {organizations.length > 0 && (
                <select
                  value={filterOrgId}
                  onChange={(e) => { setFilterOrgId(e.target.value); setFilterProjectId(''); }}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  <option value="">全組織</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}
              <select
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="">全プロジェクト</option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {!filterOrgId && p.organizationName ? `${p.organizationName} / ${p.name}` : p.name}
                  </option>
                ))}
              </select>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="">全種類</option>
                <option value="routine">定型</option>
                <option value="individual">個別</option>
                <option value="team">チーム</option>
              </select>
              {hasFilter && (
                <button
                  onClick={() => { setFilterProjectId(''); setFilterCategory(''); setFilterOrgId(''); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-1"
                >
                  ✕ クリア
                </button>
              )}
              {hasFilter && (
                <span className="text-xs text-slate-400 ml-auto">
                  {filteredTasks.length}件 / {tasks.length}件
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          {/* メインコンテンツ */}
          {viewMode === 'status' ? (
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
                    />
                  ))}
                </div>
              </div>

              <DragOverlay>
                {activeTask ? <DragOverlayCard task={activeTask} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <TimelineView
              tasks={filteredTasks}
              selectedTaskId={selectedTask?.id || null}
              onSelectTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) setSelectedTask(task);
              }}
            />
          )}
        </div>

        {/* 右：タスク詳細 + AI会話 */}
        <div className="w-[480px] border-l border-slate-200 bg-white shrink-0 overflow-hidden">
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
    <div className="p-3 rounded-xl border border-blue-400 bg-white shadow-2xl w-[290px] rotate-2 opacity-95">
      {task.projectName && (
        <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md font-medium mb-1 inline-block">
          {task.projectName}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[13px] font-semibold text-slate-800 leading-snug line-clamp-2">
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
        <span className="text-[10px] text-slate-400">
          {formatRelativeTime(task.updatedAt)}
        </span>
      </div>
    </div>
  );
}
