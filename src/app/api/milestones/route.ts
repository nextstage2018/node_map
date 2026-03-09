// V2-F + V2-I: マイルストーンAPI（一覧取得 + 作成）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ========================================
// POST: マイルストーン作成
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { project_id, theme_id, title, description, start_context, target_date } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ success: false, error: 'title は必須です' }, { status: 400 });
    }

    // 現在の最大sort_orderを取得
    const { data: existing } = await supabase
      .from('milestones')
      .select('sort_order')
      .eq('project_id', project_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing && existing.length > 0) ? (existing[0].sort_order || 0) + 1 : 0;

    const { data: milestone, error } = await supabase
      .from('milestones')
      .insert({
        project_id,
        theme_id: theme_id || null,
        title,
        description: description || null,
        start_context: start_context || null,
        target_date: target_date || null,
        status: 'not_started',
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('[Milestones] 作成エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: milestone });
  } catch (error) {
    console.error('[Milestones] POST エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーン作成に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }

    // マイルストーン一覧取得（配下のタスク数も取得）
    const { data: milestones, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('target_date', { ascending: true });

    if (error) {
      console.error('[Milestones] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 各マイルストーンのタスク進捗を取得
    const milestonesWithProgress = await Promise.all(
      (milestones || []).map(async (ms: { id: string }) => {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, status')
          .eq('milestone_id', ms.id);

        const total = (tasks || []).length;
        const completed = (tasks || []).filter((t: { status: string }) => t.status === 'done').length;

        return {
          ...ms,
          task_total: total,
          task_completed: completed,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: milestonesWithProgress,
    });
  } catch (error) {
    console.error('[Milestones] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーン取得に失敗しました' }, { status: 500 });
  }
}
