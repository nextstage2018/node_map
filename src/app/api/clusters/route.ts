// クラスター（面）API
// GET: クラスター一覧取得
// POST: クラスター作成/更新

import { NextRequest, NextResponse } from 'next/server';
import { ClusterService } from '@/services/nodemap/clusterClient.service';
import { getServerUserId } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const taskId = searchParams.get('taskId') || undefined;

    const clusters = await ClusterService.getClusters(userId, taskId);
    return NextResponse.json({ success: true, data: clusters });
  } catch (error) {
    console.error('クラスター取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クラスター一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const body = await request.json();
    const { taskId, clusterType, nodeIds, summary } = body;

    if (!taskId || !clusterType || !nodeIds || !Array.isArray(nodeIds)) {
      return NextResponse.json(
        { success: false, error: 'taskId, clusterType, nodeIds は必須です' },
        { status: 400 }
      );
    }

    const cluster = await ClusterService.upsertCluster(
      taskId,
      userId,
      clusterType,
      nodeIds,
      summary
    );

    return NextResponse.json({ success: true, data: cluster });
  } catch (error) {
    console.error('クラスター作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クラスターの作成に失敗しました' },
      { status: 500 }
    );
  }
}
