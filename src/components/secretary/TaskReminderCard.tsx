// v9.0: タスクリマインダーカード
// 期限切れ / 今日 / 今週 のタスクを担当者別に表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, AlertTriangle, Clock, CalendarDays, Loader2, ExternalLink, User } from 'lucide-react';
import Link from 'next/link';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string | null;
  project_name?: string;
  assignee_name?: string;
  milestone_title?: string;
}

type FilterType = 'overdue' | 'today' | 'week';

export default function TaskReminderCard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('overdue');
  const [counts, setCounts] = useState({ overdue: 0, today: 0, week: 0 });

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      // タスク取得（自分のタスク＋チームタスク）
      const res = await fetch('/api/tasks/my?limit=50');
      const data = await res.json();

      if (data.success && data.data) {
        const allTasks: Task[] = data.data;
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        // 完了以外のタスクのみ
        const activeTasks = allTasks.filter((t) => t.status !== 'done');

        // フィルタ分類
        const overdue = activeTasks.filter((t) => t.due_date && t.due_date < todayStr);
        const todayTasks = activeTasks.filter((t) => t.due_date && t.due_date === todayStr);
        const weekTasks = activeTasks.filter((t) => t.due_date && t.due_date > todayStr && t.due_date <= weekEndStr);

        setCounts({
          overdue: overdue.length,
          today: todayTasks.length,
          week: weekTasks.length,
        });

        // 選択フィルタに応じてセット
        switch (filter) {
          case 'overdue': setTasks(overdue); break;
          case 'today': setTasks(todayTasks); break;
          case 'week': setTasks(weekTasks); break;
        }
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 担当者別グルーピング
  const groupedTasks = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const assignee = task.assignee_name || '自分';
    if (!acc[assignee]) acc[assignee] = [];
    acc[assignee].push(task);
    return acc;
  }, {});

  // 期限の残り日数
  const daysRemaining = (dueDate: string) => {
    const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)}日超過`;
    if (diff === 0) return '今日';
    return `${diff}日後`;
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-amber-500';
      default: return 'text-nm-text-muted';
    }
  };

  const filterConfig: { key: FilterType; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'overdue', label: '超過', icon: <AlertTriangle className="w-3 h-3" />, color: 'text-red-500 bg-red-50 border-red-200' },
    { key: 'today', label: '今日', icon: <Clock className="w-3 h-3" />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { key: 'week', label: '今週', icon: <CalendarDays className="w-3 h-3" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ];

  return (
    <div className="bg-nm-surface rounded-xl border border-nm-border shadow-sm flex flex-col" style={{ minHeight: '400px' }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nm-border">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-nm-primary" />
          <span className="text-sm font-medium text-nm-text">タスクリマインダー</span>
        </div>
        <Link href="/tasks" className="text-xs text-nm-primary hover:text-nm-primary-hover transition-colors flex items-center gap-1">
          タスク一覧
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* フィルタタブ */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-nm-border">
        {filterConfig.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`
              flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors
              ${filter === f.key ? f.color : 'text-nm-text-muted bg-white border-nm-border hover:bg-slate-50'}
            `}
          >
            {f.icon}
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`text-[10px] font-bold ${filter === f.key ? '' : 'text-nm-text-muted'}`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-nm-text-muted animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-nm-text-muted">
            <CheckSquare className="w-8 h-8 mb-2 opacity-40" />
            <span className="text-xs">
              {filter === 'overdue' ? '超過タスクはありません' :
               filter === 'today' ? '今日のタスクはありません' :
               '今週のタスクはありません'}
            </span>
          </div>
        ) : (
          <div className="px-4 py-2 space-y-3">
            {Object.entries(groupedTasks).map(([assignee, assigneeTasks]) => (
              <div key={assignee}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <User className="w-3 h-3 text-nm-text-muted" />
                  <span className="text-[10px] font-medium text-nm-text-secondary">
                    {assignee} ({assigneeTasks.length}件)
                  </span>
                </div>
                <div className="space-y-1 ml-4">
                  {assigneeTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks?taskId=${task.id}`}
                      className="block px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-nm-border"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          task.priority === 'high' ? 'bg-red-500' :
                          task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-nm-text truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {task.due_date && (
                              <span className={`text-[10px] ${filter === 'overdue' ? 'text-red-500 font-medium' : 'text-nm-text-muted'}`}>
                                {daysRemaining(task.due_date)}
                              </span>
                            )}
                            {task.project_name && (
                              <span className="text-[10px] text-nm-text-muted truncate">{task.project_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
