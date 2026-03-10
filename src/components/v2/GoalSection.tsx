// v4.0: ゴールセクション（折りたたみ + 配下マイルストーン）— 旧 ThemeSection
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import MoreMenu from '@/components/shared/MoreMenu';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import MilestoneSection from './MilestoneSection';

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

interface GoalSectionProps {
  goal: Goal;
  milestones: Milestone[];
  tasks: Task[];
  onEditGoal: () => void;
  onDeleteGoal: () => void;
  onAddMilestone: () => void;
  onEditMilestone: (ms: Milestone) => void;
  onDeleteMilestone: (msId: string) => void;
  onAddTask: (milestoneId: string) => void;
  onTaskClick: (taskId: string) => void;
}

const GOAL_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: 'アクティブ', color: 'bg-blue-50 text-blue-600' },
  completed: { label: '完了', color: 'bg-green-50 text-green-600' },
  archived: { label: 'アーカイブ', color: 'bg-slate-100 text-slate-500' },
};

export default function GoalSection({
  goal,
  milestones,
  tasks,
  onEditGoal,
  onDeleteGoal,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onAddTask,
  onTaskClick,
}: GoalSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const badge = GOAL_STATUS_BADGE[goal.status] || GOAL_STATUS_BADGE.active;

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDeleteGoal();
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* ゴールヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
        <span className="text-xs font-bold text-slate-800 truncate">{goal.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.color}`}>
          {badge.label}
        </span>
        {goal.description && (
          <span className="text-[10px] text-slate-400 truncate hidden sm:inline">{goal.description}</span>
        )}
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <MoreMenu
            items={[
              { label: '編集', icon: <Pencil className="w-3.5 h-3.5" />, onClick: onEditGoal },
              { label: '削除', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => setShowDeleteDialog(true), variant: 'danger' },
            ]}
          />
        </div>
      </div>

      {/* マイルストーン一覧 */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-1">
          {milestones.length === 0 && (
            <p className="text-[10px] text-slate-400 py-2 ml-4">マイルストーンなし</p>
          )}
          {milestones.map((ms) => {
            const msTasks = tasks.filter((t) => t.milestone_id === ms.id);
            return (
              <MilestoneSection
                key={ms.id}
                milestone={ms}
                tasks={msTasks}
                onEdit={() => onEditMilestone(ms)}
                onDelete={() => onDeleteMilestone(ms.id)}
                onAddTask={() => onAddTask(ms.id)}
                onTaskClick={onTaskClick}
              />
            );
          })}

          {/* マイルストーン追加ボタン */}
          <button
            onClick={onAddMilestone}
            className="flex items-center gap-1.5 ml-4 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-3 h-3" />
            マイルストーン追加
          </button>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title={`ゴール「${goal.title}」を削除しますか？`}
        description="配下マイルストーンのゴール紐づけが解除されます。マイルストーンとタスクは削除されません。"
      />
    </div>
  );
}
