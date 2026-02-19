'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Task,
  TaskStatus,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskSuggestion,
  Job,
  JobStatus,
  Seed,
} from '@/lib/types';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);

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

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (data.success) {
        setJobs(data.data);
      }
    } catch {
      // サイレントに無視
    }
  }, []);

  const fetchSeeds = useCallback(async () => {
    try {
      const res = await fetch('/api/seeds');
      const data = await res.json();
      if (data.success) {
        setSeeds(data.data);
      }
    } catch {
      // サイレントに無視
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchSuggestions();
    fetchJobs();
    fetchSeeds();
  }, [fetchTasks, fetchSuggestions, fetchJobs, fetchSeeds]);

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

  // ===== ジョブ操作 =====

  const updateJobStatus = useCallback(async (jobId: string, status: JobStatus) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, status }),
      });
      const data = await res.json();
      if (data.success) {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? data.data : j))
        );
        return data.data as Job;
      }
      throw new Error(data.error);
    } catch (e) {
      throw e;
    }
  }, []);

  // ===== 種ボックス操作 =====

  const createSeed = useCallback(async (content: string) => {
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setSeeds((prev) => [data.data, ...prev]);
        return data.data as Seed;
      }
      throw new Error(data.error);
    } catch (e) {
      throw e;
    }
  }, []);

  const confirmSeed = useCallback(async (seedId: string) => {
    try {
      const res = await fetch(`/api/seeds/${seedId}/confirm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        // 種をリストから削除し、新しいタスクを追加
        setSeeds((prev) => prev.filter((s) => s.id !== seedId));
        setTasks((prev) => [data.data, ...prev]);
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

  // ジョブのアクティブ件数
  const activeJobCount = jobs.filter(
    (j) => j.status === 'draft' || j.status === 'proposed'
  ).length;

  return {
    tasks,
    isLoading,
    error,
    suggestions,
    statusCounts,
    refresh: fetchTasks,
    createTask,
    updateTask,
    // Phase 7
    jobs,
    seeds,
    activeJobCount,
    updateJobStatus,
    createSeed,
    confirmSeed,
    refreshJobs: fetchJobs,
    refreshSeeds: fetchSeeds,
  };
}
