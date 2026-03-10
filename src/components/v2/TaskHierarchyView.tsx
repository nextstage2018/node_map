// v4.0: ゴール→マイルストーン→タスクの3階層表示（親コンポーネント）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, FolderOpen, Flag } from 'lucide-react';
import GoalSection from './GoalSection';
import MilestoneSection from './MilestoneSection';
import GoalForm from './GoalForm';
import MilestoneForm from './MilestoneForm';

// ========================================
// 型定義
// ========================================
interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  phase: string;
  created_at: string;
  milestone_id: string | null;
}

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  start_context: string | null;
  target_date: string | null;
  achieved_date: string | null;
  status: string;
  goal_id: string | null;
  task_count: number;
  completed_task_count: number;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
}

interface TaskHierarchyViewProps {
  projectId: string;
}

// ========================================
// インラインタスク作成フォーム
// ========================================
function InlineTaskForm({
  milestoneId,
  projectId,
  onCreated,
  onCancel,
}: {
  milestoneId: string;
  projectId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: '',
          priority: 'medium',
          projectId,
          milestoneId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTitle('');
        onCreated();
      }
    } catch { /* ignore */ }
    finally { setIsSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 ml-10 px-2.5 py-1.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タスク名を入力..."
        className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      <button
        type="submit"
        disabled={!title.trim() || isSubmitting}
        className="px-2.5 py-1 text-[10px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        追加
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-700 transition-colors"
      >
        取消
      </button>
    </form>
  );
}

// ========================================
// メインコンポーネント
// ========================================
export default function TaskHierarchyView({ projectId }: TaskHierarchyViewProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // モーダル状態
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneGoalId, setMilestoneGoalId] = useState<string | null>(null);

  // インラインタスク作成
  const [addingTaskForMilestone, setAddingTaskForMilestone] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================================
  // データ取得
  // ========================================
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [goalsRes, milestonesRes, tasksRes] = await Promise.all([
        fetch(`/api/goals?project_id=${projectId}`),
        fetch(`/api/milestones?project_id=${projectId}`),
        fetch(`/api/tasks?project_id=${projectId}`),
      ]);
      const [goalsData, milestonesData, tasksData] = await Promise.all([
        goalsRes.json(),
        milestonesRes.json(),
        tasksRes.json(),
      ]);
      if (goalsData.success) setGoals(goalsData.data || []);
      if (milestonesData.success) setMilestones(milestonesData.data || []);
      if (tasksData.success) setTasks(tasksData.data || []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ========================================
  // ゴール操作
  // ========================================
  const handleCreateGoal = async (data: { title: string; description: string }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, title: data.title, description: data.description }),
      });
      const result = await res.json();
      if (result.success) {
        setShowGoalForm(false);
        fetchAll();
      }
    } catch { /* ignore */ }
    finally { setIsSubmitting(false); }
  };

  const handleUpdateGoal = async (data: { title: string; description: string; status?: string }) => {
    if (!editingGoal) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/goals/${editingGoal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        setEditingGoal(null);
        fetchAll();
      }
    } catch { /* ignore */ }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) fetchAll();
    } catch { /* ignore */ }
  };

  // ========================================
  // マイルストーン操作
  // ========================================
  const handleCreateMilestone = async (data: {
    title: string;
    description: string;
    start_context: string;
    target_date: string;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          goal_id: milestoneGoalId,
          title: data.title,
          description: data.description,
          start_context: data.start_context,
          target_date: data.target_date,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setShowMilestoneForm(false);
        setMilestoneGoalId(null);
        fetchAll();
      }
    } catch { /* ignore */ }
    finally { setIsSubmitting(false); }
  };

  const handleUpdateMilestone = async (data: {
    title: string;
    description: string;
    start_context: string;
    target_date: string;
    status?: string;
  }) => {
    if (!editingMilestone) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/milestones/${editingMilestone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        setEditingMilestone(null);
        fetchAll();
      }
    } catch { /* ignore */ }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteMilestone = async (msId: string) => {
    try {
      const res = await fetch(`/api/milestones/${msId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) fetchAll();
    } catch { /* ignore */ }
  };

  // ========================================
  // タスクナビゲーション
  // ========================================
  const handleTaskClick = (taskId: string) => {
    window.location.href = `/tasks?id=${taskId}`;
  };

  // ========================================
  // データ分類
  // ========================================
  // ゴール付きマイルストーン
  const goalMilestones = (goalId: string) =>
    milestones.filter((ms) => ms.goal_id === goalId);

  // ゴールなしマイルストーン
  const unassignedMilestones = milestones.filter((ms) => !ms.goal_id);

  // マイルストーンなしタスク（orphan）
  const orphanTasks = tasks.filter((t) => !t.milestone_id);

  // ========================================
  // ローディング
  // ========================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        <div className="text-center">
          <div className="animate-spin text-2xl mb-2">&#8987;</div>
          <p className="text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  // ========================================
  // 空状態
  // ========================================
  if (goals.length === 0 && milestones.length === 0 && tasks.length === 0) {
    return (
      <div className="py-6">
        <div className="flex items-center justify-center h-32 text-slate-400">
          <div className="text-center">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs mb-3">ゴール・マイルストーンがありません</p>
            <button
              onClick={() => setShowGoalForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              ゴールを追加
            </button>
          </div>
        </div>

        {/* ゴール作成モーダル */}
        <GoalForm
          isOpen={showGoalForm}
          onClose={() => setShowGoalForm(false)}
          onSubmit={handleCreateGoal}
          isLoading={isSubmitting}
        />
      </div>
    );
  }

  // ========================================
  // メインUI
  // ========================================
  return (
    <div className="py-2 space-y-3">
      {/* ゴール追加ボタン */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowGoalForm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          ゴール追加
        </button>
      </div>

      {/* ゴール付きセクション */}
      {goals.map((goal) => (
        <GoalSection
          key={goal.id}
          goal={goal}
          milestones={goalMilestones(goal.id)}
          tasks={tasks.filter((t) => {
            const goalMsIds = goalMilestones(goal.id).map((ms) => ms.id);
            return t.milestone_id && goalMsIds.includes(t.milestone_id);
          })}
          onEditGoal={() => setEditingGoal(goal)}
          onDeleteGoal={() => handleDeleteGoal(goal.id)}
          onAddMilestone={() => {
            setMilestoneGoalId(goal.id);
            setShowMilestoneForm(true);
          }}
          onEditMilestone={(ms) => setEditingMilestone(ms)}
          onDeleteMilestone={handleDeleteMilestone}
          onAddTask={(msId) => setAddingTaskForMilestone(msId)}
          onTaskClick={handleTaskClick}
        />
      ))}

      {/* ゴールなしセクション */}
      {(unassignedMilestones.length > 0 || orphanTasks.length > 0) && (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
            <Flag className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">ゴールなし</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {unassignedMilestones.map((ms) => {
              const msTasks = tasks.filter((t) => t.milestone_id === ms.id);
              return (
                <MilestoneSection
                  key={ms.id}
                  milestone={ms}
                  tasks={msTasks}
                  onEdit={() => setEditingMilestone(ms)}
                  onDelete={() => handleDeleteMilestone(ms.id)}
                  onAddTask={() => setAddingTaskForMilestone(ms.id)}
                  onTaskClick={handleTaskClick}
                />
              );
            })}

            {/* マイルストーン未紐づけタスク */}
            {orphanTasks.length > 0 && (
              <div className="ml-4 pl-3 border-l-2 border-dashed border-slate-200">
                <p className="text-[10px] text-slate-400 py-1">マイルストーン未設定のタスク</p>
                {orphanTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-100 rounded-md hover:bg-slate-50 transition-colors text-left mb-1"
                  >
                    <div className={`w-3.5 h-3.5 rounded border ${task.status === 'done' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`} />
                    <span className={`flex-1 text-xs truncate ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ゴールなしマイルストーン追加 */}
            <button
              onClick={() => {
                setMilestoneGoalId(null);
                setShowMilestoneForm(true);
              }}
              className="flex items-center gap-1.5 ml-4 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
              マイルストーン追加
            </button>
          </div>
        </div>
      )}

      {/* インラインタスク作成 */}
      {addingTaskForMilestone && (
        <InlineTaskForm
          milestoneId={addingTaskForMilestone}
          projectId={projectId}
          onCreated={() => {
            setAddingTaskForMilestone(null);
            fetchAll();
          }}
          onCancel={() => setAddingTaskForMilestone(null)}
        />
      )}

      {/* ゴール作成/編集モーダル */}
      <GoalForm
        isOpen={showGoalForm || !!editingGoal}
        onClose={() => { setShowGoalForm(false); setEditingGoal(null); }}
        onSubmit={editingGoal ? handleUpdateGoal : handleCreateGoal}
        initialData={editingGoal ? {
          title: editingGoal.title,
          description: editingGoal.description || '',
          status: editingGoal.status,
        } : undefined}
        isLoading={isSubmitting}
      />

      {/* マイルストーン作成/編集モーダル */}
      <MilestoneForm
        isOpen={showMilestoneForm || !!editingMilestone}
        onClose={() => { setShowMilestoneForm(false); setEditingMilestone(null); setMilestoneGoalId(null); }}
        onSubmit={editingMilestone ? handleUpdateMilestone : handleCreateMilestone}
        initialData={editingMilestone ? {
          title: editingMilestone.title,
          description: editingMilestone.description || '',
          start_context: editingMilestone.start_context || '',
          target_date: editingMilestone.target_date || '',
          status: editingMilestone.status,
        } : undefined}
        isLoading={isSubmitting}
      />
    </div>
  );
}
