// クラスター差分API
// GET: タスクの構想面と結果面の差分を取得

import { NextRequest, NextResponse } from 'next/server';
import { ClusterService } from '@/services/nodemap/clusterClient.service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const userId = searchParams.get('userId') || 'demo-user';

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId は必須です' },
        { status: 400 }
      );
    }

    const diff = await ClusterService.getClusterDiff(taskId, userId);

    if (!diff) {
      return NextResponse.json(
        { success: false, error: '指定されたタスクのクラスターが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: diff });
  } catch (error) {
    console.error('クラスター差分取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'クラスター差分の取得に失敗しました' },
      { status: 500 }
    );
  }
}
