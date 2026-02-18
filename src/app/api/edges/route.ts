// エッジ（線）API
// GET: エッジ一覧取得
// POST: エッジ手動追加

import { NextRequest, NextResponse } from 'next/server';
import { EdgeService } from '@/services/nodemap/edgeClient.service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo-user';
    const taskId = searchParams.get('taskId') || undefined;

    const edges = await EdgeService.getEdges(userId, taskId);
    return NextResponse.json({ success: true, data: edges });
  } catch (error) {
    console.error('エッジ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'エッジ一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceNodeId, targetNodeId, userId, taskId, edgeType } = body;

    if (!sourceNodeId || !targetNodeId) {
      return NextResponse.json(
        { success: false, error: 'sourceNodeId と targetNodeId は必須です' },
        { status: 400 }
      );
    }

    const edge = await EdgeService.upsertEdge(
      sourceNodeId,
      targetNodeId,
      userId || 'demo-user',
      taskId || 'manual',
      edgeType || 'co_occurrence'
    );

    return NextResponse.json({ success: true, data: edge });
  } catch (error) {
    console.error('エッジ作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'エッジの作成に失敗しました' },
      { status: 500 }
    );
  }
}
