// V2-D: 会議録個別 API（GET / PUT / DELETE）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 会議録詳細取得（ai_summary含む）
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
      .from('meeting_records')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[MeetingRecords API] 詳細取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[MeetingRecords API] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の取得に失敗しました' }, { status: 500 });
  }
}

// 会議録更新
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
    const { title, content, meeting_date, ai_summary, processed, project_id } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (meeting_date !== undefined) updateData.meeting_date = meeting_date;
    if (ai_summary !== undefined) updateData.ai_summary = ai_summary;
    if (processed !== undefined) updateData.processed = processed;
    if (project_id !== undefined) updateData.project_id = project_id;

    const { data, error } = await supabase
      .from('meeting_records')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MeetingRecords API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[MeetingRecords API] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の更新に失敗しました' }, { status: 500 });
  }
}

// 会議録削除
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
      .from('meeting_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MeetingRecords API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MeetingRecords API] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の削除に失敗しました' }, { status: 500 });
  }
}
