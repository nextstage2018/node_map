// v3.4 Cron: 全プロジェクトの翌営業日アジェンダ自動生成
// スケジュール: 毎日 05:00 UTC（update-open-issuesの後）
import { NextRequest, NextResponse } from 'next/server';
import { generateAgendasForAllProjects } from '@/services/v34/meetingAgenda.service';

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

    // ENV_TOKEN_OWNER_ID を使用（パーソナライズ対象ユーザー）
    const userId = process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'ENV_TOKEN_OWNER_ID が未設定です',
      }, { status: 400 });
    }

    console.log('[GenerateMeetingAgendas] Cron開始');

    const stats = await generateAgendasForAllProjects(userId);

    console.log(`[GenerateMeetingAgendas] 完了: generated=${stats.generated}, skipped=${stats.skipped}, errors=${stats.errors}`);

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[GenerateMeetingAgendas] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'アジェンダ生成に失敗しました' },
      { status: 500 }
    );
  }
}
