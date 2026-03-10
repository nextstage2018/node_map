// v3.4: プロジェクト別 アジェンダ取得・生成API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { generateAgenda, updateAgendaStatus } from '@/services/v34/meetingAgenda.service';

export const dynamic = 'force-dynamic';

// GET: 最新アジェンダ取得（日付指定可）
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

    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD

    let query = supabase
      .from('meeting_agenda')
      .select('*')
      .eq('project_id', projectId)
      .order('meeting_date', { ascending: false });

    if (date) {
      query = query.eq('meeting_date', date);
    }

    const { data, error } = await query.limit(5);

    if (error) {
      console.error('[Agenda API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Agenda API] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}

// POST: アジェンダ生成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const meetingDate = body.meeting_date;

    if (!meetingDate) {
      return NextResponse.json({ success: false, error: 'meeting_date は必須です' }, { status: 400 });
    }

    const agenda = await generateAgenda(projectId, userId, meetingDate);

    if (!agenda) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'アジェンダ項目がないため、生成をスキップしました',
      });
    }

    return NextResponse.json({ success: true, data: agenda });
  } catch (error) {
    console.error('[Agenda API] 生成エラー:', error);
    return NextResponse.json({ success: false, error: '生成に失敗しました' }, { status: 500 });
  }
}

// PATCH: アジェンダステータス更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { agenda_id, status, linked_meeting_record_id } = body;

    if (!agenda_id || !status) {
      return NextResponse.json({ success: false, error: 'agenda_id と status は必須です' }, { status: 400 });
    }

    if (!['confirmed', 'completed'].includes(status)) {
      return NextResponse.json({ success: false, error: 'status は confirmed または completed のみ' }, { status: 400 });
    }

    const success = await updateAgendaStatus(agenda_id, status, linked_meeting_record_id);

    if (!success) {
      return NextResponse.json({ success: false, error: 'ステータス更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Agenda API] 更新エラー:', error);
    return NextResponse.json({ success: false, error: '更新に失敗しました' }, { status: 500 });
  }
}
