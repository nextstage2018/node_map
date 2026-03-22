// NodeAI: Bot停止API
// NodeAI Botを会議から退出させる
//
// POST /api/nodeai/leave
// Body: { bot_id: string }

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { leaveBot, isRecallConfigured } from '@/services/nodeai/recallClient.service';
import { endSession } from '@/services/nodeai/sessionManager.service';

export async function POST(request: Request): Promise<Response> {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isRecallConfigured()) {
    return NextResponse.json(
      { error: 'Recall.ai is not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { bot_id } = body as { bot_id: string };

    if (!bot_id) {
      return NextResponse.json({ error: 'bot_id is required' }, { status: 400 });
    }

    // Recall.ai Bot を退出
    try {
      await leaveBot(bot_id);
    } catch (err) {
      console.warn('[NodeAI] Leave bot API call failed (may already be left):', err);
      // Bot がすでに退出済みでもセッションは終了する
    }

    // セッションを終了
    await endSession(bot_id);

    return NextResponse.json({
      success: true,
      data: { bot_id },
    });
  } catch (err) {
    console.error('[NodeAI] Leave failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to leave meeting' },
      { status: 500 }
    );
  }
}
