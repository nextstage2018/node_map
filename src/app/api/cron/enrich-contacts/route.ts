// Phase 26: Cron Job — コンタクト自動エンリッチ（毎日AM6:00 JST）
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 最大60秒（Vercel Hobby: 10s, Pro: 60s）

/**
 * GET /api/cron/enrich-contacts
 * Vercel Cron Jobsから毎日呼び出される
 * CRON_SECRET で認証し、/api/contacts/enrich を内部呼び出し
 */
export async function GET(request: NextRequest) {
  // Vercel Cron認証: CRON_SECRET ヘッダーチェック
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Cron/Enrich] 認証失敗: 不正なCRON_SECRET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/Enrich] 日次エンリッチ開始:', new Date().toISOString());

  try {
    // 内部APIを直接インポートして実行（Vercel内部のfetchは不安定なため）
    const { POST } = await import('@/app/api/contacts/enrich/route');

    // ダミーリクエストを生成してPOSTを呼び出し
    const internalRequest = new Request('http://localhost/api/contacts/enrich', {
      method: 'POST',
    });
    const result = await POST(internalRequest as unknown as NextRequest);
    const data = await result.json();

    console.log('[Cron/Enrich] 日次エンリッチ完了:', data);

    return NextResponse.json({
      success: true,
      message: `日次エンリッチ完了: ${data.enriched || 0}件更新`,
      ...data,
    });
  } catch (error) {
    console.error('[Cron/Enrich] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Cron実行に失敗しました' },
      { status: 500 }
    );
  }
}
