// Phase 42g: 関連タスク検索API
// ノードIDの重なりで関連タスク/種を検索する
//
// GET /api/nodes/search?nodeIds=id1,id2&userId=xxx&excludeTaskId=yyy&limit=10
// → { success: true, data: { relatedTasks: [...] } }

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
    const nodeIdsParam = searchParams.get('nodeIds');
    const userId = searchParams.get('userId');
    const excludeTaskId = searchParams.get('excludeTaskId') || undefined;
    const excludeSeedId = searchParams.get('excludeSeedId') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (!nodeIdsParam) {
      return NextResponse.json(
        { success: false, error: 'nodeIds パラメータが必要です' },
        { status: 400 }
      );
    }

    const nodeIds = nodeIdsParam.split(',').filter(Boolean);
    if (nodeIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { relatedTasks: [] },
      });
    }

    const relatedTasks = await ThoughtNodeService.searchRelatedTasks({
      nodeIds,
      userId: userId || undefined,
      excludeTaskId,
      excludeSeedId,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: { relatedTasks },
    });
  } catch (error) {
    console.error('[Search API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '検索に失敗しました' },
      { status: 500 }
    );
  }
}
