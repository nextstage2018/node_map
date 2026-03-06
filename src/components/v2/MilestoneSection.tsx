// V2-C: マイルストーンセクション（配下タスク一覧 + 進捗バー）
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Flag, Plus, Pencil, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import MoreMenu from '@/components/shared/MoreMenu';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  phase: string;
  created_at: string;
}

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  start_context: string | null;
  target_date: string | null;
  achieved_date: string | null;
  status: string;
  task_count: number;
  completed_task_count: number;
}

interface MilestoneSectionProps {
  milestone: Milestone;
  tasks: Task[];
  onEdit: () => void;
  onDelete: () => void;
  onAddTask: () => void;
  onTaskClick: (taskId: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '未開始', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: '進行中', color: 'bg-blue-100 text-blue-700' },
  achieved: { label: '達成', color: 'bg-green-100 text-green-700' },
  missed: { label: '未達', color: 'bg-red-100 text-red-700' },
};

const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
  in_progress: <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />,
  todo: <div className="w-3.5 h-3.5 rounded border border-slate-300" />,
};

export default function MilestoneSection({
  milestone,
  tasks,
  onEdit,
  onDelete,
  onAddTask,
  onTaskClick,
}: MilestoneSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const badge = STATUS_BADGE[milestone.status] || STATUS_BADGE.pending;
  const progress = milestone.task_count > 0
    ? Math.round((milestone.completed_task_count / milestone.task_count) * 100)
    : 0;

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete();
  };

  return (
    <div className="ml-4 border-l-2 border-slate-200 pl-3">
      {/* マイルストーンヘッダー */}
      <div className="flex items-center gap-2 py-1.5 group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <Flag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="text-xs font-medium text-slate-800 truncate">{milestone.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.color}`}>
          {badge.label}
        </span>
        {milestone.target_date && (
          <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {new Date(milestone.target_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <MoreMenu
            items={[
              { label: '編集', icon: <Pencil className="w-3.5 h-3.5" />, onClick: onEdit },
              { label: '削除', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => setShowDeleteDialog(true), variant: 'danger' },
            ]}
          />
        </div>
      </div>

      {/* 進捗バー */}
      {milestone.task_count > 0 && (
        <div className="ml-6 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">
              {milestone.completed_task_count}/{milestone.task_count}
            </span>
          </div>
        </div>
      )}

      {/* タスク一覧 */}
      {isExpanded && (
        <div className="ml-6 space-y-1 pb-2">
          {tasks.length === 0 && (
            <p className="text-[10px] text-slate-400 py-1">タスクなし</p>
          )}
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-100 rounded-md hover:bg-slate-50 transition-colors text-left"
            >
              {TASK_STATUS_ICON[task.status] || TASK_STATUS_ICON.todo}
              <span className={`flex-1 text-xs truncate ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                {task.title}
              </span>
              {task.due_date && (
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(task.due_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </button>
          ))}

          {/* タスク追加ボタン */}
          <button
            onClick={onAddTask}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-3 h-3" />
            タスク追加
          </button>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title={`マイルストーン「${milestone.title}」を削除しますか？`}
        description="配下タスクのマイルストーン紐づけが解除されます。タスク自体は削除されません。"
      />
    </div>
  );
}
