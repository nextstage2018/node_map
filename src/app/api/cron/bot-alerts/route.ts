// v4.4 Cron: アラート配信（stale/期限超過/MS接近）
// スケジュール: 毎日 00:30 UTC（= JST 09:30）
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

    console.log('[BotAlerts] Cron開始');

    const {
      getAllProjectChannels,
      generateAlerts,
      deliverMessage,
    } = await import('@/services/v44/botMessageFormatter.service');

    const channels = await getAllProjectChannels();
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    // プロジェクトごとに1回だけアラート生成（同PJに複数チャネルがある場合の重複防止用キャッシュ）
    const alertCache = new Map<string, string | null>();

    for (const ch of channels) {
      try {
        let alertText: string | null;

        if (alertCache.has(ch.project_id)) {
          alertText = alertCache.get(ch.project_id) || null;
        } else {
          alertText = await generateAlerts(ch.project_id, ch.relationship_type);
          alertCache.set(ch.project_id, alertText);
        }

        if (!alertText) {
          skipped++;
          continue;
        }

        const header = `【${ch.project_name}】\n${alertText}`;
        const ok = await deliverMessage(ch.service_name, ch.identifier, header);
        if (ok) sent++;
        else errors++;
      } catch (err) {
        console.error(`[BotAlerts] ${ch.project_name} エラー:`, err);
        errors++;
      }
    }

    console.log(`[BotAlerts] 完了: sent=${sent}, skipped=${skipped}, errors=${errors}`);
    return NextResponse.json({ success: true, sent, skipped, errors });
  } catch (error) {
    console.error('[BotAlerts] エラー:', error);
    return NextResponse.json({ success: false, error: 'アラート配信に失敗' }, { status: 500 });
  }
}
