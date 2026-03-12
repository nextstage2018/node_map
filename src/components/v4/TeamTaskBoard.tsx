// v4.0: チームタスクカンバンボード（4列: AI提案/着手前/進行中/完了）
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
import { ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskStageColumn from './TaskStageColumn';
import TeamTaskCard from './TeamTaskCard';
import AiProposalCard, { AiProposal, ProposalItem } from './AiProposalCard';
import AssigneeSelector from './AssigneeSelector';
import type { MyTask } from './MyTaskCard';
import TaskDetailPanel from './TaskDetailPanel';

interface Project {
  id: string;
  name: string;
}

interface Assignee {
  id: string;
  name: string;
}

export default function TeamTaskBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<MyTask | null>(null);
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 担当者フィルタ
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('all');

  // 担当者選択モーダル
  const [assigneeModal, setAssigneeModal] = useState<{
    proposalId: string;
    items: ProposalItem[];
  } | null>(null);

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
            setProjects(data.data.map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            })));
            // 最初のPJを自動選択
            if (data.data.length > 0 && !selectedProjectId) {
              setSelectedProjectId(data.data[0].id);
            }
          }
        }
      } catch (error) {
        console.error('プロジェクト取得エラー:', error);
      }
    };
    fetchProjects();
  }, []);

  // チームタスク + AI提案取得
  const fetchData = useCallback(async () => {
    if (!selectedProjectId) return;
    setIsLoading(true);

    try {
      // 並列取得
      const [tasksRes, suggestionsRes] = await Promise.all([
        fetch(`/api/tasks/team?project_id=${selectedProjectId}`),
        fetch(`/api/task-suggestions/pending?project_id=${selectedProjectId}`),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        if (data.success) {
          setTasks(data.data || []);
        }
      }

      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        if (data.success && data.data) {
          // task_suggestions → AiProposal形式に変換
          const mapped: AiProposal[] = data.data.map((s: {
            id: string;
            meeting_title?: string;
            created_at: string;
            suggestions: { items?: ProposalItem[] };
          }) => ({
            id: s.id,
            meeting_title: s.meeting_title,
            created_at: s.created_at,
            items: s.suggestions?.items || [],
          }));
          setProposals(mapped);
        }
      }
    } catch (error) {
      console.error('チームデータ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 担当者一覧を抽出（フィルタ用）
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

  // プロジェクト変更時にフィルタリセット
  useEffect(() => {
    setSelectedAssigneeId('all');
  }, [selectedProjectId]);

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

    if (!newStatus || newStatus === 'ai_proposal') return; // AI提案列にはドロップ不可
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
      fetchData();
    }
  };

  // 完了ボタン
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
      fetchData();
    }
  };

  // AI提案の承認 → 担当者選択モーダルを開く
  const handleApproveProposal = (proposalId: string, items: ProposalItem[]) => {
    setAssigneeModal({ proposalId, items });
  };

  // 担当者選択後 → タスク作成
  const handleAssignConfirm = async (
    assignments: Array<{ item: ProposalItem; assigned_contact_id?: string }>
  ) => {
    if (!assigneeModal) return;

    try {
      const res = await fetch(`/api/task-suggestions/${assigneeModal.proposalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: assignments.map(a => ({
            title: a.item.title,
            assigned_contact_id: a.assigned_contact_id === '__self__' ? undefined : a.assigned_contact_id,
            due_date: a.item.due_date,
            priority: a.item.priority || 'medium',
          })),
        }),
      });

      if (res.ok) {
        setAssigneeModal(null);
        fetchData(); // リフレッシュ
      }
    } catch (error) {
      console.error('タスク作成エラー:', error);
    }
  };

  // AI提案の却下
  const handleDismissProposal = async (proposalId: string) => {
    try {
      await fetch(`/api/task-suggestions/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (error) {
      console.error('却下エラー:', error);
    }
  };

  if (projects.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <div className="text-3xl mb-2 opacity-30">📂</div>
          <div className="text-sm">プロジェクトがありません</div>
          <div className="text-xs mt-1">組織・プロジェクトページでプロジェクトを作成してください</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* プロジェクト選択 + 担当者フィルタ */}
      <div className="shrink-0 px-6 py-3 border-b border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">プロジェクト:</span>
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
              <span className="text-xs text-slate-400">担当者:</span>
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
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-full text-slate-400">
          <div className="animate-pulse text-sm">読み込み中...</div>
        </div>
      ) : (
        /* カンバン4列 */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto px-4 py-4">
            <div className="flex gap-4 h-full min-w-max">
              {/* AI提案 */}
              <TaskStageColumn
                stageId="ai_proposal"
                itemIds={[]}
                count={proposals.reduce((sum, p) => sum + p.items.length, 0)}
              >
                {proposals.length > 0 ? (
                  proposals.map(proposal => (
                    <AiProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      onApprove={handleApproveProposal}
                      onDismiss={handleDismissProposal}
                    />
                  ))
                ) : null}
              </TaskStageColumn>

              {/* 着手前 */}
              <TaskStageColumn
                stageId="todo"
                itemIds={todoTasks.map(t => t.id)}
                count={todoTasks.length}
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

      {/* 担当者選択モーダル */}
      {assigneeModal && (
        <AssigneeSelector
          projectId={selectedProjectId}
          items={assigneeModal.items}
          onConfirm={handleAssignConfirm}
          onCancel={() => setAssigneeModal(null)}
        />
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
  );
}
