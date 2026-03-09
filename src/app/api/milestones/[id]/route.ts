// V2-C: マイルストーン個別 API（GET / PUT / DELETE）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// マイルストーン詳細取得（配下タスク数・完了数を含む）
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
      .from('milestones')
      .select('*, tasks:tasks(id, title, status, priority, due_date, phase, created_at)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Milestones API] 詳細取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tasks = data.tasks || [];
    const enriched = {
      ...data,
      task_count: tasks.length,
      completed_task_count: tasks.filter((t: any) => t.status === 'done').length,
    };

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[Milestones API] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーンの取得に失敗しました' }, { status: 500 });
  }
}

// マイルストーン更新
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
    const { title, description, start_context, target_date, achieved_date, status, sort_order, theme_id } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (start_context !== undefined) updateData.start_context = start_context?.trim() || null;
    if (target_date !== undefined) updateData.target_date = target_date || null;
    if (achieved_date !== undefined) updateData.achieved_date = achieved_date || null;
    if (status !== undefined) updateData.status = status;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (theme_id !== undefined) updateData.theme_id = theme_id || null;

    const { data, error } = await supabase
      .from('milestones')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Milestones API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Milestones API] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーンの更新に失敗しました' }, { status: 500 });
  }
}

// マイルストーン削除（tasks.milestone_id は ON DELETE SET NULL）
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
      .from('milestones')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Milestones API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Milestones API] エラー:', error);
    return NextResponse.json({ success: false, error: 'マイルストーンの削除に失敗しました' }, { status: 500 });
  }
}
