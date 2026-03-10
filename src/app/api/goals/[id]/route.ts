// v4.0: ゴール個別 API（GET / PUT / DELETE）— 旧 /api/themes/[id]
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ゴール詳細取得
export async function GET(
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

    const { data, error } = await supabase
      .from('goals')
      .select('*, milestones(id, title, status)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Goals API] 詳細取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Goals API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ゴールの取得に失敗しました' }, { status: 500 });
  }
}

// ゴール更新
export async function PUT(
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
    const { title, description, status, phase_order, sort_order } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (phase_order !== undefined) updateData.phase_order = phase_order;
    if (sort_order !== undefined) updateData.phase_order = sort_order;

    const { data, error } = await supabase
      .from('goals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Goals API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Goals API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ゴールの更新に失敗しました' }, { status: 500 });
  }
}

// ゴール削除（milestones.goal_id は ON DELETE SET NULL）
export async function DELETE(
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

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Goals API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Goals API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ゴールの削除に失敗しました' }, { status: 500 });
  }
}
