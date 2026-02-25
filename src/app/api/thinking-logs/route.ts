// Phase 30: 思考ログAPI（GET/POST/PUT/DELETE）

import { NextRequest, NextResponse } from 'next/server';
import { ThinkingLogService } from '@/services/thinking/thinkingLogClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { ThinkingLogType } from '@/lib/types';

// 思考ログ一覧取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const { searchParams } = new URL(request.url);

    const linkedNodeId = searchParams.get('linkedNodeId') || undefined;
    const linkedTaskId = searchParams.get('linkedTaskId') || undefined;
    const logType = searchParams.get('logType') as ThinkingLogType | null;
    const searchQuery = searchParams.get('search') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    const logs = await ThinkingLogService.getLogs(userId, {
      linkedNodeId,
      linkedTaskId,
      logType: logType || undefined,
      searchQuery,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error('思考ログ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 思考ログ作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json(
        { success: false, error: '内容は必須です' },
        { status: 400 }
      );
    }

    if (!body.logType) {
      return NextResponse.json(
        { success: false, error: 'ログタイプは必須です' },
        { status: 400 }
      );
    }

    const log = await ThinkingLogService.createLog(userId, {
      content: body.content,
      logType: body.logType,
      linkedNodeId: body.linkedNodeId,
      linkedTaskId: body.linkedTaskId,
      linkedSeedId: body.linkedSeedId,
      tags: body.tags,
    });

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error('思考ログ作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考ログの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// 思考ログ更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();

    if (!body.logId) {
      return NextResponse.json(
        { success: false, error: 'logIdは必須です' },
        { status: 400 }
      );
    }

    const updated = await ThinkingLogService.updateLog(body.logId, userId, {
      id: body.logId,
      content: body.content,
      logType: body.logType,
      tags: body.tags,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: '思考ログが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('思考ログ更新エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考ログの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// 思考ログ削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const { searchParams } = new URL(request.url);
    const logId = searchParams.get('logId');

    if (!logId) {
      return NextResponse.json(
        { success: false, error: 'logIdは必須です' },
        { status: 400 }
      );
    }

    const deleted = await ThinkingLogService.deleteLog(logId, userId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '思考ログが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('思考ログ削除エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考ログの削除に失敗しました' },
      { status: 500 }
    );
  }
}
