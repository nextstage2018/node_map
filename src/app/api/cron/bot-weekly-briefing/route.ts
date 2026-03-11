// v4.4 Cron: 月曜ブリーフィング配信
// スケジュール: 月曜 00:00 UTC（= JST 09:00）
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

    console.log('[BotWeeklyBriefing] Cron開始');

    const {
      getAllProjectChannels,
      generateWeeklyBriefing,
      deliverMessage,
    } = await import('@/services/v44/botMessageFormatter.service');

    const channels = await getAllProjectChannels();
    let sent = 0;
    let errors = 0;

    for (const ch of channels) {
      try {
        const text = await generateWeeklyBriefing(ch.project_id, ch.relationship_type);
        if (!text) continue;

        const header = `【${ch.project_name}】\n${text}`;
        const ok = await deliverMessage(ch.service_name, ch.identifier, header);
        if (ok) sent++;
        else errors++;
      } catch (err) {
        console.error(`[BotWeeklyBriefing] ${ch.project_name} エラー:`, err);
        errors++;
      }
    }

    console.log(`[BotWeeklyBriefing] 完了: sent=${sent}, errors=${errors}`);
    return NextResponse.json({ success: true, sent, errors });
  } catch (error) {
    console.error('[BotWeeklyBriefing] エラー:', error);
    return NextResponse.json({ success: false, error: 'ブリーフィング配信に失敗' }, { status: 500 });
  }
}
