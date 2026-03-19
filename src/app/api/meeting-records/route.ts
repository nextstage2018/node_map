// V2-D: 会議録 CRUD API（GET一覧 / POST作成）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 会議録一覧取得（meeting_date DESC）
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
    const recurringRuleId = searchParams.get('recurring_rule_id');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }

    let query = supabase
      .from('meeting_records')
      .select('*')
      .eq('project_id', projectId);

    // recurring_rule_id フィルタ（定期イベントの会議履歴用）
    if (recurringRuleId) {
      query = query.eq('recurring_rule_id', recurringRuleId);
    }

    const { data, error } = await query.order('meeting_date', { ascending: false });

    if (error) {
      console.error('[MeetingRecords API] 一覧取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[MeetingRecords API] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録一覧の取得に失敗しました' }, { status: 500 });
  }
}

// 会議録作成
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
    const { project_id, title, meeting_date, content, source_type, source_file_id } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: '会議タイトルは必須です' }, { status: 400 });
    }
    if (!meeting_date) {
      return NextResponse.json({ success: false, error: '会議日は必須です' }, { status: 400 });
    }
    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: '会議内容は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('meeting_records')
      .insert({
        project_id,
        title: title.trim(),
        meeting_date,
        content: content.trim(),
        source_type: source_type || 'text',
        source_file_id: source_file_id || null,
        user_id: userId,
        processed: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[MeetingRecords API] 作成エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[MeetingRecords API] エラー:', error);
    return NextResponse.json({ success: false, error: '会議録の作成に失敗しました' }, { status: 500 });
  }
}
