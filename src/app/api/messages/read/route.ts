// Phase 25: メッセージ既読API — DB + 元サービス（Gmail/Slack/Chatwork）同時既読
import { NextResponse, NextRequest } from 'next/server';
import { markAsRead } from '@/services/inbox/inboxStorage.service';
import { isSupabaseConfigured, createServerClient } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * 元サービス側で既読にする（バックグラウンド・失敗してもDB既読は有効）
 */
async function markReadOnService(
  channel: string,
  metadata: Record<string, unknown>,
  userId: string
) {
  const supabase = createServerClient();
  if (!supabase) return;

  try {
    // ユーザーのトークンを取得
    const serviceName = channel === 'email' ? 'gmail' : channel;
    const { data: tokenRow } = await supabase
      .from('user_service_tokens')
      .select('token_data')
      .eq('user_id', userId)
      .eq('service_name', serviceName)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!tokenRow?.token_data) return;

    if (channel === 'email') {
      // Gmail: UNREAD ラベルを除去
      const messageId = metadata?.messageId as string;
      if (!messageId) return;
      const accessToken = tokenRow.token_data.access_token;
      if (!accessToken) return;

      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        }
      );
      if (res.ok) {
        console.log(`[Messages/Read] Gmail既読: ${messageId}`);
      } else {
        console.log(`[Messages/Read] Gmail既読失敗: ${res.status}`);
      }
    } else if (channel === 'slack') {
      // Slack: conversations.mark でチャネルの既読位置を更新
      const slackChannel = metadata?.slackChannel as string;
      const slackTs = metadata?.slackTs as string;
      if (!slackChannel || !slackTs) return;
      const token = tokenRow.token_data.access_token || tokenRow.token_data.bot_token;
      if (!token) return;

      const res = await fetch('https://slack.com/api/conversations.mark', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: slackChannel, ts: slackTs }),
      });
      const result = await res.json();
      if (result.ok) {
        console.log(`[Messages/Read] Slack既読: ${slackChannel}/${slackTs}`);
      } else {
        console.log(`[Messages/Read] Slack既読失敗: ${result.error}`);
      }
    } else if (channel === 'chatwork') {
      // Chatwork: メッセージ既読API
      const roomId = metadata?.chatworkRoomId as string;
      const messageId = metadata?.chatworkMessageId as string;
      if (!roomId || !messageId) return;
      const apiToken = tokenRow.token_data.api_token || tokenRow.token_data.access_token;
      if (!apiToken) return;

      const res = await fetch(
        `https://api.chatwork.com/v2/rooms/${roomId}/messages/read`,
        {
          method: 'PUT',
          headers: { 'X-ChatWorkToken': apiToken },
          body: new URLSearchParams({ message_id: messageId }),
        }
      );
      if (res.ok) {
        console.log(`[Messages/Read] Chatwork既読: room=${roomId} msg=${messageId}`);
      } else {
        console.log(`[Messages/Read] Chatwork既読失敗: ${res.status}`);
      }
    }
  } catch (err) {
    console.error(`[Messages/Read] ${channel}既読エラー:`, err);
    // 元サービスの既読失敗はDB既読に影響させない
  }
}

/**
 * POST /api/messages/read
 * body: { messageIds: string[] }
 *
 * 指定されたメッセージIDをDB + 元サービスで既読にする
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const userId = await getServerUserId();
    const body = await request.json();
    const messageIds: string[] = body.messageIds;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'messageIds が必要です' },
        { status: 400 }
      );
    }

    // DB上のメッセージ情報を取得（元サービス既読に必要）
    const supabase = createServerClient();
    let messageRows: { id: string; channel: string; metadata: Record<string, unknown> }[] = [];
    if (supabase) {
      const { data } = await supabase
        .from('inbox_messages')
        .select('id, channel, metadata')
        .in('id', messageIds);
      messageRows = data || [];
    }

    // 1. DB既読を更新
    let updated = 0;
    for (const id of messageIds) {
      try {
        await markAsRead(id);
        updated++;
      } catch (err) {
        console.error(`[Messages/Read] DB既読エラー (${id}):`, err);
      }
    }

    // 2. 元サービス側の既読をバックグラウンドで実行（レスポンスを待たない）
    Promise.allSettled(
      messageRows.map((row) =>
        markReadOnService(row.channel, row.metadata || {}, userId)
      )
    ).catch(() => {});

    console.log(`[Messages/Read] ${updated}/${messageIds.length}件をDB既読に更新`);

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('[Messages/Read] エラー:', error);
    return NextResponse.json(
      { success: false, error: '既読処理に失敗しました' },
      { status: 500 }
    );
  }
}
