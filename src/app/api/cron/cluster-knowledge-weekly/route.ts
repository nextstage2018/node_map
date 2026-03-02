// Phase 47: 週次ナレッジクラスタリングCron
// 未確認キーワードをAIでクラスタリングし、領域/分野構造を自動提案
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { KnowledgeClusteringService } from '@/services/nodemap/knowledgeClustering.service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Cron Secret 検証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, message: 'Supabase未設定' });
    }

    // 全ユーザーのリスト取得（thought_task_nodesに記録があるユーザー）
    const { data: users } = await supabase
      .from('thought_task_nodes')
      .select('user_id')
      .limit(1000);

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, message: 'No users with knowledge nodes', processedUsers: 0 });
    }

    // ユニークなユーザーIDを取得
    const uniqueUserIds = [...new Set(users.map((u: { user_id: string }) => u.user_id))];

    let proposalsCreated = 0;
    let processedUsers = 0;

    for (const userId of uniqueUserIds) {
      try {
        const proposal = await KnowledgeClusteringService.proposeWeeklyClustering(userId);
        if (proposal) {
          proposalsCreated++;
        }
        processedUsers++;
      } catch (error) {
        console.error(`[ClusterKnowledge Cron] Error for user ${userId}:`, error);
      }
    }

    console.log(`[ClusterKnowledge Cron] Processed ${processedUsers} users, created ${proposalsCreated} proposals`);

    return NextResponse.json({
      success: true,
      processedUsers,
      proposalsCreated,
      week: KnowledgeClusteringService.getISOWeek(),
    });
  } catch (error) {
    console.error('[ClusterKnowledge Cron] Error:', error);
    return NextResponse.json(
      { success: false, error: 'クラスタリング処理に失敗しました' },
      { status: 500 }
    );
  }
}
