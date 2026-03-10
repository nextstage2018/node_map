// v4.0 Phase 2: 未承認AI提案一覧取得API
// GET /api/task-suggestions/pending?project_id=xxx

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

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    let query = supabase
      .from('task_suggestions')
      .select('id, user_id, meeting_record_id, business_event_id, suggestions, status, created_at')
      .eq('status', 'pending')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const { data: suggestions, error } = await query;

    if (error) {
      console.error('[Task Suggestions Pending] クエリエラー:', error);
      return NextResponse.json({ error: '提案取得に失敗' }, { status: 500 });
    }

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // project_id フィルタ: suggestions JSONB 内の projectId でフィルタ
    let filtered = suggestions;
    if (projectId) {
      filtered = suggestions.filter(s => {
        const sug = s.suggestions as Record<string, unknown>;
        return sug?.projectId === projectId;
      });
    }

    // 会議録タイトルを付与
    const meetingIds = [...new Set(filtered.filter(s => s.meeting_record_id).map(s => s.meeting_record_id))];
    let meetingMap: Record<string, string> = {};

    if (meetingIds.length > 0) {
      const { data: meetings } = await supabase
        .from('meeting_records')
        .select('id, title')
        .in('id', meetingIds);
      if (meetings) {
        meetingMap = Object.fromEntries(meetings.map(m => [m.id, m.title]));
      }
    }

    const enriched = filtered.map(s => ({
      ...s,
      meeting_title: s.meeting_record_id ? meetingMap[s.meeting_record_id] || null : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[Task Suggestions Pending] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
