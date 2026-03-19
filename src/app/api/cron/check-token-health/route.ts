// v10.4 Cron: トークンヘルスチェック + チャネル通知
// スケジュール: 毎日 22:00 UTC（= JST 07:00）
// 全ユーザーのGoogle/Slack/Chatworkトークンを検証し、問題があればチャネルに通知

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

    console.log('[CheckTokenHealth] Cron開始');

    const { runTokenHealthCheckAndNotify } = await import(
      '@/services/tokenHealth/tokenHealthNotifier.service'
    );

    const result = await runTokenHealthCheckAndNotify();

    console.log('[CheckTokenHealth] 完了:', result);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CheckTokenHealth] Cronエラー:', error);
    return NextResponse.json(
      { error: 'Token health check failed' },
      { status: 500 }
    );
  }
}
