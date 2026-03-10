// v4.0 Phase 2: 個人タスク横断取得API
// GET /api/tasks/my?filter=today|this_week|overdue|all

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // 基本クエリ: 自分のタスク（doneは通常アーカイブ済みだが念のためフィルタ）
    let query = supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, phase, task_type,
        due_date, scheduled_start, scheduled_end,
        source_type, source_message_id, assigned_contact_id,
        project_id, milestone_id, created_at, updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // フィルター適用
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (filter === 'today') {
      // due_date が今日、またはスケジュール範囲内
      query = query.or(`due_date.eq.${today},and(scheduled_start.lte.${now.toISOString()},scheduled_end.gte.${now.toISOString()})`);
    } else if (filter === 'this_week') {
      // 今週の月曜〜日曜
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const mondayStr = monday.toISOString().split('T')[0];
      const sundayStr = sunday.toISOString().split('T')[0];
      query = query.gte('due_date', mondayStr).lte('due_date', sundayStr);
    } else if (filter === 'overdue') {
      query = query.lt('due_date', today).neq('status', 'done');
    }
    // filter === 'all' は追加フィルタなし

    const { data: tasks, error } = await query;

    if (error) {
      console.error('[Tasks My API] クエリエラー:', error);
      return NextResponse.json({ error: 'タスク取得に失敗' }, { status: 500 });
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // パンくず情報を付与（project, milestone, theme）
    const projectIds = [...new Set(tasks.filter(t => t.project_id).map(t => t.project_id))];
    const milestoneIds = [...new Set(tasks.filter(t => t.milestone_id).map(t => t.milestone_id))];

    let projectMap: Record<string, string> = {};
    let milestoneMap: Record<string, { title: string; theme_id?: string }> = {};
    let themeMap: Record<string, string> = {};

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
        .select('id, title, theme_id')
        .in('id', milestoneIds);
      if (milestones) {
        milestoneMap = Object.fromEntries(milestones.map(m => [m.id, { title: m.title, theme_id: m.theme_id }]));
        const themeIds = [...new Set(milestones.filter(m => m.theme_id).map(m => m.theme_id))];
        if (themeIds.length > 0) {
          const { data: themes } = await supabase
            .from('themes')
            .select('id, title')
            .in('id', themeIds);
          if (themes) {
            themeMap = Object.fromEntries(themes.map(t => [t.id, t.title]));
          }
        }
      }
    }

    // パンくず付きデータに変換
    const enrichedTasks = tasks.map(task => ({
      ...task,
      project_name: task.project_id ? projectMap[task.project_id] || null : null,
      milestone_title: task.milestone_id ? milestoneMap[task.milestone_id]?.title || null : null,
      theme_title: task.milestone_id && milestoneMap[task.milestone_id]?.theme_id
        ? themeMap[milestoneMap[task.milestone_id].theme_id!] || null
        : null,
    }));

    return NextResponse.json({ success: true, data: enrichedTasks });
  } catch (error) {
    console.error('[Tasks My API] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
