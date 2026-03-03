// Phase 55: 会議メモからAIタスク提案API
import { NextResponse } from 'next/server';
import { getServerSupabase, createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';
import { suggestTasksFromMeeting } from '@/services/businessLog/taskSuggestion.service';

export const dynamic = 'force-dynamic';

// GET: 会議イベントの内容からタスク候補をAI提案
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // イベント取得
    const { data: event, error } = await supabase
      .from('business_events')
      .select('*, projects(name)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !event) {
      return NextResponse.json(
        { success: false, error: 'イベントが見つかりません' },
        { status: 404 }
      );
    }

    if (!event.content) {
      return NextResponse.json({
        success: true,
        data: { suggestions: [] },
      });
    }

    const projectName = (event.projects as { name?: string } | null)?.name || null;
    const suggestions = await suggestTasksFromMeeting(event.content, projectName);

    return NextResponse.json({
      success: true,
      data: { suggestions },
    });
  } catch (error) {
    console.error('[SuggestTasks API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスク提案の生成に失敗しました' },
      { status: 500 }
    );
  }
}
