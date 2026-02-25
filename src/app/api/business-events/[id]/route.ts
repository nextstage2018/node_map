// Phase 33: ビジネスイベント API（PUT / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// ビジネスイベント更新
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
    const { title, content, eventType, projectId, contactId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('business_events')
      .update({
        title: title.trim(),
        content: content?.trim() || null,
        event_type: eventType || 'note',
        project_id: projectId || null,
        contact_id: contactId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[BusinessEvents API] 更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// ビジネスイベント削除
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

    const { error } = await supabase
      .from('business_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[BusinessEvents API] 削除エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの削除に失敗しました' },
      { status: 500 }
    );
  }
}
