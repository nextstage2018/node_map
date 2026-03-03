// Phase 53a: 秘書チャット会話永続化API
// GET: 会話履歴取得（最新セッション or 指定セッション）
// POST: メッセージ保存
// DELETE: 会話クリア
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    let query = sb
      .from('secretary_conversations')
      .select('id, role, content, cards, session_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    } else {
      // セッション未指定の場合、最新の会話を取得（今日のもの）
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query = query.gte('created_at', todayStart.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Secretary Conversations] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        messages: (data || []).map(row => ({
          id: row.id,
          role: row.role,
          content: row.content,
          cards: row.cards || undefined,
          timestamp: row.created_at,
          sessionId: row.session_id,
        })),
      },
    });
  } catch (error) {
    console.error('[Secretary Conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { messages, sessionId } = body as {
      messages: Array<{
        role: 'user' | 'assistant';
        content: string;
        cards?: unknown[];
      }>;
      sessionId?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 });
    }

    const rows = messages.map(msg => ({
      user_id: userId,
      role: msg.role,
      content: msg.content || '',
      cards: msg.cards ? JSON.stringify(msg.cards) : null,
      session_id: sessionId || null,
    }));

    const { error } = await sb
      .from('secretary_conversations')
      .insert(rows);

    if (error) {
      console.error('[Secretary Conversations] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Secretary Conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    let query = sb
      .from('secretary_conversations')
      .delete()
      .eq('user_id', userId);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { error } = await query;

    if (error) {
      console.error('[Secretary Conversations] DELETE error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Secretary Conversations] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
