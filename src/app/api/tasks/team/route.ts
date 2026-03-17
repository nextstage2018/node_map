// v4.0 Phase 2: チームタスク取得API
// GET /api/tasks/team?project_id=xxx

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
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id は必須です' }, { status: 400 });
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // チームタスク: task_type='group' OR assigned_contact_id が設定されているタスク
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, priority, phase, task_type,
        due_date, scheduled_start, scheduled_end,
        source_type, source_message_id, assigned_contact_id,
        project_id, milestone_id, created_at, updated_at
      `)
      .eq('project_id', projectId)
      .or('task_type.eq.group,assigned_contact_id.not.is.null')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Tasks Team API] クエリエラー:', error);
      return NextResponse.json({ error: 'チームタスク取得に失敗' }, { status: 500 });
    }

    // 担当者名を付与
    const contactIds = [...new Set((tasks || []).filter(t => t.assigned_contact_id).map(t => t.assigned_contact_id))];
    let contactMap: Record<string, string> = {};

    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contact_persons')
        .select('id, display_name')
        .in('id', contactIds);
      if (contacts) {
        contactMap = Object.fromEntries(contacts.map(c => [c.id, c.display_name]));
      }
    }

    // マイルストーン情報（テーマは廃止済み: v8.0）
    const milestoneIds = [...new Set((tasks || []).filter(t => t.milestone_id).map(t => t.milestone_id))];
    let milestoneMap: Record<string, string> = {};

    if (milestoneIds.length > 0) {
      const { data: milestones } = await supabase
        .from('milestones')
        .select('id, title')
        .in('id', milestoneIds);
      if (milestones) {
        milestoneMap = Object.fromEntries(milestones.map(m => [m.id, m.title]));
      }
    }

    const enrichedTasks = (tasks || []).map(task => ({
      ...task,
      assignee_name: task.assigned_contact_id ? contactMap[task.assigned_contact_id] || null : null,
      milestone_title: task.milestone_id ? milestoneMap[task.milestone_id] || null : null,
    }));

    return NextResponse.json({ success: true, data: enrichedTasks });
  } catch (error) {
    console.error('[Tasks Team API] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
