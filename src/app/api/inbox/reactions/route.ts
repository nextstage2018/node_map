import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';

/**
 * リアクション管理API
 *
 * GET    /api/inbox/reactions?messageId=xxx  → メッセージのリアクション一覧
 * POST   /api/inbox/reactions                → リアクション追加
 * DELETE  /api/inbox/reactions?id=xxx         → リアクション削除
 */

// リアクション一覧取得
export async function GET(req: NextRequest) {
  // Phase 22: 認証確認
  await getServerUserId();

  const messageId = req.nextUrl.searchParams.get('messageId');

  if (!messageId) {
    return NextResponse.json({ success: false, error: 'messageId is required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Reactions] 取得エラー:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[Reactions] エラー:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// リアクション追加
export async function POST(req: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();

    const body = await req.json();
    const { messageId, channel, emoji, emojiName } = body;

    if (!messageId || !channel || !emoji) {
      return NextResponse.json(
        { success: false, error: 'messageId, channel, emoji are required' },
        { status: 400 }
      );
    }

    // Slackメッセージの場合、Slack APIにもリアクションを送信
    if (channel === 'slack' && emojiName) {
      await sendSlackReaction(messageId, emojiName);
    }

    // Supabaseに保存
    const supabase = getSupabase();
    if (supabase && isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('message_reactions')
        .upsert(
          {
            message_id: messageId,
            channel,
            emoji,
            emoji_name: emojiName || null,
            user_name: 'あなた',
          },
          { onConflict: 'message_id,emoji,user_name' }
        )
        .select()
        .single();

      if (error) {
        console.error('[Reactions] 追加エラー:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: true, data: { messageId, emoji } });
  } catch (err) {
    console.error('[Reactions] POSTエラー:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// リアクション削除
export async function DELETE(req: NextRequest) {
  // Phase 22: 認証確認
  await getServerUserId();

  const messageId = req.nextUrl.searchParams.get('messageId');
  const emoji = req.nextUrl.searchParams.get('emoji');

  if (!messageId || !emoji) {
    return NextResponse.json(
      { success: false, error: 'messageId and emoji are required' },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: true });
  }

  try {
    // Slackリアクション削除の場合
    const channelParam = req.nextUrl.searchParams.get('channel');
    const emojiName = req.nextUrl.searchParams.get('emojiName');
    if (channelParam === 'slack' && emojiName) {
      await removeSlackReaction(messageId, emojiName);
    }

    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('emoji', emoji)
      .eq('user_name', 'あなた');

    if (error) {
      console.error('[Reactions] 削除エラー:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Reactions] DELETEエラー:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Slack APIにリアクションを送信
 */
async function sendSlackReaction(messageId: string, emojiName: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  // messageIdからSlack情報を抽出: slack-CHANNEL-TS
  const parts = messageId.split('-');
  if (parts.length < 3 || parts[0] !== 'slack') return;

  // slack-CHANNELID-TS形式: channel=parts[1], ts=残り
  const channel = parts[1];
  const timestamp = parts.slice(2).join('.');

  try {
    const res = await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emojiName,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      // already_reacted は無視
      if (data.error !== 'already_reacted') {
        console.warn('[Reactions] Slack APIエラー:', data.error);
      }
    } else {
      console.log(`[Reactions] Slack ✅ :${emojiName}: を送信`);
    }
  } catch (err) {
    console.warn('[Reactions] Slack通信エラー:', err);
  }
}

/**
 * Slack APIからリアクションを削除
 */
async function removeSlackReaction(messageId: string, emojiName: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  const parts = messageId.split('-');
  if (parts.length < 3 || parts[0] !== 'slack') return;

  const channel = parts[1];
  const timestamp = parts.slice(2).join('.');

  try {
    const res = await fetch('https://slack.com/api/reactions.remove', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emojiName,
      }),
    });

    const data = await res.json();
    if (!data.ok && data.error !== 'no_reaction') {
      console.warn('[Reactions] Slack削除エラー:', data.error);
    }
  } catch (err) {
    console.warn('[Reactions] Slack通信エラー:', err);
  }
}
