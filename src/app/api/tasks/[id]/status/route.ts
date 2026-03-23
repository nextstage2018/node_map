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
      // 完了の場合: ステータス更新 → 通知 → ビジネスイベント記録
      // タスク本体はDBに残す（思考マップ・チェックポイント結果の参照に必要）
      try {
        // タスク情報を取得
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, project_id, milestone_id, calendar_event_id, source_type, source_message_id')
          .eq('id', taskId)
          .single();

        if (!task) {
          return NextResponse.json({ error: 'タスクが見つかりません' }, { status: 404 });
        }

        // ステータス更新（v11.0: completed_at追加）
        const now = new Date().toISOString();
        await supabase
          .from('tasks')
          .update({ status: 'done', updated_at: now, completed_at: now })
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

        // v8.0: マイルストーン進捗自動更新
        if (task.milestone_id) {
          try {
            const { updateMilestoneProgress } = await import('@/services/v8/milestoneProgress.service');
            await updateMilestoneProgress(taskId, task.milestone_id);
          } catch (e) {
            console.error('[Status API] v8.0 MS進捗更新エラー:', e);
          }
        }

        // Slack/Chatwork完了通知
        try {
          const { notifyTaskCompletion } = await import('@/services/v4/taskCompletionNotify.service');
          await notifyTaskCompletion(taskId, userId);
        } catch (e) {
          console.error('[Status API] 完了通知エラー:', e);
        }

        // ビジネスイベントに完了記録
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
          console.error('[Status API] ビジネスイベント記録エラー:', e);
        }

        // タスクはDBに残す（思考マップ・会話履歴・チェックポイント結果の参照に必要）
        // ステータス更新は上部の notifyTaskCompletion 内で実施済み

        return NextResponse.json({
          success: true,
          data: { id: taskId, status: 'done' },
        });
      } catch (error) {
        console.error('[Status API] 完了処理エラー:', error);
        return NextResponse.json({ error: '完了処理に失敗' }, { status: 500 });
      }
    } else {
      // todo / in_progress は単純更新（v11.0: completed_atクリア）
      const { data, error } = await supabase
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString(), completed_at: null })
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
