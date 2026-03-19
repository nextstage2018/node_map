// v4.2: 繰り返しルール個別操作 API（PUT / DELETE）
// PUT    /api/projects/[id]/recurring-rules/[ruleId] — ルール更新
// DELETE /api/projects/[id]/recurring-rules/[ruleId] — ルール削除

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ruleId } = await params;
    const body = await request.json();

    const { title, rrule, lead_days, calendar_sync, auto_create, metadata, enabled, meeting_group_id } = body;

    const { updateRecurringRule } = await import('@/services/v42/recurringRules.service');
    const updateInput: Record<string, unknown> = {
      title,
      rrule,
      lead_days,
      calendar_sync,
      auto_create,
      metadata,
      enabled,
    };
    // meeting_group_id が明示的に渡された場合のみ更新（undefinedの場合はスキップ）
    if (meeting_group_id !== undefined) {
      updateInput.meeting_group_id = meeting_group_id || null;
    }
    const rule = await updateRecurringRule(ruleId, updateInput);

    if (!rule) {
      return NextResponse.json({ error: '更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('[RecurringRules API] PUT エラー:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ruleId } = await params;

    // 削除前にルール情報を取得（カレンダーイベント削除用）
    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const sb = getServerSupabase() || getSupabase();
    let calendarEventId: string | null = null;
    if (sb) {
      const { data: rule } = await sb
        .from('project_recurring_rules')
        .select('metadata')
        .eq('id', ruleId)
        .single();
      calendarEventId = (rule?.metadata as Record<string, unknown>)?.calendar_event_id as string || null;
    }

    const { deleteRecurringRule } = await import('@/services/v42/recurringRules.service');
    const success = await deleteRecurringRule(ruleId);

    if (!success) {
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 400 });
    }

    // カレンダーイベントも削除
    let calendarDeleted = false;
    if (calendarEventId) {
      try {
        const { deleteCalendarEvent } = await import('@/services/calendar/calendarSync.service');
        const result = await deleteCalendarEvent(calendarEventId, userId);
        calendarDeleted = result.success;
        console.log('[RecurringRules] カレンダー削除:', result.success ? '成功' : result.error);
      } catch (err) {
        console.error('[RecurringRules] カレンダー削除エラー:', err);
      }
    }

    return NextResponse.json({ success: true, calendarDeleted });
  } catch (error) {
    console.error('[RecurringRules API] DELETE エラー:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
