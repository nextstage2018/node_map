// Phase UI-3: ウェルカムダッシュボード（メッセージ未送信時の初期画面）
'use client';

import { useState, useEffect } from 'react';
import {
  Mail, Calendar, CheckSquare, Zap, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ========================================
// サマリーデータ型
// ========================================
interface DashboardSummary {
  unread: { total: number; slack: number; chatwork: number };
  calendar: { total: number; nextEvents: string[] };
  tasks: { total: number; inProgress: number };
  jobs: { total: number; pendingApproval: number };
}

// ========================================
// 時間帯に応じた挨拶
// ========================================
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'おはようございます';
  if (hour < 17) return 'こんにちは';
  return 'お疲れさまです';
}

function getDateString(): string {
  const now = new Date();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${now.getMonth() + 1}月${now.getDate()}日（${days[now.getDay()]}）`;
}

// ========================================
// サマリーカード
// ========================================
function SummaryCard({
  icon: Icon,
  iconColor,
  bgColor,
  borderColor,
  label,
  count,
  detail,
  onClick,
}: {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  label: string;
  count: number;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start p-4 rounded-xl border transition-all text-left',
        'hover:shadow-nm-md active:scale-[0.98]',
        bgColor, borderColor
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bgColor)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <span className="text-2xl font-bold text-slate-800">{count}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{detail}</p>
    </button>
  );
}

// ========================================
// WelcomeDashboard メインコンポーネント
// ========================================
export default function WelcomeDashboard({
  onSendMessage,
}: {
  onSendMessage: (message: string) => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      try {
        // 並列でAPIコール
        const [msgRes, calRes, taskRes, jobRes] = await Promise.allSettled([
          fetch('/api/messages?unread=true&limit=1'),
          fetch('/api/calendar/events?range=today'),
          fetch('/api/tasks?status=active&limit=1'),
          fetch('/api/jobs?status=pending&limit=1'),
        ]);

        if (cancelled) return;

        const unread = { total: 0, slack: 0, chatwork: 0 };
        if (msgRes.status === 'fulfilled' && msgRes.value.ok) {
          const data = await msgRes.value.json();
          if (data.success) {
            unread.total = data.data?.totalCount ?? data.data?.unreadCount ?? 0;
            // チャネルごとの内訳
            if (data.data?.channels) {
              unread.slack = data.data.channels.slack ?? 0;
              unread.chatwork = data.data.channels.chatwork ?? 0;
            }
          }
        }

        const calendar = { total: 0, nextEvents: [] as string[] };
        if (calRes.status === 'fulfilled' && calRes.value.ok) {
          const data = await calRes.value.json();
          if (data.success && data.data?.events) {
            calendar.total = data.data.events.length;
            calendar.nextEvents = data.data.events.slice(0, 2).map(
              (e: { startTime?: string; title?: string }) =>
                `${e.startTime ?? ''} ${e.title ?? ''}`
            );
          }
        }

        const tasks = { total: 0, inProgress: 0 };
        if (taskRes.status === 'fulfilled' && taskRes.value.ok) {
          const data = await taskRes.value.json();
          if (data.success) {
            tasks.total = data.data?.totalCount ?? data.data?.length ?? 0;
            tasks.inProgress = data.data?.inProgressCount ?? 0;
          }
        }

        const jobs = { total: 0, pendingApproval: 0 };
        if (jobRes.status === 'fulfilled' && jobRes.value.ok) {
          const data = await jobRes.value.json();
          if (data.success) {
            jobs.total = data.data?.totalCount ?? data.data?.length ?? 0;
            jobs.pendingApproval = data.data?.pendingCount ?? 0;
          }
        }

        setSummary({ unread, calendar, tasks, jobs });
      } catch {
        // サマリー取得失敗は無視（デフォルト0で表示）
        setSummary({
          unread: { total: 0, slack: 0, chatwork: 0 },
          calendar: { total: 0, nextEvents: [] },
          tasks: { total: 0, inProgress: 0 },
          jobs: { total: 0, pendingApproval: 0 },
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  const greeting = getGreeting();
  const dateString = getDateString();

  // サマリーカードのdetailテキスト
  const unreadDetail = summary
    ? [
        summary.unread.chatwork > 0 ? `CW: ${summary.unread.chatwork}` : '',
        summary.unread.slack > 0 ? `Slack: ${summary.unread.slack}` : '',
      ].filter(Boolean).join(' / ') || '新着なし'
    : '読み込み中...';

  const calendarDetail = summary
    ? summary.calendar.nextEvents.length > 0
      ? summary.calendar.nextEvents.join(' / ')
      : '予定なし'
    : '読み込み中...';

  const taskDetail = summary
    ? `進行中: ${summary.tasks.inProgress}`
    : '読み込み中...';

  const jobDetail = summary
    ? `承認待ち: ${summary.jobs.pendingApproval}`
    : '読み込み中...';

  return (
    <div className="max-w-2xl mx-auto py-6 px-2">
      {/* 挨拶 */}
      <div className="text-center mb-8">
        <p className="text-xl font-bold text-slate-800">{greeting}、伸二さん</p>
        <p className="text-sm text-slate-400 mt-1">今日は{dateString}です</p>
      </div>

      {/* サマリーカード 2x2 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-8">
          <SummaryCard
            icon={Mail}
            iconColor="text-blue-600"
            bgColor="bg-blue-50"
            borderColor="border-blue-100"
            label="未読"
            count={summary?.unread.total ?? 0}
            detail={unreadDetail}
            onClick={() => onSendMessage('新着メッセージを見せて')}
          />
          <SummaryCard
            icon={Calendar}
            iconColor="text-purple-600"
            bgColor="bg-purple-50"
            borderColor="border-purple-100"
            label="予定"
            count={summary?.calendar.total ?? 0}
            detail={calendarDetail}
            onClick={() => onSendMessage('今日の予定を教えて')}
          />
          <SummaryCard
            icon={CheckSquare}
            iconColor="text-green-600"
            bgColor="bg-green-50"
            borderColor="border-green-100"
            label="タスク"
            count={summary?.tasks.total ?? 0}
            detail={taskDetail}
            onClick={() => onSendMessage('今日やるタスクを教えて')}
          />
          <SummaryCard
            icon={Zap}
            iconColor="text-amber-600"
            bgColor="bg-amber-50"
            borderColor="border-amber-100"
            label="ジョブ"
            count={summary?.jobs.total ?? 0}
            detail={jobDetail}
            onClick={() => onSendMessage('対応が必要なことは？')}
          />
        </div>
      )}

      {/* よく使う操作 */}
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">よく使う操作</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'タスク作成', message: '新しいタスクを作成したい' },
            { label: '日程調整', message: '今週の空き時間を教えて' },
            { label: '下書き確認', message: '対応が必要なことは？' },
            { label: 'プロジェクト確認', message: 'プロジェクト一覧を見せて' },
            { label: 'ナレッジ確認', message: 'ナレッジの構造化提案を見せて' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => onSendMessage(action.message)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-nm-sm"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
