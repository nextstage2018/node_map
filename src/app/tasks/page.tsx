// v4.0 Phase 2: タスク管理ページ — 個人タスクを横断的に一覧表示
'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Plus, RefreshCw, AlertTriangle, Calendar, Clock, List } from 'lucide-react';
import MyTaskCard, { MyTask } from '@/components/tasks/MyTaskCard';

type FilterType = 'all' | 'today' | 'this_week' | 'overdue';

interface FilterTab {
  key: FilterType;
  label: string;
  icon: React.ReactNode;
  countKey?: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: 'today', label: '今日', icon: <Calendar className="w-3.5 h-3.5" />, countKey: 'today' },
  { key: 'this_week', label: '今週', icon: <Clock className="w-3.5 h-3.5" />, countKey: 'thisWeek' },
  { key: 'overdue', label: '期限切れ', icon: <AlertTriangle className="w-3.5 h-3.5" />, countKey: 'overdue' },
  { key: 'all', label: 'すべて', icon: <List className="w-3.5 h-3.5" /> },
];

export default function TasksPage() {
  const [filter, setFilter] = useState<FilterType>('today');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // タスク取得
  const fetchTasks = useCallback(async (currentFilter: FilterType, showLoading = true) => {
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      // all フィルターでカウント情報も取得
      const countRes = await fetch('/api/tasks/my?filter=all');
      const countData = await countRes.json();
      if (countData.success && countData.counts) {
        setCounts(countData.counts);
      }

      if (currentFilter === 'all') {
        // all は既に取得済み
        if (countData.success) {
          setTasks(countData.data || []);
        }
      } else {
        const res = await fetch(`/api/tasks/my?filter=${currentFilter}`);
        const data = await res.json();
        if (data.success) {
          setTasks(data.data || []);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(filter);
  }, [filter, fetchTasks]);

  // ステータス変更
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        // 完了したタスクはリストから除外（アニメーション後）
        if (newStatus === 'done') {
          setTimeout(() => {
            setTasks(prev => prev.filter(t => t.id !== taskId));
            // カウント更新
            fetchTasks(filter, false);
          }, 500);
        }
        // ローカル状態を即時更新
        setTasks(prev =>
          prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
        );
      }
    } catch {
      /* ignore */
    }
  };

  // プロジェクト別グルーピング（all フィルター時）
  const groupedByProject = filter === 'all'
    ? tasks.reduce((acc, task) => {
        const projName = task.projects?.name || '未分類';
        if (!acc[projName]) acc[projName] = [];
        acc[projName].push(task);
        return acc;
      }, {} as Record<string, MyTask[]>)
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="w-6 h-6 text-blue-600" />
          <h1 className="text-lg font-bold text-slate-900">タスク</h1>
          {counts.total !== undefined && (
            <span className="text-xs text-slate-400">{counts.total}件</span>
          )}
        </div>
        <button
          onClick={() => fetchTasks(filter, false)}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="更新"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1.5 mb-5 bg-slate-100 rounded-lg p-1">
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          const count = tab.countKey ? counts[tab.countKey] : undefined;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all flex-1 justify-center ${
                isActive
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {count !== undefined && count > 0 && (
                <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold ${
                  isActive
                    ? tab.key === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                    : tab.key === 'overdue' ? 'bg-red-100 text-red-500' : 'bg-slate-200 text-slate-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* タスク一覧 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="text-center">
            <div className="animate-spin text-2xl mb-2">&#8987;</div>
            <p className="text-sm">読み込み中...</p>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <div className="text-center">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm mb-1">
              {filter === 'today' && '今日のタスクはありません'}
              {filter === 'this_week' && '今週のタスクはありません'}
              {filter === 'overdue' && '期限切れのタスクはありません'}
              {filter === 'all' && 'タスクがありません'}
            </p>
            <p className="text-xs text-slate-300">
              {filter === 'overdue' ? '素晴らしい！すべて期限内です' : 'プロジェクトからタスクを追加してください'}
            </p>
          </div>
        </div>
      ) : filter === 'all' && groupedByProject ? (
        // all: プロジェクト別グルーピング
        <div className="space-y-6">
          {Object.entries(groupedByProject).map(([projName, projTasks]) => (
            <div key={projName}>
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                {projName}
              </h2>
              <div className="space-y-2">
                {projTasks.map((task) => (
                  <MyTaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // フィルター付き: フラット表示
        <div className="space-y-2">
          {tasks.map((task) => (
            <MyTaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
