// Phase 42e: スナップショット取得API
// GET /api/nodes/snapshots?taskId=xxx
// → { success: true, data: { initialGoal: Snapshot | null, finalLanding: Snapshot | null } }

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const viewerId = await getServerUserId();
    if (!viewerId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId パラメータが必要です' },
        { status: 400 }
      );
    }

    const snapshots = await ThoughtNodeService.getSnapshots({ taskId });

    return NextResponse.json({
      success: true,
      data: snapshots,
    });
  } catch (error) {
    console.error('[Snapshots API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'スナップショットの取得に失敗しました' },
      { status: 500 }
    );
  }
}
