// キーワード抽出API
// POST: テキストからキーワードを抽出してノードに蓄積する

import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { ClusterService } from '@/services/nodemap/clusterClient.service';
import { KeywordExtractionRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const body: KeywordExtractionRequest = await request.json();

    if (!body.text) {
      return NextResponse.json(
        { success: false, error: 'text は必須です' },
        { status: 400 }
      );
    }

    // テキストからキーワードを抽出してノードに蓄積
    const extractedNodes = await NodeService.processText({
      text: body.text,
      sourceType: body.sourceType || 'message',
      sourceId: body.sourceId || `extract-${Date.now()}`,
      direction: body.direction || 'self',
      userId: userId,
      phase: body.phase,
    });

    // 抽出されたノード間の共起エッジを生成
    let edges: Awaited<ReturnType<typeof EdgeService.createCoOccurrenceEdges>> = [];
    if (extractedNodes.length >= 2) {
      const taskId = body.sourceId || `extract-${Date.now()}`;
      edges = await EdgeService.createCoOccurrenceEdges(
        extractedNodes,
        userId,
        taskId
      );
    }

    // タスク会話の場合、フェーズに応じたクラスターを更新
    let cluster = null;
    if (body.sourceType === 'task_ideation' && extractedNodes.length > 0) {
      cluster = await ClusterService.buildIdeationCluster(
        body.sourceId,
        userId,
        extractedNodes
      );
    } else if (body.sourceType === 'task_result' && extractedNodes.length > 0) {
      cluster = await ClusterService.buildResultCluster(
        body.sourceId,
        userId,
        extractedNodes
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        nodes: extractedNodes,
        edges,
        cluster,
        extractedCount: {
          nodes: extractedNodes.length,
          edges: edges.length,
        },
      },
    });
  } catch (error) {
    console.error('キーワード抽出エラー:', error);
    return NextResponse.json(
      { success: false, error: 'キーワード抽出に失敗しました' },
      { status: 500 }
    );
  }
}
