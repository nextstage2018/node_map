import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { ClusterService } from '@/services/nodemap/clusterClient.service';
import { getServerUserId } from '@/lib/serverAuth';

// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';

// GET: ノードマップ全体データ取得（Phase 22: 認証ユーザーIDを使用）
export async function GET(req: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();

    const [nodesResult, edgesResult, clustersResult] = await Promise.all([
      NodeService.getNodes({ userId }),
      EdgeService.getEdges(userId),
      ClusterService.getClusters(userId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        nodes: nodesResult,
        edges: edgesResult,
        clusters: clustersResult,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'ノードマップデータの取得に失敗しました' },
      { status: 500 }
    );
  }
}
