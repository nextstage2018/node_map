// v4.1 Cron: カレンダー備考のアジェンダ最終更新
// スケジュール: 毎日 12:00 UTC（= JST 21:00）
// 当日の進捗・新規決定を反映してカレンダー備考を上書き
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'ENV_TOKEN_OWNER_ID が未設定です',
      }, { status: 400 });
    }

    console.log('[UpdateMeetingAgendaDescriptions] Cron開始');

    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // 翌営業日のアジェンダを再生成して最新データを反映
    const { generateAgendasForAllProjects } = await import('@/services/v34/meetingAgenda.service');
    const stats = await generateAgendasForAllProjects(userId);

    console.log(
      `[UpdateMeetingAgendaDescriptions] 完了: generated=${stats.generated}, calendarUpdated=${stats.calendarUpdated}`
    );

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[UpdateMeetingAgendaDescriptions] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アジェンダ備考更新に失敗しました' },
      { status: 500 }
    );
  }
}
