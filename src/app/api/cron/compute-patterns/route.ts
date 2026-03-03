// Phase 51c: 日次パターン計算Cron
// 毎日3:00に実行 — 未返信検出 + 停滞タスク検出 + プロジェクト勢い計算
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

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

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    // アクティブユーザーを取得（最近7日にタスクを更新したユーザー）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsers } = await sb
      .from('tasks')
      .select('user_id')
      .gte('updated_at', sevenDaysAgo);

    if (!activeUsers || activeUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'No active users', processed: 0 });
    }

    // ユニークユーザーリスト
    const userIds = [...new Set(activeUsers.map(u => u.user_id))];
    console.log(`[Compute Patterns] ${userIds.length}人のユーザーを処理`);

    let processed = 0;

    for (const userId of userIds) {
      try {
        const { ContactPatternService } = await import('@/services/analytics/contactPattern.service');
        const insights = await ContactPatternService.computeAllInsights(userId);

        // 結果をキャッシュ（secretary AIが参照用）
        // user_settingsなどに保存する代わりに、ログ出力のみ（軽量版）
        console.log(`[Compute Patterns] user=${userId.slice(0, 8)}: ` +
          `未返信=${insights.overdueReplies.length}, ` +
          `停滞タスク=${insights.stagnantTasks.length}, ` +
          `プロジェクト=${insights.projectMomentum.length}`);

        processed++;
      } catch (userErr) {
        console.error(`[Compute Patterns] user=${userId.slice(0, 8)} エラー:`, userErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${processed}/${userIds.length} users processed`,
      processed,
    });
  } catch (error) {
    console.error('[Compute Patterns] Cron エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
