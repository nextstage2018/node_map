/**
 * v4.0 Phase 4: Chatwork Webhook受信
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return !secret;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return computed === signature;
  } catch (error) {
    console.error('[Chatwork Webhook] 署名検証エラー:', error);
    return false;
  }
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

function cleanToTags(body: string): string {
  return body.replace(/\[To:\d+\][^\n]*/g, '').trim();
}

interface ChatworkWebhookBody {
  webhook_setting_id: string;
  webhook_event_type: string;
  webhook_event_time: number;
  webhook_event: {
    from_account_id: number;
    to_account_id: number;
    room_id: number;
    message_id: string;
    body: string;
    send_time: number;
    update_time: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const secret = process.env.CHATWORK_WEBHOOK_SECRET || '';
    const signature = request.headers.get('X-ChatWorkWebhookSignature');

    if (secret) {
      const valid = await verifySignature(rawBody, signature, secret);
      if (!valid) {
        console.error('[Chatwork Webhook] 署名検証失敗');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const body: ChatworkWebhookBody = JSON.parse(rawBody);

    if (body.webhook_event_type !== 'message_created') {
      return NextResponse.json({ ok: true });
    }

    const event = body.webhook_event;
    if (!event || !event.body) {
      return NextResponse.json({ ok: true });
    }

    const myAccountId = await getMyAccountId();
    if (myAccountId && event.from_account_id === myAccountId) {
      return NextResponse.json({ ok: true });
    }

    const messageBody = event.body;
    const cleanedText = cleanToTags(messageBody);

    if (!isTaskRequest(messageBody)) {
      return NextResponse.json({ ok: true });
    }

    processTaskCreation({
      text: cleanedText,
      roomId: String(event.room_id),
      messageId: String(event.message_id),
      fromAccountId: event.from_account_id,
    }).catch(err => console.error('[Chatwork Webhook] バックグラウンド処理エラー:', err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Chatwork Webhook] エラー:', error);
    return NextResponse.json({ ok: true });
  }
}

async function processTaskCreation(params: {
  text: string;
  roomId: string;
  messageId: string;
  fromAccountId: number;
}) {
  const { text, roomId, messageId, fromAccountId } = params;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Chatwork Webhook] ENV_TOKEN_OWNER_ID が未設定');
      return;
    }

    const { createTaskFromMessage } = await import('@/services/v4/taskFromMessage.service');
    const result = await createTaskFromMessage({
      messageText: text,
      serviceName: 'chatwork',
      channelId: roomId,
      messageId: `chatwork-${roomId}-${messageId}`,
      userId: ownerUserId,
      senderName: undefined,
    });

    if (!result) {
      await sendReply(roomId, `[To:${fromAccountId}]\nタスクの作成に失敗しました。もう一度お試しください。`);
      return;
    }

    const parts = [`[To:${fromAccountId}]`, `タスクを作成しました: ${result.title}`];
    if (result.dueDate) parts.push(`期限: ${result.dueDate}`);
    if (result.projectName) parts.push(`PJ: ${result.projectName}`);
    if (result.milestoneName) parts.push(`MS: ${result.milestoneName}`);

    await sendReply(roomId, parts.join('\n'));
  } catch (error) {
    console.error('[Chatwork Webhook] タスク作成処理エラー:', error);
  }
}

async function sendReply(roomId: string, body: string) {
  try {
    const { sendChatworkMessage } = await import('@/services/chatwork/chatworkClient.service');
    await sendChatworkMessage(roomId, body);
  } catch (error) {
    console.error('[Chatwork Webhook] 返信エラー:', error);
  }
}

let cachedMyAccountId: number | null = null;

async function getMyAccountId(): Promise<number | null> {
  if (cachedMyAccountId !== null) return cachedMyAccountId;
  const token = process.env.CHATWORK_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch('https://api.chatwork.com/v2/me', {
      headers: { 'X-ChatWorkToken': token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    cachedMyAccountId = data.account_id || null;
    return cachedMyAccountId;
  } catch {
    return null;
  }
}
