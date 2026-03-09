// Phase UI-3 + V2-I: ウェルカムダッシュボード（メッセージ未送信時の初期画面）
// V2-I: 「今週の進捗」「対応が必要なジョブ」カード追加 + 「今日のタスク」マイルストーン対応
'use client';

import { useState, useEffect } from 'react';
import {
  Mail, Calendar, CheckSquare, Zap, Loader2, Flag, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ========================================
// サマリーデータ型
// ========================================
interface DashboardSummary {
  unread: { total: number; slack: number; chatwork: number };
  calendar: { total: number; nextEvents: string[] };
  tasks: {
    total: number;
    inProgress: number;
    items: TodayTaskItem[];
  };
  jobs: { total: number; pendingApproval: number };
  milestones: {
    totalActive: number;
    completed: number;
    tasksDone: number;
    tasksTotal: number;
  };
  urgentJobs: UrgentJobItem[];
}

interface TodayTaskItem {
  id: string;
  title: string;
  projectName: string;
  milestoneName: string | null;
  orgId: string | null;
}

interface UrgentJobItem {
  id: string;
  title: string;
  scheduledDate: string | null;
  status: string;
}

interface RecentProjectItem {
  id: string;
  name: string;
  organizationName: string;
  msTotal: number;
  msCompleted: number;
  taskTotal: number;
  taskDone: number;
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
// 今日のタスク詳細リスト（マイルストーン付き）
// ========================================
function TodayTaskList({
  tasks,
  onSendMessage,
}: {
  tasks: TodayTaskItem[];
  onSendMessage: (message: string) => void;
}) {
  if (tasks.length === 0) return null;

  // プロジェクト＋マイルストーンでグループ化
  const groups = new Map<string, { projectName: string; milestoneName: string | null; tasks: TodayTaskItem[] }>();
  for (const t of tasks) {
    const key = `${t.projectName}::${t.milestoneName || 'none'}`;
    if (!groups.has(key)) {
      groups.set(key, { projectName: t.projectName, milestoneName: t.milestoneName, tasks: [] });
    }
    groups.get(key)!.tasks.push(t);
  }

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">今日のタスク ({tasks.length})</p>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {Array.from(groups.entries()).map(([key, group]) => (
          <div key={key} className="mb-3 last:mb-0">
            <p className="text-xs font-medium text-slate-500 mb-1">
              {group.projectName}
              {group.milestoneName && (
                <span className="text-slate-400"> &gt; {group.milestoneName}</span>
              )}
            </p>
            {group.tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onSendMessage(`タスク「${task.title}」を進めたい`)}
                className="flex items-center gap-2 w-full text-left py-1 pl-3 text-sm text-slate-700 hover:text-blue-600 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                <span>{task.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// 対応が必要なジョブリスト
// ========================================
function UrgentJobList({
  jobs,
  onSendMessage,
}: {
  jobs: UrgentJobItem[];
  onSendMessage: (message: string) => void;
}) {
  if (jobs.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">対応が必要なジョブ</p>
      <div className="bg-white rounded-xl border border-amber-200 p-4">
        {jobs.map((job) => (
          <button
            key={job.id}
            onClick={() => onSendMessage('対応が必要なことは？')}
            className="flex items-center justify-between w-full text-left py-1.5 text-sm text-slate-700 hover:text-amber-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>{job.title}</span>
            </div>
            {job.scheduledDate && (
              <span className="text-[11px] text-slate-400 flex-shrink-0 ml-2">
                期限: {job.scheduledDate}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ========================================
// v3.1: 最近のプロジェクトリスト
// ========================================
function RecentProjectList({
  projects,
  onSendMessage,
}: {
  projects: RecentProjectItem[];
  onSendMessage: (message: string) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">最近のプロジェクト</p>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {projects.map((proj) => {
          const taskPercent = proj.taskTotal > 0 ? Math.round((proj.taskDone / proj.taskTotal) * 100) : 0;
          return (
            <button
              key={proj.id}
              onClick={() => onSendMessage(`プロジェクト「${proj.id}」の進捗を教えて`)}
              className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                  {proj.name}
                </p>
                <p className="text-[11px] text-slate-400">{proj.organizationName || '組織未設定'}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">MS {proj.msCompleted}/{proj.msTotal}</p>
                  <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${taskPercent}%` }}
                    />
                  </div>
                </div>
                <span className="text-slate-300 group-hover:text-blue-400 transition-colors">→</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
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
  const [recentProjects, setRecentProjects] = useState<RecentProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      try {
        // 並列でAPIコール（既存4 + 新規2 + v3.1プロジェクト）
        const [msgRes, calRes, taskRes, jobRes, msRes, urgentJobRes, projRes] = await Promise.allSettled([
          fetch('/api/messages?unread=true&limit=1'),
          fetch('/api/calendar?mode=today'),
          fetch('/api/tasks?status=active&limit=1&include_project=true&include_milestone=true&today=true'),
          fetch('/api/jobs?status=pending&limit=1'),
          fetch('/api/milestones?status=in_progress&week=current'),
          fetch('/api/jobs?urgent=true&limit=5'),
          fetch('/api/projects?status=active&limit=5'),
        ]);

        if (cancelled) return;

        const unread = { total: 0, slack: 0, chatwork: 0 };
        if (msgRes.status === 'fulfilled' && msgRes.value.ok) {
          const data = await msgRes.value.json();
          if (data.success) {
            unread.total = data.data?.totalCount ?? data.data?.unreadCount ?? 0;
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

        const tasks = { total: 0, inProgress: 0, items: [] as TodayTaskItem[] };
        if (taskRes.status === 'fulfilled' && taskRes.value.ok) {
          const data = await taskRes.value.json();
          if (data.success) {
            tasks.total = data.data?.totalCount ?? data.data?.length ?? 0;
            tasks.inProgress = data.data?.inProgressCount ?? 0;
            // 今日のタスク詳細（マイルストーン名・プロジェクト名付き）
            if (data.data?.todayTasks && Array.isArray(data.data.todayTasks)) {
              tasks.items = data.data.todayTasks.map((t: {
                id: string;
                title: string;
                project_name?: string;
                milestone_name?: string;
                organization_id?: string;
              }) => ({
                id: t.id,
                title: t.title,
                projectName: t.project_name || '未分類',
                milestoneName: t.milestone_name || null,
                orgId: t.organization_id || null,
              }));
            }
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

        // V2-I: 今週のマイルストーン進捗
        const milestones = { totalActive: 0, completed: 0, tasksDone: 0, tasksTotal: 0 };
        if (msRes.status === 'fulfilled' && msRes.value.ok) {
          const data = await msRes.value.json();
          if (data.success && data.data) {
            milestones.totalActive = data.data.totalActive ?? 0;
            milestones.completed = data.data.completed ?? 0;
            milestones.tasksDone = data.data.tasksDone ?? 0;
            milestones.tasksTotal = data.data.tasksTotal ?? 0;
          }
        }

        // V2-I: 対応が必要なジョブ（期限3日以内）
        const urgentJobs: UrgentJobItem[] = [];
        if (urgentJobRes.status === 'fulfilled' && urgentJobRes.value.ok) {
          const data = await urgentJobRes.value.json();
          if (data.success && data.data?.jobs && Array.isArray(data.data.jobs)) {
            for (const j of data.data.jobs.slice(0, 5)) {
              urgentJobs.push({
                id: j.id,
                title: j.title,
                scheduledDate: j.scheduled_date || j.due_date || null,
                status: j.status,
              });
            }
          }
        }

        // v3.1: 最近のプロジェクト
        const recentProj: RecentProjectItem[] = [];
        if (projRes.status === 'fulfilled' && projRes.value.ok) {
          const data = await projRes.value.json();
          if (data.success && data.data && Array.isArray(data.data)) {
            for (const p of data.data.slice(0, 5)) {
              recentProj.push({
                id: p.id,
                name: p.name,
                organizationName: p.organization_name || p.organizations?.name || '',
                msTotal: p.ms_total ?? 0,
                msCompleted: p.ms_completed ?? 0,
                taskTotal: p.task_total ?? 0,
                taskDone: p.task_done ?? 0,
              });
            }
          }
        }
        if (!cancelled) setRecentProjects(recentProj);

        setSummary({ unread, calendar, tasks, jobs, milestones, urgentJobs });
      } catch {
        // サマリー取得失敗は無視（デフォルト0で表示）
        setSummary({
          unread: { total: 0, slack: 0, chatwork: 0 },
          calendar: { total: 0, nextEvents: [] },
          tasks: { total: 0, inProgress: 0, items: [] },
          jobs: { total: 0, pendingApproval: 0 },
          milestones: { totalActive: 0, completed: 0, tasksDone: 0, tasksTotal: 0 },
          urgentJobs: [],
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

  // V2-I: 今週の進捗detail
  const milestoneDetail = summary
    ? `MS達成: ${summary.milestones.completed}/${summary.milestones.totalActive}、タスク完了: ${summary.milestones.tasksDone}/${summary.milestones.tasksTotal}`
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
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
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
            {/* V2-I: 今週の進捗カード */}
            <SummaryCard
              icon={Flag}
              iconColor="text-red-600"
              bgColor="bg-red-50"
              borderColor="border-red-100"
              label="今週の進捗"
              count={summary?.milestones.totalActive ?? 0}
              detail={milestoneDetail}
              onClick={() => onSendMessage('マイルストーンの進捗を教えて')}
            />
          </div>

          {/* V2-I: 今日のタスク詳細リスト（マイルストーン付き） */}
          <TodayTaskList
            tasks={summary?.tasks.items ?? []}
            onSendMessage={onSendMessage}
          />

          {/* V2-I: 対応が必要なジョブ */}
          <UrgentJobList
            jobs={summary?.urgentJobs ?? []}
            onSendMessage={onSendMessage}
          />

          {/* v3.1: 最近のプロジェクト */}
          <RecentProjectList
            projects={recentProjects}
            onSendMessage={onSendMessage}
          />
        </>
      )}

      {/* よく使う操作 */}
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">よく使う操作</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'タスク作成', message: '新しいタスクを作成したい' },
            { label: '日程調整', message: '今週の空き時間を教えて' },
            { label: 'MS確認', message: 'マイルストーンの進捗を教えて' },
            { label: 'プロジェクト進捗', message: 'プロジェクトの進捗状況を教えて' },
            { label: '会議録登録', message: '会議録を登録したい' },
            { label: 'ジョブ確認', message: '対応が必要なことは？' },
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
