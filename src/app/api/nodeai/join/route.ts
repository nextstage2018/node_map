// NodeAI: Bot起動API
// Google Meet会議にNodeAI Botを参加させる
//
// POST /api/nodeai/join
// Body: { meeting_url: string, project_id?: string }

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createBot, isRecallConfigured } from '@/services/nodeai/recallClient.service';
import { createSession } from '@/services/nodeai/sessionManager.service';
import {
  getRelationshipType,
  resolveProjectFromParticipants,
} from '@/services/nodeai/contextBuilder.service';

export async function POST(request: Request): Promise<Response> {
  // 認証
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Recall.ai 設定チェック
  if (!isRecallConfigured()) {
    return NextResponse.json(
      { error: 'Recall.ai is not configured. Set RECALL_API_KEY environment variable.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { meeting_url, project_id } = body as {
      meeting_url: string;
      project_id?: string;
    };

    if (!meeting_url) {
      return NextResponse.json({ error: 'meeting_url is required' }, { status: 400 });
    }

    // Google Meet URL バリデーション
    if (!meeting_url.includes('meet.google.com')) {
      return NextResponse.json(
        { error: 'Only Google Meet URLs are supported' },
        { status: 400 }
      );
    }

    // Recall.ai Bot を作成（会議に参加）
    const botResult = await createBot({
      meetingUrl: meeting_url,
      projectId: project_id,
    });

    const botId = botResult.id;

    // 公開レベルを取得
    let relationshipType: 'internal' | 'client' | 'partner' = 'internal';
    if (project_id) {
      relationshipType = await getRelationshipType(project_id);
    }

    // セッションを作成
    const session = await createSession({
      botId,
      projectId: project_id,
      meetingUrl: meeting_url,
      relationshipType,
    });

    return NextResponse.json({
      success: true,
      data: {
        bot_id: botId,
        session_id: session?.id || null,
        project_id: project_id || null,
        relationship_type: relationshipType,
        meeting_url: meeting_url,
      },
    });
  } catch (err) {
    console.error('[NodeAI] Join failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to join meeting' },
      { status: 500 }
    );
  }
}
