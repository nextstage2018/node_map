// v4.0 Phase 2: タスク取得API（統合版）
// GET /api/tasks/my?filter=today|this_week|overdue|all&project_id=xxx
// project_id指定時: プロジェクト内の全メンバーのタスクを返す（担当者名付き）
// project_id未指定: 自分のタスクのみ返す

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getTodayJST, getJSTNow, toJSTDateString } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const projectId = searchParams.get('project_id');

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // show_all=true: プロジェクト未指定でも全タスクを返す（担当者フィルタ「全員」用）
    const showAll = searchParams.get('show_all') === 'true';

    // 基本クエリ
    let query = supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, phase, task_type,
        due_date, scheduled_start, scheduled_end,
        source_type, source_message_id, assigned_contact_id,
        project_id, milestone_id, created_at, updated_at, user_id
      `)
      .order('updated_at', { ascending: false });

    if (projectId) {
      // プロジェクト指定: プロジェクト内全タスク（メンバー全員分）
      query = query.eq('project_id', projectId);
    } else if (showAll) {
      // show_all: 全プロジェクトの全タスク（担当者名付き）
      // user_idフィルタなし → 全メンバーのタスクを返す
    } else {
      // プロジェクト未指定: 自分のタスクのみ
      query = query.eq('user_id', userId);
    }

    // フィルター適用
    const now = getJSTNow();
    const today = getTodayJST();

    if (filter === 'today') {
      query = query.or(`due_date.eq.${today},and(scheduled_start.lte.${now.toISOString()},scheduled_end.gte.${now.toISOString()})`);
    } else if (filter === 'this_week') {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const mondayStr = toJSTDateString(monday);
      const sundayStr = toJSTDateString(sunday);
      query = query.gte('due_date', mondayStr).lte('due_date', sundayStr);
    } else if (filter === 'overdue') {
      query = query.lt('due_date', today).neq('status', 'done');
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error('[Tasks My API] クエリエラー:', error);
      return NextResponse.json({ error: 'タスク取得に失敗' }, { status: 500 });
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // パンくず情報を付与（project, milestone）※テーマは廃止済み（v8.0）
    const projectIds = [...new Set(tasks.filter(t => t.project_id).map(t => t.project_id))];
    const milestoneIds = [...new Set(tasks.filter(t => t.milestone_id).map(t => t.milestone_id))];

    let projectMap: Record<string, string> = {};
    let milestoneMap: Record<string, string> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      if (projects) {
        projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
      }
    }

    if (milestoneIds.length > 0) {
      const { data: milestones } = await supabase
        .from('milestones')
        .select('id, title')
        .in('id', milestoneIds);
      if (milestones) {
        milestoneMap = Object.fromEntries(milestones.map(m => [m.id, m.title]));
      }
    }

    // 担当者名を付与（常に解決 — プロジェクト未指定の「自分」表示でも必要）
    let contactMap: Record<string, string> = {};
    const contactIds = [...new Set(tasks.filter(t => t.assigned_contact_id).map(t => t.assigned_contact_id))];
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contact_persons')
        .select('id, name')
        .in('id', contactIds);
      if (contacts) {
        contactMap = Object.fromEntries(contacts.map(c => [c.id, c.name]));
      }
    }

    // user_id → 名前の逆引きマップ（assigned_contact_idがnullの場合のフォールバック用）
    let userIdToNameMap: Record<string, string> = {};
    const uniqueUserIds = [...new Set(tasks.map(t => t.user_id).filter(Boolean))];
    if (uniqueUserIds.length > 0) {
      const { data: linkedContacts } = await supabase
        .from('contact_persons')
        .select('name, linked_user_id')
        .in('linked_user_id', uniqueUserIds);
      if (linkedContacts) {
        userIdToNameMap = Object.fromEntries(
          linkedContacts.map(c => [c.linked_user_id, c.name])
        );
      }
    }

    // パンくず + 担当者名付きデータに変換
    const enrichedTasks = tasks.map(task => ({
      ...task,
      project_name: task.project_id ? projectMap[task.project_id] || null : null,
      milestone_title: task.milestone_id ? milestoneMap[task.milestone_id] || null : null,
      // 優先順: assigned_contact_id → user_id逆引き → null
      assignee_name: task.assigned_contact_id
        ? contactMap[task.assigned_contact_id] || null
        : userIdToNameMap[task.user_id] || null,
    }));

    return NextResponse.json({ success: true, data: enrichedTasks });
  } catch (error) {
    console.error('[Tasks My API] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
