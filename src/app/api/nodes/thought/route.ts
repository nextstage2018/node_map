// Phase 42a: 思考ノード取得API
// タスクまたは種に紐づくthought_task_nodesを取得

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';

// GET: タスクまたは種の思考ノードを取得
// ?taskId=xxx or ?seedId=xxx
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || undefined;
    const seedId = searchParams.get('seedId') || undefined;

    if (!taskId && !seedId) {
      return NextResponse.json(
        { success: false, error: 'taskId または seedId は必須です' },
        { status: 400 }
      );
    }

    const nodes = await ThoughtNodeService.getLinkedNodes({
      taskId,
      seedId,
      userId,
    });

    return NextResponse.json({
      success: true,
      data: nodes,
    });
  } catch (error) {
    console.error('[Thought Nodes API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考ノードの取得に失敗しました' },
      { status: 500 }
    );
  }
}
