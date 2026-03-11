// v4.1: タスク → Googleカレンダー同期API
// POST /api/tasks/[id]/calendar-sync
// タスクの scheduled_start/end を [NM-Task] プレフィックス付きで時間枠イベントとして登録

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

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

    // オプション: リクエストボディで工数情報を受け取る
    let estimatedHours: number | undefined;
    try {
      const body = await request.json();
      estimatedHours = body.estimated_hours;
    } catch {
      // bodyなしでもOK
    }

    // 工数情報がある場合はDBに保存
    if (estimatedHours !== undefined) {
      const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
      const supabase = getServerSupabase() || getSupabase();
      if (supabase) {
        await supabase
          .from('tasks')
          .update({ estimated_hours: estimatedHours })
          .eq('id', taskId);
      }
    }

    // カレンダー同期実行
    const { syncTaskToCalendar } = await import('@/services/calendar/calendarSync.service');
    const result = await syncTaskToCalendar(taskId, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'カレンダー同期に失敗しました' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        calendarEventId: result.calendarEventId,
        htmlLink: result.htmlLink,
      },
    });
  } catch (error) {
    console.error('[TaskCalendarSync] エラー:', error);
    return NextResponse.json(
      { error: 'カレンダー同期に失敗しました' },
      { status: 500 }
    );
  }
}
