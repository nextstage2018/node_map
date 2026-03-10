// v4.0 Phase 2: 個人タスクカード — ワンタップでステータス変更
'use client';

import { useState } from 'react';
import { CheckCircle, Circle, Clock, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';

interface TaskProject {
  id: string;
  name: string;
  organizations?: { name: string } | null;
}

interface TaskMilestone {
  id: string;
  title: string;
  goals?: { id: string; title: string } | null;
}

export interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  phase: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  description: string | null;
  project_id: string | null;
  milestone_id: string | null;
  created_at: string;
  updated_at: string;
  projects: TaskProject | null;
  milestones: TaskMilestone | null;
}

interface MyTaskCardProps {
  task: MyTask;
  onStatusChange: (taskId: string, newStatus: string) => Promise<void>;
}

// 日付の差分を日数で返す
function getDaysDiff(dateStr: string): number {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const todayStr = jstNow.toISOString().split('T')[0];
  const today = new Date(todayStr);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// 期限の表示テキストと色
function getDueInfo(dueDate: string | null): { text: string; color: string; bgColor: string; borderColor: string } {
  if (!dueDate) return { text: '', color: '', bgColor: '', borderColor: '' };
  const diff = getDaysDiff(dueDate);
  if (diff < 0) return { text: `${Math.abs(diff)}日超過`, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
  if (diff === 0) return { text: '今日', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
  if (diff === 1) return { text: '明日', color: 'text-amber-500', bgColor: '', borderColor: '' };
  if (diff <= 7) return { text: `あと${diff}日`, color: 'text-slate-500', bgColor: '', borderColor: '' };
  return { text: `あと${diff}日`, color: 'text-slate-400', bgColor: '', borderColor: '' };
}

// 優先度のドットカラー
function getPriorityDot(priority: string): string {
  switch (priority) {
    case 'high': return 'bg-red-400';
    case 'medium': return 'bg-amber-400';
    case 'low': return 'bg-slate-300';
    default: return 'bg-slate-300';
  }
}

export default function MyTaskCard({ task, onStatusChange }: MyTaskCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const dueInfo = getDueInfo(task.due_date);
  const isDone = task.status === 'done';

  // パンくず: 組織名 > PJ名 > ゴール名 > MS名
  const breadcrumbs: string[] = [];
  if (task.projects) {
    if (task.projects.organizations && typeof task.projects.organizations === 'object' && 'name' in task.projects.organizations) {
      breadcrumbs.push(task.projects.organizations.name);
    }
    breadcrumbs.push(task.projects.name);
  }
  if (task.milestones) {
    if (task.milestones.goals && typeof task.milestones.goals === 'object' && 'title' in task.milestones.goals) {
      breadcrumbs.push(task.milestones.goals.title);
    }
    breadcrumbs.push(task.milestones.title);
  }

  const handleToggle = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      // 次のステータスを決定
      let nextStatus = 'done';
      if (task.status === 'todo') nextStatus = 'in_progress';
      else if (task.status === 'in_progress') nextStatus = 'done';

      await onStatusChange(task.id, nextStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  // カード背景色
  const cardBg = dueInfo.bgColor || 'bg-white';
  const cardBorder = dueInfo.borderColor || 'border-slate-200';

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-all ${cardBg} ${cardBorder} ${
        isDone ? 'opacity-50' : 'hover:shadow-sm'
      }`}
    >
      {/* チェックボックス */}
      <button
        onClick={handleToggle}
        disabled={isUpdating || isDone}
        className="mt-0.5 shrink-0 transition-colors"
        title={task.status === 'todo' ? '進行中にする' : task.status === 'in_progress' ? '完了にする' : '完了済み'}
      >
        {isUpdating ? (
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        ) : isDone ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : task.status === 'in_progress' ? (
          <Clock className="w-5 h-5 text-blue-500" />
        ) : (
          <Circle className="w-5 h-5 text-slate-300 hover:text-blue-400" />
        )}
      </button>

      {/* コンテンツ */}
      <div className="flex-1 min-w-0">
        {/* パンくず */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 mb-0.5 text-[10px] text-slate-400 truncate">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-2.5 h-2.5" />}
                <span className="truncate max-w-[100px]">{crumb}</span>
              </span>
            ))}
          </div>
        )}

        {/* タスク名 */}
        <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {task.title}
        </p>

        {/* メタ情報 */}
        <div className="flex items-center gap-2 mt-1">
          {/* 優先度ドット */}
          <span className={`w-2 h-2 rounded-full ${getPriorityDot(task.priority)}`} />

          {/* ステータスバッジ */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            task.status === 'in_progress'
              ? 'bg-blue-50 text-blue-600'
              : task.status === 'done'
                ? 'bg-green-50 text-green-600'
                : 'bg-slate-50 text-slate-500'
          }`}>
            {task.status === 'todo' ? '未着手' : task.status === 'in_progress' ? '進行中' : '完了'}
          </span>

          {/* 期限 */}
          {dueInfo.text && (
            <span className={`text-[10px] flex items-center gap-0.5 ${dueInfo.color}`}>
              {getDaysDiff(task.due_date!) < 0 && <AlertTriangle className="w-3 h-3" />}
              {dueInfo.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
