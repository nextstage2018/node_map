/**
 * v4.0 Phase 3: Slack Events API Webhook受信
 *
 * トリガー:
 * 1. Bot メンション + 「タスクにして」等のキーワード
 * 2. リアクション絵文字 (white_check_mark)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function handleChallenge(body: Record<string, unknown>): NextResponse | null {
  if (body.type === 'url_verification' && body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }
  return null;
}

function isTaskRequest(text: string): boolean {
  const keywords = [
    'タスクにして', 'タスク化して', 'タスクにする', 'タスク化する',
    'タスク登録', 'タスク作成', 'やることに追加', 'TODO',
    'task', 'タスクお願い',
  ];
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const challengeRes = handleChallenge(body);
    if (challengeRes) return challengeRes;

    if (body.type !== 'event_callback') {
      return NextResponse.json({ ok: true });
    }

    const event = body.event;
    if (!event) {
      return NextResponse.json({ ok: true });
    }

    const teamId = body.team_id;

    if (event.type === 'app_mention') {
      const text = event.text || '';
      if (isTaskRequest(text)) {
        processTaskCreation({
          text: text.replace(/<@[A-Z0-9]+>/g, '').trim(),
          channelId: event.channel,
          messageTs: event.ts,
          threadTs: event.thread_ts || event.ts,
          userId: event.user,
          teamId,
        }).catch(err => console.error('[Slack Events] バックグラウンド処理エラー:', err));
      }
    } else if (event.type === 'reaction_added') {
      const reaction = event.reaction || '';
      if (['white_check_mark', 'ballot_box_with_check', 'heavy_check_mark'].includes(reaction)) {
        processReactionTaskCreation({
          channelId: event.item?.channel,
          messageTs: event.item?.ts,
          userId: event.user,
          teamId,
        }).catch(err => console.error('[Slack Events] リアクション処理エラー:', err));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Slack Events] Webhookエラー:', error);
    return NextResponse.json({ ok: true });
  }
}

async function processTaskCreation(params: {
  text: string;
  channelId: string;
  messageTs: string;
  threadTs: string;
  userId: string;
  teamId: string;
}) {
  const { text, channelId, messageTs, threadTs, userId, teamId } = params;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Slack Events] ENV_TOKEN_OWNER_ID が未設定');
      return;
    }

    // 即レス：処理開始を通知（軽量版）
    sendQuickReply(channelId, threadTs, 'タスク処理を開始します...');

    let threadContext: string | undefined;
    if (threadTs && threadTs !== messageTs) {
      threadContext = await fetchThreadContext(channelId, threadTs, ownerUserId);
    }

    const { createTaskFromMessage } = await import('@/services/v4/taskFromMessage.service');
    const result = await createTaskFromMessage({
      messageText: text,
      threadContext,
      serviceName: 'slack',
      channelId,
      messageId: `slack-${channelId}-${messageTs}`,
      userId: ownerUserId,
      senderName: undefined,
    });

    if (!result) {
      await sendSlackReply(channelId, threadTs, 'タスクの作成に失敗しました。もう一度お試しください。', ownerUserId);
      return;
    }

    const parts = [`タスクを作成しました: *${result.title}*`];
    if (result.dueDate) parts.push(`期限: ${result.dueDate}`);
    if (result.projectName) parts.push(`PJ: ${result.projectName}`);
    if (result.milestoneName) parts.push(`MS: ${result.milestoneName}`);

    await sendSlackReply(channelId, threadTs, parts.join('\n'), ownerUserId);
  } catch (error) {
    console.error('[Slack Events] タスク作成処理エラー:', error);
  }
}

async function processReactionTaskCreation(params: {
  channelId: string;
  messageTs: string;
  userId: string;
  teamId: string;
}) {
  const { channelId, messageTs, userId, teamId } = params;

  if (!channelId || !messageTs) return;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) return;

    // 即レス：処理開始を通知（軽量版）
    sendQuickReply(channelId, messageTs, 'タスク処理を開始します...');

    const messageText = await fetchMessageText(channelId, messageTs, ownerUserId);
    if (!messageText) return;

    const { createTaskFromMessage } = await import('@/services/v4/taskFromMessage.service');
    const result = await createTaskFromMessage({
      messageText,
      serviceName: 'slack',
      channelId,
      messageId: `slack-${channelId}-${messageTs}`,
      userId: ownerUserId,
    });

    if (!result) return;

    const parts = [`タスクを作成しました: *${result.title}*`];
    if (result.dueDate) parts.push(`期限: ${result.dueDate}`);
    if (result.projectName) parts.push(`PJ: ${result.projectName}`);
    if (result.milestoneName) parts.push(`MS: ${result.milestoneName}`);

    await sendSlackReply(channelId, messageTs, parts.join('\n'), ownerUserId);
  } catch (error) {
    console.error('[Slack Events] リアクションタスク処理エラー:', error);
  }
}


// 即レス専用：DB検索・ライブラリ不要の超軽量返信
async function sendQuickReply(channelId: string, threadTs: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, text, thread_ts: threadTs }),
    });
  } catch { /* 即レス失敗は無視 */ }
}

async function getSlackClient(userId: string) {
  const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return null;

  const { data: tokenRow } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'slack')
    .eq('is_active', true)
    .single();

  const token = tokenRow?.token_data?.access_token || process.env.SLACK_BOT_TOKEN;
  if (!token) return null;

  const { WebClient } = await import('@slack/web-api');
  return new WebClient(token);
}

async function sendSlackReply(channelId: string, threadTs: string, text: string, userId: string) {
  try {
    const client = await getSlackClient(userId);
    if (!client) return;
    await client.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
    });
  } catch (error) {
    console.error('[Slack Events] 返信エラー:', error);
  }
}

async function fetchMessageText(channelId: string, messageTs: string, userId: string): Promise<string | null> {
  try {
    const client = await getSlackClient(userId);
    if (!client) return null;
    const result = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      inclusive: true,
      limit: 1,
    });
    const msg = result.messages?.[0];
    return msg?.text || null;
  } catch (error) {
    console.error('[Slack Events] メッセージ取得エラー:', error);
    return null;
  }
}

async function fetchThreadContext(channelId: string, threadTs: string, userId: string): Promise<string | undefined> {
  try {
    const client = await getSlackClient(userId);
    if (!client) return undefined;
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 10,
    });
    if (!result.messages || result.messages.length === 0) return undefined;
    return result.messages
      .slice(0, 5)
      .map(m => m.text || '')
      .filter(t => t.length > 0)
      .join('\n---\n');
  } catch {
    return undefined;
  }
}
