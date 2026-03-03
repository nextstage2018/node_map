// Phase 51a: タスクに関連するビジネスイベント取得API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const sb = getServerSupabase() || getSupabase();

    // タスクのproject_idを取得
    const { data: task } = await sb
      .from('tasks')
      .select('project_id, title')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (!task) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ビジネスイベントを検索（タスクタイトルで部分一致 OR プロジェクト内のアーカイブイベント）
    let events: any[] = [];

    if (task.project_id) {
      const { data } = await sb
        .from('business_events')
        .select('id, title, event_type, event_date, ai_generated, created_at')
        .eq('project_id', task.project_id)
        .or(`title.ilike.%${task.title.slice(0, 30)}%,content.ilike.%${task.title.slice(0, 30)}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      events = data || [];
    }

    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    console.error('[Task Business Events] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
