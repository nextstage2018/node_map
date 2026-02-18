import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { ClusterService } from '@/services/nodemap/clusterClient.service';

// GET: ノードマップ全体データ取得（userId必須）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_self';

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
