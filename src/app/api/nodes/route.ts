// ノード（点）API
// GET: ノード一覧取得（フィルター対応）
// POST: ノード手動追加

import { NextRequest, NextResponse } from 'next/server';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { NodeFilter, NodeType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter: NodeFilter = {};

    const userId = searchParams.get('userId') || 'demo-user';
    filter.userId = userId;

    const type = searchParams.get('type');
    if (type && ['keyword', 'person', 'project'].includes(type)) {
      filter.type = type as NodeType;
    }

    const level = searchParams.get('level');
    if (level && ['recognition', 'understanding', 'mastery'].includes(level)) {
      filter.understandingLevel = level as NodeFilter['understandingLevel'];
    }

    const minFreq = searchParams.get('minFrequency');
    if (minFreq) {
      filter.minFrequency = parseInt(minFreq, 10);
    }

    const q = searchParams.get('q');
    if (q) {
      filter.searchQuery = q;
    }

    const nodes = await NodeService.getNodes(filter);
    return NextResponse.json({ success: true, data: nodes });
  } catch (error) {
    console.error('ノード取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ノード一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, type, userId } = body;

    if (!label || !type) {
      return NextResponse.json(
        { success: false, error: 'label と type は必須です' },
        { status: 400 }
      );
    }

    const context = {
      sourceType: 'message' as const,
      sourceId: body.sourceId || 'manual',
      direction: body.direction || ('self' as const),
      timestamp: new Date().toISOString(),
    };

    const node = await NodeService.upsertNode(
      label,
      type as NodeType,
      userId || 'demo-user',
      context
    );

    return NextResponse.json({ success: true, data: node });
  } catch (error) {
    console.error('ノード作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ノードの作成に失敗しました' },
      { status: 500 }
    );
  }
}
