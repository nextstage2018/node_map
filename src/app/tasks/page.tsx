'use client';

import { useState, useCallback } from 'react';
import { Task, TaskStatus, CreateTaskRequest, TaskSuggestion } from '@/lib/types';
import { useTasks } from '@/hooks/useTasks';
import Header from '@/components/shared/Header';
import TaskColumn from '@/components/tasks/TaskColumn';
import TaskDetail from '@/components/tasks/TaskDetail';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import TaskSuggestions from '@/components/tasks/TaskSuggestions';
import Button from '@/components/ui/Button';

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

  // suggestionsが変わったらvisibleに反映
  useState(() => {
    setVisibleSuggestions(suggestions);
  });

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
      // 選択中のタスクを最新データで更新
      if (selectedTask) {
        // ここではrefreshの結果を使う
      }
    });
  }, [refresh, selectedTask]);

  const statusColumns: TaskStatus[] = ['todo', 'in_progress', 'done'];

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header />

      {/* タスク提案 */}
      <TaskSuggestions
        suggestions={visibleSuggestions.length > 0 ? visibleSuggestions : suggestions}
        onAccept={handleCreateTask}
        onDismiss={handleDismissSuggestion}
      />

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

          {/* カラムビュー */}
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-4 h-full min-w-0">
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
