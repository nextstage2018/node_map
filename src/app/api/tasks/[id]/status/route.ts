// v4.0 Phase 2: タスクステータス クイック更新API
// ワンタップで todo → in_progress → done のステータス変更
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['todo', 'in_progress', 'done'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'status は todo / in_progress / done のいずれかを指定してください' },
        { status: 400 }
      );
    }

    // タスクの所有者確認
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('id, user_id, title, project_id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingTask) {
      return NextResponse.json({ success: false, error: 'タスクが見つかりません' }, { status: 404 });
    }

    // ステータス更新
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    // done に変更する場合は phase も done に
    if (status === 'done') {
      updateData.phase = 'done';
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select('id, title, status, phase, due_date, project_id, milestone_id, updated_at')
      .single();

    if (error) {
      console.error('[Tasks Status API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // done の場合はビジネスイベント自動追加（バックグラウンド）
    if (status === 'done' && existingTask.project_id) {
      try {
        await supabase.from('business_events').insert({
          project_id: existingTask.project_id,
          event_type: 'task_completed',
          title: `タスク完了: ${existingTask.title}`,
          content: `タスク「${existingTask.title}」が完了しました`,
          event_date: new Date().toISOString(),
          ai_generated: false,
        });
      } catch (evtErr) {
        console.error('[Tasks Status API] ビジネスイベント追加エラー（続行）:', evtErr);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Tasks Status API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ステータス更新に失敗しました' }, { status: 500 });
  }
}
