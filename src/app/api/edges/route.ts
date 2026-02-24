import { NextRequest, NextResponse } from 'next/server';
import { EdgeService } from '@/services/nodemap/edgeClient.service';
import { getServerUserId } from '@/lib/serverAuth';

// エッジ一覧取得（Phase 22: 認証ユーザーID適用）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const taskId = searchParams.get('taskId') || undefined;

    const edges = await EdgeService.getEdges(userId, taskId);
    return NextResponse.json({ success: true, data: edges });
  } catch (error) {
    console.error('エッジ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'エッジの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// エッジ作成/更新（Phase 22: 認証ユーザーID適用）
export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを使用
    const userId = await getServerUserId();
    const body = await request.json();
    const { sourceNodeId, targetNodeId, taskId, edgeType } = body;

    if (!sourceNodeId || !targetNodeId) {
      return NextResponse.json(
        { success: false, error: 'sourceNodeId と targetNodeId は必須です' },
        { status: 400 }
      );
    }

    const edge = await EdgeService.upsertEdge(
      sourceNodeId,
      targetNodeId,
      userId,
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
