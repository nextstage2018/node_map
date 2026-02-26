// Phase 42a: 未確認ナレッジノード取得・承認API
// 週次振り返り（Phase 42c）の前準備

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';

// GET: 未確認ノード一覧を取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const nodes = await ThoughtNodeService.getUnconfirmedNodes(userId);

    return NextResponse.json({
      success: true,
      data: nodes,
    });
  } catch (error) {
    console.error('[Unconfirmed Nodes API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '未確認ノードの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: ノードを承認する
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { entryId } = body;

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: 'entryId は必須です' },
        { status: 400 }
      );
    }

    const success = await ThoughtNodeService.confirmNode(entryId);

    return NextResponse.json({
      success,
      data: { confirmed: success },
    });
  } catch (error) {
    console.error('[Unconfirmed Nodes API] 承認エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ノードの承認に失敗しました' },
      { status: 500 }
    );
  }
}
