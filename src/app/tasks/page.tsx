'use client';

import { useState, useCallback, useEffect } from 'react';
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
import type { Task, TaskStatus, CreateTaskRequest, TaskSuggestion, TaskBoardViewMode } from '@/lib/types';
import { useTasks } from '@/hooks/useTasks';
import AppLayout from '@/components/shared/AppLayout';
import ContextBar from '@/components/shared/ContextBar';
import TaskColumn from '@/components/tasks/TaskColumn';
import TaskDetail from '@/components/tasks/TaskDetail';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TaskSuggestions from '@/components/tasks/TaskSuggestions';
import SeedBox from '@/components/seeds/SeedBox';
import TimelineView from '@/components/timeline/TimelineView';
import WeeklyNodeBanner from '@/components/weekly/WeeklyNodeBanner';
import Button from '@/components/ui/Button';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG, VIEW_MODE_CONFIG } from '@/lib/constants';
import { formatRelativeTime, cn } from '@/lib/utils';

export default function TasksPage() {
  const {
    tasks,
    isLoading,
    error,
    suggestions,
    statusCounts,
    refresh,
    createTask,
    updateTask,
    seeds,
    createSeed,
    confirmSeed,
  } = useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [visibleSuggestions, setVisibleSuggestions] = useState<TaskSuggestion[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<TaskBoardViewMode>('status');
  const [seedBoxExpanded, setSeedBoxExpanded] = useState(false);

  // suggestionsが変わったらvisibleに反映
  useEffect(() => {
    setVisibleSuggestions(suggestions);
  }, [suggestions]);

  // ドラッグ&ドロップ設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const task = active.data.current?.task as Task | undefined;
    if (task) {
      setActiveTask(task);
    }
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
        const overTask = overData.task as Task;
        targetStatus = overTask.status;
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
      if (newTask) {
        setSelectedTask(newTask);
      }
    },
    [createTask]
  );

  const handleDismissSuggestion = useCallback((index: number) => {
    setVisibleSuggestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRefresh = useCallback(() => {
    refresh().then(() => {
      if (selectedTask) {
        // 選択中タスクを最新データで更新
      }
    });
  }, [refresh, selectedTask]);

  // Phase 19: カードからのクイックチャット
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
        // 送信したタスクを選択状態にする
        setSelectedTask(task);
      }
    } catch {
      // エラー処理
    }
  }, [tasks, refresh]);

  const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'done'];
  const activeSuggestions =
    visibleSuggestions.length > 0 ? visibleSuggestions : suggestions;

  return (
    <AppLayout>
      <ContextBar title="タスク" />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Phase 20: 週次ノードバナー */}
          <WeeklyNodeBanner userId="demo-user" />

          {/* 種ボックス */}
          <div className="px-4 pt-3">
            <SeedBox
              seeds={seeds}
              onCreateSeed={createSeed}
              onConfirmSeed={confirmSeed}
              isExpanded={seedBoxExpanded}
              onToggle={() => setSeedBoxExpanded(!seedBoxExpanded)}
            />
          </div>

          {/* ツールバー */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* ビュー切り替え */}
              <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
                {(Object.keys(VIEW_MODE_CONFIG) as TaskBoardViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                      viewMode === mode
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {VIEW_MODE_CONFIG[mode].label}
                  </button>
                ))}
              </div>

              {/* カウンター */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>未着手 {statusCounts.todo}</span>
                <span>・</span>
                <span>進行中 {statusCounts.in_progress}</span>
                <span>・</span>
                <span>完了 {statusCounts.done}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                className="text-xs text-blue-600 hover:underline"
                disabled={isLoading}
              >
                {isLoading ? '更新中...' : '更新'}
              </button>
              <Button onClick={() => setShowCreateModal(true)}>
                ＋ 新規タスク
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          {/* メインコンテンツ */}
          {viewMode === 'status' ? (
            /* ステータスビュー（カンバン） */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-0">
                  {activeSuggestions.length > 0 && (
                    <TaskSuggestions
                      suggestions={activeSuggestions}
                      onAccept={handleCreateTask}
                      onDismiss={handleDismissSuggestion}
                    />
                  )}
                  {statusColumns.map((status) => (
                    <TaskColumn
                      key={status}
                      status={status}
                      tasks={tasks.filter((t) => t.status === status)}
                      selectedTaskId={selectedTask?.id || null}
                      onSelectTask={(task) => setSelectedTask(task)}
                      onQuickChat={handleQuickChat}
                    />
                  ))}
                </div>
              </div>

              <DragOverlay>
                {activeTask ? (
                  <DragOverlayCard task={activeTask} />
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            /* タイムラインビュー */
            <TimelineView
              tasks={tasks}
              selectedTaskId={selectedTask?.id || null}
              onSelectTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) setSelectedTask(task);
              }}
            />
          )}
        </div>

        {/* 右：タスク詳細 + AI会話 */}
        <div className="w-[480px] border-l border-slate-200 bg-white shrink-0">
          <TaskDetail
            task={selectedTask}
            onUpdate={updateTask}
            onRefresh={handleRefresh}
          />
        </div>
      </div>

      {/* タスク作成モーダル */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTask}
        />
      )}
    </AppLayout>
  );
}

// ドラッグ中に表示されるカード
function DragOverlayCard({ task }: { task: Task }) {
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];

  return (
    <div className="p-3 rounded-lg border border-blue-400 bg-white shadow-xl w-[280px] rotate-2 opacity-90">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-slate-900 leading-tight line-clamp-2">
          {task.title}
        </h3>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0', priority.badgeColor)}>
          {priority.label}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            phase.color
          )}
        >
          {phase.label}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatRelativeTime(task.updatedAt)}
        </span>
      </div>
    </div>
  );
}
