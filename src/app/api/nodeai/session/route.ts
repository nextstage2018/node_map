// NodeAI: セッション状態取得API
//
// GET /api/nodeai/session?bot_id=xxx
// 現在のバッファ状態・応答回数・参加者一覧を返す

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getSessionByBotId, cleanupStaleSessions } from '@/services/nodeai/sessionManager.service';

export async function GET(request: Request): Promise<Response> {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('bot_id');

  if (!botId) {
    return NextResponse.json({ error: 'bot_id is required' }, { status: 400 });
  }

  try {
    const session = await getSessionByBotId(botId);

    if (!session) {
      return NextResponse.json(
        { error: 'No active session found for this bot' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        session_id: session.id,
        bot_id: session.botId,
        project_id: session.projectId,
        meeting_url: session.meetingUrl,
        relationship_type: session.relationshipType,
        status: session.status,
        participants: session.participants,
        response_count: session.responseCount,
        last_response_at: session.lastResponseAt,
        started_at: session.startedAt,
        // バッファは内部データなので返さない（サイズが大きい）
        buffer_size: session.utteranceBuffer.length,
      },
    });
  } catch (err) {
    console.error('[NodeAI] Session query failed:', err);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}

// POST /api/nodeai/session — セッションクリーンアップ（管理用）
export async function POST(request: Request): Promise<Response> {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (action === 'cleanup') {
      const cleaned = await cleanupStaleSessions();
      return NextResponse.json({
        success: true,
        data: { cleaned_sessions: cleaned },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[NodeAI] Session action failed:', err);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
