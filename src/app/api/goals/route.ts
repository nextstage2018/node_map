// v4.0: ゴール CRUD API（GET一覧 / POST作成）— 旧 /api/themes
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ゴール一覧取得
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

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('project_id', projectId)
      .order('phase_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Goals API] 一覧取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Goals API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ゴール一覧の取得に失敗しました' }, { status: 500 });
  }
}

// ゴール作成
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
    const { project_id, title, description, phase_order, sort_order } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'ゴール名は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('goals')
      .insert({
        project_id,
        title: title.trim(),
        description: description?.trim() || null,
        phase_order: phase_order ?? sort_order ?? 0,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('[Goals API] 作成エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Goals API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ゴールの作成に失敗しました' }, { status: 500 });
  }
}
