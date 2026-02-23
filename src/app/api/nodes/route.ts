import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { getServerUserId } from '@/lib/serverAuth';

// ノード一覧取得（Phase 22: 認証ユーザーID適用）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Phase 22: クエリパラメータのuserIdではなく認証ユーザーIDを使用
    const userId = await getServerUserId();
    const type = searchParams.get('type') || undefined;
    const level = searchParams.get('level') || undefined;
    const minFrequency = searchParams.get('minFrequency')
      ? Number(searchParams.get('minFrequency'))
      : undefined;
    const q = searchParams.get('q') || undefined;

    // バリデーション
    const validTypes = ['keyword', 'person', 'project'];
    const validLevels = ['recognition', 'understanding', 'mastery'];

    const filters: Record<string, unknown> = { userId };
    if (type && validTypes.includes(type)) filters.type = type;
    if (level && validLevels.includes(level)) filters.level = level;
    if (minFrequency) filters.minFrequency = minFrequency;
    if (q) filters.q = q;

    const nodes = await NodeService.getNodes(filters);
    return NextResponse.json({ success: true, data: nodes });
  } catch (error) {
    console.error('ノード取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ノードの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ノード手動登録/更新（Phase 22: 認証ユーザーID適用）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();
    const { label, type, sourceId, direction } = body;

    if (!label || !type) {
      return NextResponse.json(
        { success: false, error: 'label と type は必須です' },
        { status: 400 }
      );
    }

    const context = {
      sourceType: 'message' as const,
      sourceId: sourceId || 'manual',
      direction: direction || ('self' as const),
      timestamp: new Date().toISOString(),
    };

    const node = await NodeService.upsertNode(label, type, userId, context);
    return NextResponse.json({ success: true, data: node });
  } catch (error) {
    console.error('ノード登録エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ノードの登録に失敗しました' },
      { status: 500 }
    );
  }
}
