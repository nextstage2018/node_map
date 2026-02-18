'use client';

import { useState, useCallback } from 'react';
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
import { Task, TaskStatus, CreateTaskRequest, TaskSuggestion } from '@/lib/types';
import { useTasks } from '@/hooks/useTasks';
import Header from '@/components/shared/Header';
import TaskColumn from '@/components/tasks/TaskColumn';
import TaskDetail from '@/components/tasks/TaskDetail';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TaskSuggestions from '@/components/tasks/TaskSuggestions';
import Button from '@/components/ui/Button';
import { TASK_PRIORITY_CONFIG, TASK_PHASE_CONFIG } from '@/lib/constants';
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
  } = useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [visibleSuggestions, setVisibleSuggestions] = useState<TaskSuggestion[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // suggestionsが変わったらvisibleに反映
  useState(() => {
    setVisibleSuggestions(suggestions);
  });

  // ドラッグ&ドロップ設定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px動いてからドラッグ開始（クリックと区別）
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

      // ドロップ先のステータスを判定
      let targetStatus: TaskStatus | null = null;

      if (overData?.type === 'column') {
        targetStatus = overData.status as TaskStatus;
      } else if (overData?.type === 'task') {
        // 別のタスクの上にドロップ → そのタスクのステータスに移動
        const overTask = overData.task as Task;
        targetStatus = overTask.status;
      }

      if (!targetStatus) return;

      // 元のタスクのステータスと同じなら何もしない
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

  const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'done'];
  const activeSuggestions =
    visibleSuggestions.length > 0 ? visibleSuggestions : suggestions;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* 左：タスクボード */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ツールバー */}
          <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-900">
                📋 タスクボード
              </h2>
              <div className="flex items-center gap-2 text-xs text-gray-400">
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
                {isLoading ? '更新中...' : '🔄 更新'}
              </button>
              <Button onClick={() => setShowCreateModal(true)}>
                ＋ 新規タスク
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          {/* カラムビュー（ドラッグ&ドロップ対応） */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-x-auto p-4">
              <div className="flex gap-4 h-full min-w-0">
                {/* AI提案カラム（未着手の左） */}
                {activeSuggestions.length > 0 && (
                  <TaskSuggestions
                    suggestions={activeSuggestions}
                    onAccept={handleCreateTask}
                    onDismiss={handleDismissSuggestion}
                  />
                )}

                {/* ステータスカラム */}
                {statusColumns.map((status) => (
                  <TaskColumn
                    key={status}
                    status={status}
                    tasks={tasks.filter((t) => t.status === status)}
                    selectedTaskId={selectedTask?.id || null}
                    onSelectTask={(task) => setSelectedTask(task)}
                  />
                ))}
              </div>
            </div>

            {/* ドラッグ中のオーバーレイ */}
            <DragOverlay>
              {activeTask ? (
                <DragOverlayCard task={activeTask} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* 右：タスク詳細 + AI会話 */}
        <div className="w-[480px] border-l border-gray-200 bg-white shrink-0">
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
    </div>
  );
}

// ドラッグ中に表示されるカード
function DragOverlayCard({ task }: { task: Task }) {
  const priority = TASK_PRIORITY_CONFIG[task.priority];
  const phase = TASK_PHASE_CONFIG[task.phase];

  return (
    <div className="p-3 rounded-lg border border-blue-400 bg-white shadow-xl w-[280px] rotate-2 opacity-90">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
          {task.title}
        </h3>
        <span className="text-xs shrink-0">{priority.icon}</span>
      </div>
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
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
          {phase.icon} {phase.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {formatRelativeTime(task.updatedAt)}
        </span>
      </div>
    </div>
  );
}
