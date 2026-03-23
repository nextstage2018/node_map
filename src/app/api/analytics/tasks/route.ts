// v11.0: タスク分析ダッシュボードAPI
// GET /api/analytics/tasks?period=week&date=2026-03-23&contact_id=xxx

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { getTodayJST } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// 期間の開始・終了日を計算
function getPeriodRange(period: string, dateStr: string): { start: string; end: string; label: string } {
  const date = new Date(dateStr + 'T00:00:00+09:00');

  if (period === 'month') {
    const y = date.getFullYear();
    const m = date.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return { start: startStr, end: endStr, label: `${y}年${m + 1}月` };
  }

  // week: 月曜始まり
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const startStr = fmt(monday);
  const endStr = fmt(sunday);
  const label = `${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}〜${String(sunday.getMonth() + 1).padStart(2, '0')}/${String(sunday.getDate()).padStart(2, '0')}`;

  return { start: startStr, end: endStr, label };
}

// 日本語曜日
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export async function GET(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
  }

  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) {
    return NextResponse.json({ success: true, data: null });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';
    const dateParam = searchParams.get('date') || getTodayJST();
    const contactId = searchParams.get('contact_id') || null;

    const { start, end, label } = getPeriodRange(period, dateParam);
    const today = getTodayJST();

    // 期間内の全タスクを取得（担当者・プロジェクト情報付き）
    let tasksQuery = supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, created_at, updated_at, completed_at, assigned_contact_id, requester_contact_id, project_id, user_id');

    const { data: allTasks, error: tasksError } = await tasksQuery;
    if (tasksError) {
      console.error('Tasks query error:', tasksError);
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 });
    }

    const tasks = allTasks || [];

    // メンバー情報取得（linked_user_id があるユーザーのみ = ログインユーザー）
    const { data: members } = await supabase
      .from('contact_persons')
      .select('id, name, linked_user_id')
      .not('linked_user_id', 'is', null);

    const memberMap = new Map<string, { name: string; linkedUserId: string }>();
    (members || []).forEach(m => {
      memberMap.set(m.id, { name: m.name, linkedUserId: m.linked_user_id });
    });

    // 自分のcontact_idを特定
    const myContact = (members || []).find(m => m.linked_user_id === userId);
    const myContactId = myContact?.id || null;

    // プロジェクト情報取得
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, organization_id');

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name');

    const orgMap = new Map<string, string>();
    (orgs || []).forEach(o => orgMap.set(o.id, o.name));

    const projectMap = new Map<string, { name: string; orgName: string }>();
    (projects || []).forEach(p => {
      projectMap.set(p.id, {
        name: p.name,
        orgName: orgMap.get(p.organization_id) || '',
      });
    });

    // フィルタ: contact_id指定時はそのメンバーのタスクのみ
    const filterByContact = (t: typeof tasks[0]) => {
      if (!contactId) return true;
      return t.assigned_contact_id === contactId || t.requester_contact_id === contactId;
    };

    // 期間内に作成されたタスク
    const createdInPeriod = tasks.filter(t => {
      const d = t.created_at?.split('T')[0];
      return d && d >= start && d <= end && filterByContact(t);
    });

    // 期間内に完了したタスク
    const completedInPeriod = tasks.filter(t => {
      const d = t.completed_at ? t.completed_at.split('T')[0] : t.status === 'done' ? t.updated_at?.split('T')[0] : null;
      return d && d >= start && d <= end && filterByContact(t);
    });

    // AI会話の関与（task_conversations）
    let involvedCount = 0;
    try {
      const { data: convos } = await supabase
        .from('task_conversations')
        .select('task_id')
        .eq('user_id', userId)
        .gte('created_at', start + 'T00:00:00+09:00')
        .lte('created_at', end + 'T23:59:59+09:00');

      const uniqueTasks = new Set((convos || []).map(c => c.task_id));
      involvedCount = uniqueTasks.size;
    } catch {
      // task_conversationsが存在しない場合は0
    }

    // ① 週間サマリー
    const summary = {
      created: createdInPeriod.length,
      completed: completedInPeriod.length,
      involved: involvedCount,
    };

    // ② 1日のタスク（today）
    const filterContact = contactId || myContactId;
    const todayCreated = tasks.filter(t => {
      const d = t.created_at?.split('T')[0];
      return d === today;
    });
    const todayCompleted = tasks.filter(t => {
      const d = t.completed_at ? t.completed_at.split('T')[0] : t.status === 'done' ? t.updated_at?.split('T')[0] : null;
      return d === today;
    });

    const todayStats = {
      created_as_requester: todayCreated.filter(t => filterContact && t.requester_contact_id === filterContact).length,
      created_as_assignee: todayCreated.filter(t => filterContact && t.assigned_contact_id === filterContact).length,
      completed_as_requester: todayCompleted.filter(t => filterContact && t.requester_contact_id === filterContact).length,
      completed_as_assignee: todayCompleted.filter(t => filterContact && t.assigned_contact_id === filterContact).length,
    };

    // ③ 日別チャート（期間内の各日）
    const dailyChart: { date: string; day: string; created: number; completed: number }[] = [];
    const current = new Date(start + 'T00:00:00+09:00');
    const endDate = new Date(end + 'T00:00:00+09:00');
    while (current <= endDate) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      const dayName = DAY_NAMES[current.getDay()];

      const dayCreated = createdInPeriod.filter(t => t.created_at?.split('T')[0] === dateStr).length;
      const dayCompleted = completedInPeriod.filter(t => {
        const d = t.completed_at ? t.completed_at.split('T')[0] : t.updated_at?.split('T')[0];
        return d === dateStr;
      }).length;

      dailyChart.push({ date: dateStr, day: dayName, created: dayCreated, completed: dayCompleted });
      current.setDate(current.getDate() + 1);
    }

    // ④ 期限ステータス分布（未完了タスクのみ）
    const activeTasks = tasks.filter(t => t.status !== 'done' && filterByContact(t));
    const withDeadline = activeTasks.filter(t => t.due_date);
    const noDeadline = activeTasks.filter(t => !t.due_date);
    const onTrack = withDeadline.filter(t => t.due_date! >= today);
    const overdue = withDeadline.filter(t => t.due_date! < today);
    const totalActive = activeTasks.length || 1;

    const deadlineStatus = {
      with_deadline: { count: withDeadline.length, percent: Math.round(withDeadline.length / totalActive * 100) },
      no_deadline: { count: noDeadline.length, percent: Math.round(noDeadline.length / totalActive * 100) },
      on_track: { count: onTrack.length, percent: Math.round(onTrack.length / totalActive * 100) },
      overdue: { count: overdue.length, percent: Math.round(overdue.length / totalActive * 100) },
    };

    // ⑤ メンバー別進捗
    const byMember: {
      contact_id: string;
      name: string;
      is_me: boolean;
      todo: number;
      in_progress: number;
      completed: number;
      overdue: number;
      total: number;
      completion_rate: number;
    }[] = [];

    (members || []).forEach(m => {
      const memberTasks = tasks.filter(t => t.assigned_contact_id === m.id);
      const todo = memberTasks.filter(t => t.status === 'todo').length;
      const inProgress = memberTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length;
      const completed = memberTasks.filter(t => {
        if (t.status !== 'done') return false;
        const d = t.completed_at ? t.completed_at.split('T')[0] : t.updated_at?.split('T')[0];
        return d && d >= start && d <= end;
      }).length;
      const overdueCount = memberTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length;
      const total = todo + inProgress + completed;

      if (total > 0 || overdueCount > 0) {
        byMember.push({
          contact_id: m.id,
          name: m.name,
          is_me: m.linked_user_id === userId,
          todo,
          in_progress: inProgress,
          completed,
          overdue: overdueCount,
          total: total || 1,
          completion_rate: total > 0 ? Math.round(completed / total * 100) : 0,
        });
      }
    });

    // 完了率降順でソート（自分を先頭に）
    byMember.sort((a, b) => {
      if (a.is_me && !b.is_me) return -1;
      if (!a.is_me && b.is_me) return 1;
      return b.completion_rate - a.completion_rate;
    });

    // ⑥ プロジェクト別進捗
    const projectIds = [...new Set(tasks.filter(filterByContact).map(t => t.project_id).filter(Boolean))];
    const byProject = projectIds.map(pid => {
      const pTasks = tasks.filter(t => t.project_id === pid && filterByContact(t));
      const total = pTasks.length;
      const completed = pTasks.filter(t => t.status === 'done').length;
      const overdueCount = pTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length;
      const pInfo = projectMap.get(pid!) || { name: '不明', orgName: '' };

      return {
        project_id: pid,
        project_name: pInfo.name,
        org_name: pInfo.orgName,
        total,
        completed,
        overdue: overdueCount,
        completion_rate: total > 0 ? Math.round(completed / total * 100) : 0,
      };
    }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

    // メンバー一覧（フィルタ用）
    const memberList = (members || []).map(m => ({
      contact_id: m.id,
      name: m.name,
      is_me: m.linked_user_id === userId,
    })).sort((a, b) => {
      if (a.is_me && !b.is_me) return -1;
      if (!a.is_me && b.is_me) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      data: {
        period: { start, end, label },
        summary,
        today: todayStats,
        daily_chart: dailyChart,
        deadline_status: deadlineStatus,
        by_member: byMember,
        by_project: byProject,
        members: memberList,
      },
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
