// v4.1: タスク → Googleカレンダー同期API
// POST /api/tasks/[id]/calendar-sync
// タスクの scheduled_start/end を [NM-Task] プレフィックス付きで時間枠イベントとして登録
// scheduled_start/end が未設定の場合はリクエストボディから受け取って自動設定

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

    // リクエストボディ解析
    let estimatedHours: number | undefined;
    let scheduledStart: string | undefined;
    let scheduledEnd: string | undefined;
    try {
      const body = await request.json();
      estimatedHours = body.estimated_hours;
      scheduledStart = body.scheduled_start;
      scheduledEnd = body.scheduled_end;
    } catch {
      // bodyなしでもOK
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();

    if (supabase) {
      // 現在のタスクを確認
      const { data: task } = await supabase
        .from('tasks')
        .select('scheduled_start, scheduled_end')
        .eq('id', taskId)
        .single();

      // スケジュール未設定 & リクエストに値がある → 自動設定
      const updateData: Record<string, unknown> = {};
      if (!task?.scheduled_start && scheduledStart) {
        updateData.scheduled_start = scheduledStart;
      }
      if (!task?.scheduled_end && scheduledEnd) {
        updateData.scheduled_end = scheduledEnd;
      }
      if (estimatedHours !== undefined) {
        updateData.estimated_hours = estimatedHours;
      }

      // スケジュール未設定 & リクエストにも値がない → デフォルト（翌営業日 10:00-11:00）
      if (!task?.scheduled_start && !scheduledStart) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        // 土日スキップ
        while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
          tomorrow.setDate(tomorrow.getDate() + 1);
        }
        tomorrow.setHours(10, 0, 0, 0);
        const endTime = new Date(tomorrow);
        endTime.setHours(11, 0, 0, 0);
        updateData.scheduled_start = tomorrow.toISOString();
        updateData.scheduled_end = endTime.toISOString();
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();
        await supabase
          .from('tasks')
          .update(updateData)
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
