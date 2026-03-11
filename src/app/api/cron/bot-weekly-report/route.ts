// v4.4 Cron: 金曜レポート配信
// スケジュール: 金曜 08:00 UTC（= JST 17:00）
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[BotWeeklyReport] Cron開始');

    const {
      getAllProjectChannels,
      generateWeeklyReport,
      deliverMessage,
    } = await import('@/services/v44/botMessageFormatter.service');

    const channels = await getAllProjectChannels();
    let sent = 0;
    let errors = 0;

    for (const ch of channels) {
      try {
        const text = await generateWeeklyReport(ch.project_id, ch.relationship_type);
        if (!text) continue;

        const header = `【${ch.project_name}】\n${text}`;
        const ok = await deliverMessage(ch.service_name, ch.identifier, header);
        if (ok) sent++;
        else errors++;
      } catch (err) {
        console.error(`[BotWeeklyReport] ${ch.project_name} エラー:`, err);
        errors++;
      }
    }

    console.log(`[BotWeeklyReport] 完了: sent=${sent}, errors=${errors}`);
    return NextResponse.json({ success: true, sent, errors });
  } catch (error) {
    console.error('[BotWeeklyReport] エラー:', error);
    return NextResponse.json({ success: false, error: 'レポート配信に失敗' }, { status: 500 });
  }
}
