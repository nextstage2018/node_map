// v11.0: タスク分析ダッシュボード（振り返り）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Users, Calendar, TrendingUp, CheckCircle, Clock, AlertCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import AppLayout from '@/components/shared/AppLayout';
import WeeklySummaryCards from '@/components/analytics/WeeklySummaryCards';
import DailyTaskSummary from '@/components/analytics/DailyTaskSummary';
import WeeklyTaskChart from '@/components/analytics/WeeklyTaskChart';
import DeadlineStatusCards from '@/components/analytics/DeadlineStatusCards';
import MemberProgressTable from '@/components/analytics/MemberProgressTable';
import ProjectProgressTable from '@/components/analytics/ProjectProgressTable';

interface AnalyticsData {
  period: { start: string; end: string; label: string };
  summary: { created: number; completed: number; involved: number };
  today: {
    created_as_requester: number;
    created_as_assignee: number;
    completed_as_requester: number;
    completed_as_assignee: number;
  };
  daily_chart: { date: string; day: string; created: number; completed: number }[];
  deadline_status: {
    with_deadline: { count: number; percent: number };
    no_deadline: { count: number; percent: number };
    on_track: { count: number; percent: number };
    overdue: { count: number; percent: number };
  };
  by_member: {
    contact_id: string;
    name: string;
    is_me: boolean;
    todo: number;
    in_progress: number;
    completed: number;
    overdue: number;
    total: number;
    completion_rate: number;
  }[];
  by_project: {
    project_id: string;
    project_name: string;
    org_name: string;
    total: number;
    completed: number;
    overdue: number;
    completion_rate: number;
  }[];
  members: { contact_id: string; name: string; is_me: boolean }[];
}

type PeriodType = 'week' | 'month';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('week');
  const [baseDate, setBaseDate] = useState<string>('');
  const [selectedContact, setSelectedContact] = useState<string>('');

  // 初期日付をセット
  useEffect(() => {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = jst.getUTCFullYear();
    const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(jst.getUTCDate()).padStart(2, '0');
    setBaseDate(`${y}-${m}-${d}`);
  }, []);

  const fetchData = useCallback(async () => {
    if (!baseDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, date: baseDate });
      if (selectedContact) params.set('contact_id', selectedContact);
      const res = await fetch(`/api/analytics/tasks?${params}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, baseDate, selectedContact]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 期間ナビゲーション
  const navigatePeriod = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      const now = new Date();
      const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const y = jst.getUTCFullYear();
      const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
      const d = String(jst.getUTCDate()).padStart(2, '0');
      setBaseDate(`${y}-${m}-${d}`);
      return;
    }

    const date = new Date(baseDate + 'T00:00:00+09:00');
    const offset = direction === 'prev' ? -1 : 1;

    if (period === 'week') {
      date.setDate(date.getDate() + offset * 7);
    } else {
      date.setMonth(date.getMonth() + offset);
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    setBaseDate(`${y}-${m}-${d}`);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-slate-50">
        {/* ヘッダー */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-bold text-slate-900">振り返り</h1>
            </div>
          </div>

          {/* フィルタバー */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            {/* メンバー選択 */}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <select
                value={selectedContact}
                onChange={(e) => setSelectedContact(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全員</option>
                {data?.members?.map(m => (
                  <option key={m.contact_id} value={m.contact_id}>
                    {m.name}{m.is_me ? '（自分）' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 期間切替 */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setPeriod('week')}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  period === 'week' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                週
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  period === 'month' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                月
              </button>
            </div>

            {/* 期間ナビ */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigatePeriod('prev')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigatePeriod('today')}
                className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {period === 'week' ? '今週' : '今月'}
              </button>
              <button
                onClick={() => navigatePeriod('next')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {data?.period && (
                <span className="ml-2 text-sm font-medium text-slate-700">
                  {data.period.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {loading && !data ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-sm text-slate-400">読み込み中...</div>
            </div>
          ) : data ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ① 週間サマリー */}
              <WeeklySummaryCards summary={data.summary} periodLabel={data.period.label} />

              {/* ② 1日のタスク */}
              <DailyTaskSummary today={data.today} />

              {/* ③ 週間タスクチャート */}
              <WeeklyTaskChart dailyChart={data.daily_chart} />

              {/* ④ 期限ステータス分布 */}
              <DeadlineStatusCards deadlineStatus={data.deadline_status} />

              {/* ⑤ メンバー別進捗 */}
              <MemberProgressTable members={data.by_member} />

              {/* ⑥ プロジェクト別進捗 */}
              <ProjectProgressTable projects={data.by_project} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-sm text-slate-400">データがありません</div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
