// V2-C: マイルストーン CRUD API（GET一覧 / POST作成）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// マイルストーン一覧取得
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
    const themeId = searchParams.get('theme_id');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }

    let query = supabase
      .from('milestones')
      .select('*, tasks:tasks(id, status)')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (themeId) {
      query = query.eq('theme_id', themeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Milestones API] 一覧取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // タスク数・完了数を付与
    const enriched = (data || []).map((ms: any) => {
      const tasks = ms.tasks || [];
      return {
        ...ms,
        task_count: tasks.length,
        completed_task_count: tasks.filter((t: any) => t.status === 'done').length,
        tasks: undefined, // ネストしたtasksは除外
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[Milestones API] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーン一覧の取得に失敗しました' }, { status: 500 });
  }
}

// マイルストーン作成
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
    const { project_id, theme_id, title, description, start_context, target_date, sort_order } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'マイルストーン名は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('milestones')
      .insert({
        project_id,
        theme_id: theme_id || null,
        title: title.trim(),
        description: description?.trim() || null,
        start_context: start_context?.trim() || null,
        target_date: target_date || null,
        sort_order: sort_order ?? 0,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[Milestones API] 作成エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { ...data, task_count: 0, completed_task_count: 0 } });
  } catch (error) {
    console.error('[Milestones API] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーンの作成に失敗しました' }, { status: 500 });
  }
}
