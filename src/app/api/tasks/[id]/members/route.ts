// task_members API: グループタスクのメンバー管理
// GET: メンバー一覧取得
// POST: メンバー追加（+ カレンダー同期）
// DELETE: メンバー削除（+ カレンダー予定削除）

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: タスクメンバー一覧
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const sb = getServerSupabase() || getSupabase();

    const { data, error } = await sb
      .from('task_members')
      .select('*')
      .eq('task_id', taskId)
      .order('added_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const members = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      role: row.role,
      calendarEventId: row.calendar_event_id,
      addedAt: row.added_at,
    }));

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('[TaskMembers API] 取得エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: メンバー追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const body = await request.json();
    const { memberUserId, role } = body;

    if (!memberUserId) {
      return NextResponse.json({ error: 'memberUserId is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();

    const { data, error } = await sb
      .from('task_members')
      .upsert(
        { task_id: taskId, user_id: memberUserId, role: role || 'member' },
        { onConflict: 'task_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // カレンダー同期（タスクにスケジュールがある場合）
    try {
      const { data: task } = await sb
        .from('tasks')
        .select('scheduled_start, scheduled_end, title, description')
        .eq('id', taskId)
        .single();

      if (task?.scheduled_start && task?.scheduled_end) {
        const { isCalendarConnected, createEvent } = await import('@/services/calendar/calendarClient.service');
        const connected = await isCalendarConnected(memberUserId);
        if (connected) {
          const event = await createEvent(memberUserId, {
            summary: `[NodeMap] ${task.title}`,
            description: task.description || undefined,
            start: task.scheduled_start,
            end: task.scheduled_end,
          });
          if (event) {
            await sb
              .from('task_members')
              .update({ calendar_event_id: event.id })
              .eq('id', data.id);
          }
        }
      }
    } catch (calErr) {
      console.error('[TaskMembers API] カレンダー同期エラー:', calErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        taskId: data.task_id,
        userId: data.user_id,
        role: data.role,
        calendarEventId: data.calendar_event_id,
        addedAt: data.added_at,
      },
    });
  } catch (error) {
    console.error('[TaskMembers API] 追加エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: メンバー削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const { searchParams } = new URL(request.url);
    const memberUserId = searchParams.get('userId');

    if (!memberUserId) {
      return NextResponse.json({ error: 'userId query param is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();

    // メンバー情報を取得（カレンダー予定削除用）
    const { data: member } = await sb
      .from('task_members')
      .select('calendar_event_id')
      .eq('task_id', taskId)
      .eq('user_id', memberUserId)
      .single();

    // カレンダー予定を削除
    if (member?.calendar_event_id) {
      try {
        const { deleteCalendarEvent } = await import('@/services/calendar/calendarSync.service');
        await deleteCalendarEvent(member.calendar_event_id, memberUserId);
      } catch (calErr) {
        console.error('[TaskMembers API] カレンダー削除エラー:', calErr);
      }
    }

    // メンバー削除
    const { error } = await sb
      .from('task_members')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', memberUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[TaskMembers API] 削除エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
