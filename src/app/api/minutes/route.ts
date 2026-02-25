// Phase 33: 議事録 API（POST）— business_eventsにmeeting型で保存
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: 議事録を作成（business_eventsにevent_type='meeting'で保存）
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
    const { projectId, content, participants, title } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '議事録の内容は必須です' },
        { status: 400 }
      );
    }

    // Phase 33: 参加者情報をcontentに含めて保存
    const participantNames = (participants || []).join(', ');
    const fullContent = participantNames
      ? `【参加者】${participantNames}\n\n${content.trim()}`
      : content.trim();

    const eventTitle = title?.trim() || `議事録 ${new Date().toLocaleDateString('ja-JP')}`;

    const { data, error } = await supabase
      .from('business_events')
      .insert({
        title: eventTitle,
        content: fullContent,
        event_type: 'meeting',
        project_id: projectId || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[Minutes API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Minutes API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '議事録の作成に失敗しました' },
      { status: 500 }
    );
  }
}
