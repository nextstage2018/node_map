'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Task,
  TaskStatus,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskSuggestion,
} from '@/lib/types';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
      } else {
        setError(data.error || 'タスクの取得に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/suggestions');
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data);
      }
    } catch {
      // サイレントに無視
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchSuggestions();
  }, [fetchTasks, fetchSuggestions]);

  const createTask = useCallback(async (req: CreateTaskRequest) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (data.success) {
        setTasks((prev) => [data.data, ...prev]);
        return data.data as Task;
      }
      throw new Error(data.error);
    } catch (e) {
      throw e;
    }
  }, []);

  const updateTask = useCallback(async (id: string, req: UpdateTaskRequest) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...req }),
      });
      const data = await res.json();
      if (data.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? data.data : t))
        );
        return data.data as Task;
      }
      throw new Error(data.error);
    } catch (e) {
      throw e;
    }
  }, []);

  // ステータス別カウント
  const statusCounts: Record<TaskStatus, number> = {
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  return {
    tasks,
    isLoading,
    error,
    suggestions,
    statusCounts,
    refresh: fetchTasks,
    createTask,
    updateTask,
  };
}
