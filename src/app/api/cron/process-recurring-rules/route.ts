// v4.2 Cron: 繰り返しルールの自動処理
// スケジュール: 毎日 06:30 UTC（= JST 15:30）
// 各ルールの次回実行日を算出し、lead_days前に該当するものを自動生成
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

    console.log('[ProcessRecurringRules] Cron開始');

    const { processAllRecurringRules } = await import('@/services/v42/recurringRules.service');
    const stats = await processAllRecurringRules(userId);

    console.log(
      `[ProcessRecurringRules] 完了: processed=${stats.processed}, tasks=${stats.tasksCreated}, jobs=${stats.jobsCreated}, meetings=${stats.meetingsCreated}, skipped=${stats.skipped}, errors=${stats.errors}`
    );

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[ProcessRecurringRules] エラー:', error);
    return NextResponse.json(
      { success: false, error: '繰り返しルール処理に失敗しました' },
      { status: 500 }
    );
  }
}
