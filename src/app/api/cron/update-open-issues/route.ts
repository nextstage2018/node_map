// v3.4 Cron: 未確定事項の滞留日数更新・優先度再計算・stale自動検知
// スケジュール: 毎日 22:30 UTC（analyze-contactsの後）
import { NextRequest, NextResponse } from 'next/server';
import { updateStagnationAndPriority } from '@/services/v34/openIssues.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[UpdateOpenIssues] Cron開始');

    const stats = await updateStagnationAndPriority();

    console.log(`[UpdateOpenIssues] 完了: updated=${stats.updated}, staled=${stats.staled}, errors=${stats.errors}`);

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[UpdateOpenIssues] エラー:', error);
    return NextResponse.json(
      { success: false, error: '未確定事項の更新に失敗しました' },
      { status: 500 }
    );
  }
}
