// Phase 30d: ビジネスイベント API（GET / POST）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// ビジネスイベント一覧取得
export async function GET(request: NextRequest) {
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
      return NextResponse.json({ success: true, data: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const eventType = searchParams.get('event_type');

    let query = supabase
      .from('business_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[BusinessEvents API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ビジネスイベント作成
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { title, content, eventType, projectId, groupId, contactId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('business_events')
      .insert({
        title: title.trim(),
        content: content?.trim() || null,
        event_type: eventType || 'note',
        project_id: projectId || null,
        group_id: groupId || null,
        contact_id: contactId || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[BusinessEvents API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[BusinessEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベントの作成に失敗しました' },
      { status: 500 }
    );
  }
}
