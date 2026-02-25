// Phase 30d: プロジェクト API（PUT / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクト更新
export async function PUT(
  request: NextRequest,
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

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'プロジェクト名は必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('projects')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        status: status || 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[Projects API] 更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// プロジェクト削除
export async function DELETE(
  request: NextRequest,
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

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const { id } = await params;

    // 関連するbusiness_eventsのproject_idをnullに
    await supabase
      .from('business_events')
      .update({ project_id: null })
      .eq('project_id', id)
      .eq('user_id', userId);

    // 関連するgroupsを削除
    await supabase
      .from('groups')
      .delete()
      .eq('project_id', id)
      .eq('user_id', userId);

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[Projects API] 削除エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトの削除に失敗しました' },
      { status: 500 }
    );
  }
}
