// v4.0 Phase 2: タスクステータスクイック更新API（D&D用）
// PATCH /api/tasks/[id]/status

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function PATCH(
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
    const { status } = body;

    if (!status || !['todo', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json({ error: '無効なステータス' }, { status: 400 });
    }

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    if (status === 'done') {
      // 完了の場合は既存のPUT /api/tasksの完了フローを呼び出す
      // 通知・ナレッジ・アーカイブ・削除の全パイプラインを実行
      try {
        // タスク情報を取得
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, project_id, calendar_event_id, source_type, source_message_id')
          .eq('id', taskId)
          .single();

        if (!task) {
          return NextResponse.json({ error: 'タスクが見つかりません' }, { status: 404 });
        }

        // ステータス更新
        await supabase
          .from('tasks')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .eq('id', taskId);

        // カレンダーイベント削除
        if (task.calendar_event_id) {
          try {
            const { deleteCalendarEvent } = await import('@/services/calendar/calendarSync.service');
            await deleteCalendarEvent(task.calendar_event_id, userId);
          } catch (e) {
            console.error('[Status API] カレンダー削除エラー:', e);
          }
        }

        // Slack/Chatwork完了通知
        try {
          const { notifyTaskCompletion } = await import('@/services/v4/taskCompletionNotify.service');
          await notifyTaskCompletion(taskId, userId);
        } catch (e) {
          console.error('[Status API] 完了通知エラー:', e);
        }

        // ビジネスイベントにアーカイブ
        try {
          await supabase.from('business_events').insert({
            user_id: userId,
            project_id: task.project_id,
            event_type: 'task_completed',
            content: `タスク完了: ${task.title}`,
            event_date: new Date().toISOString(),
            ai_generated: false,
          });
        } catch (e) {
          console.error('[Status API] アーカイブエラー:', e);
        }

        // タスク削除（アーカイブ後）
        await supabase.from('tasks').delete().eq('id', taskId);

        return NextResponse.json({
          success: true,
          data: { id: taskId, status: 'done', archived: true },
        });
      } catch (error) {
        console.error('[Status API] 完了処理エラー:', error);
        return NextResponse.json({ error: '完了処理に失敗' }, { status: 500 });
      }
    } else {
      // todo / in_progress は単純更新
      const { data, error } = await supabase
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select('id, title, status')
        .single();

      if (error) {
        console.error('[Status API] 更新エラー:', error);
        return NextResponse.json({ error: 'ステータス更新に失敗' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }
  } catch (error) {
    console.error('[Status API] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
