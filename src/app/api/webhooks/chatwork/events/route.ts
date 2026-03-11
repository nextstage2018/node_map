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
  const lower = text.toLowerCase();

  // 完全一致キーワード
  const exactKeywords = [
    'タスクにして', 'タスク化して', 'タスクにする', 'タスク化する',
    'タスク登録', 'タスク作成', 'やることに追加', 'TODO',
    'タスクお願い',
  ];
  if (exactKeywords.some(kw => lower.includes(kw.toLowerCase()))) return true;

  // パターンマッチ（助詞を挟む表現）
  const patterns = [
    /タスク.{0,3}(登録|作成|追加|入れ|いれ)/,    // 「タスクを登録して」「タスクとして登録」
    /(登録|作成|追加).{0,3}タスク/,                // 「登録してタスクに」
    /タスク.{0,5}(して|する|お願い|頼む|頼み)/,   // 「タスクにしてほしい」
    /(やること|todo|ToDo).{0,3}(に|へ|として)/,   // 「やることに入れて」
  ];
  if (patterns.some(p => p.test(lower))) return true;

  return false;
}

// v4.0 Phase 6: タスク完了リクエスト判定
function isTaskCompleteRequest(text: string): boolean {
  const keywords = [
    'タスク完了', '完了しました', '完了した', 'done', '終わった', '終わりました',
    'タスク終了', '対応完了', '対応しました',
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

    // 署名検証（一旦スキップ。Bot安定後にCHATWORK_WEBHOOK_SECRETで有効化）
    // const secret = process.env.CHATWORK_WEBHOOK_SECRET || '';
    // const signature = request.headers.get('X-ChatWorkWebhookSignature');
    // if (secret) { ... }

    const body: ChatworkWebhookBody = JSON.parse(rawBody);


    if (body.webhook_event_type !== 'message_created' && body.webhook_event_type !== 'mention_to_me') {
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

    // v4.0 Phase 6: タスク完了リクエスト
    if (isTaskCompleteRequest(messageBody)) {
      processTaskCompletion({
        roomId: String(event.room_id),
        fromAccountId: event.from_account_id,
      }).catch(err => console.error('[Chatwork Webhook] タスク完了処理エラー:', err));
      return NextResponse.json({ ok: true });
    }

    if (!isTaskRequest(messageBody)) {
      // v4.3: メンション先がNodeMapの場合はボット応答
      const isMentionToMe = body.webhook_event_type === 'mention_to_me' || isMentionedToBot(messageBody, myAccountId);
      if (isMentionToMe) {
        processBotMention({
          text: cleanedText,
          roomId: String(event.room_id),
        }).catch(err => console.error('[Chatwork Webhook] ボット応答エラー:', err));
        return NextResponse.json({ ok: true });
      }

      // v4.0: タスク指示でないメッセージ → アクションアイテム検出 → タスク提案
      processMessageSuggestion({
        text: cleanedText,
        roomId: String(event.room_id),
      }).catch(err => console.error('[Chatwork Webhook] メッセージ提案エラー:', err));
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

// v4.0 Phase 6: Chatworkからのタスク完了処理
async function processTaskCompletion(params: {
  roomId: string;
  fromAccountId: number;
}) {
  const { roomId, fromAccountId } = params;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Chatwork Webhook] ENV_TOKEN_OWNER_ID が未設定');
      return;
    }

    // このルームに紐づくChatwork由来の未完了タスクを検索
    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return;

    // source_message_id が "chatwork-{roomId}-" で始まるタスクを検索（最新1件）
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, source_message_id')
      .like('source_message_id', `chatwork-${roomId}-%`)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!tasks || tasks.length === 0) {
      await sendReply(roomId, `[To:${fromAccountId}]\n完了対象のタスクが見つかりませんでした。`);
      return;
    }

    const task = tasks[0];
    const { completeTaskBySourceMessage } = await import('@/services/v4/taskCompletionNotify.service');
    const result = await completeTaskBySourceMessage(task.source_message_id, ownerUserId);

    if (result.success) {
      await sendReply(roomId, `[To:${fromAccountId}]\n✅ タスク完了: ${result.taskTitle}`);
    } else {
      await sendReply(roomId, `[To:${fromAccountId}]\nタスクの完了処理に失敗しました。`);
    }
  } catch (error) {
    console.error('[Chatwork Webhook] タスク完了処理エラー:', error);
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

    // ★ 即レス: タスク処理開始通知
    sendReply(roomId, 'タスク処理を開始します...').catch(() => {});

    const { createTaskFromMessage } = await import('@/services/v4/taskFromMessage.service');
    const result = await createTaskFromMessage({
      messageText: text,
      serviceName: 'chatwork',
      channelId: roomId,
      messageId: messageId ? `chatwork-${roomId}-${messageId}` : `chatwork-${roomId}-${Date.now()}`,
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
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) {
    console.log('[Chatwork Webhook] トークン未設定のため返信スキップ');
    return;
  }
  try {
    await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `body=${encodeURIComponent(body)}`,
    });
  } catch (error) {
    console.error('[Chatwork Webhook] 返信エラー:', error);
  }
}

let cachedMyAccountId: number | null = null;

async function getMyAccountId(): Promise<number | null> {
  if (cachedMyAccountId !== null) return cachedMyAccountId;
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
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

// v4.0: 通常メッセージからアクションアイテムを検出 → タスク提案として保存
async function processMessageSuggestion(params: {
  text: string;
  roomId: string;
}) {
  const { text, roomId } = params;
  if (!text || !roomId) return;

  try {
    const { isActionableMessage, suggestTaskFromMessage } = await import('@/services/v4/taskSuggestionDetector.service');

    if (!isActionableMessage(text)) return;

    await suggestTaskFromMessage({
      messageText: text,
      serviceName: 'chatwork',
      channelId: roomId,
    });
  } catch (error) {
    console.error('[Chatwork Webhook] メッセージ提案処理エラー:', error);
  }
}

// v4.3: メンション先がNodeMapボットかチェック
function isMentionedToBot(body: string, myAccountId: number | null): boolean {
  if (!myAccountId) return false;
  // [To:12345] 形式でメンションされているかチェック
  const regex = new RegExp(`\\[To:${myAccountId}\\]`);
  return regex.test(body);
}

// v4.3: チャネルボット — メンション応答（AI分類 + 即レス対応）
async function processBotMention(params: {
  text: string;
  roomId: string;
}) {
  const { text, roomId } = params;

  // ★ 即レス: 処理開始を即座に通知（最優先）
  await sendReply(roomId, '確認中です...').catch(() => {});

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Chatwork Webhook] ENV_TOKEN_OWNER_ID が未設定');
      await sendReply(roomId, '設定エラーが発生しました。管理者にお問い合わせください。');
      return;
    }

    // ルームID → プロジェクト特定
    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      await sendReply(roomId, 'データベースに接続できません。');
      return;
    }

    // デバッグ: channel_identifier の値を確認
    console.log(`[Chatwork Webhook] チャネル検索: service=chatwork, channel_identifier=${roomId}`);

    // まず完全一致で検索
    let channel = await supabase
      .from('project_channels')
      .select('project_id, channel_identifier')
      .eq('service_name', 'chatwork')
      .eq('channel_identifier', roomId)
      .maybeSingle();

    console.log(`[Chatwork Webhook] 検索結果: ${JSON.stringify(channel.data)}`);

    // 完全一致がなければ、部分一致やlike検索を試す（roomIdが含まれるか）
    if (!channel.data?.project_id) {
      const { data: allChannels } = await supabase
        .from('project_channels')
        .select('project_id, channel_identifier, service_name')
        .eq('service_name', 'chatwork');
      console.log(`[Chatwork Webhook] chatworkチャネル一覧: ${JSON.stringify(allChannels)}`);

      // channel_identifier にroomIdが含まれるか部分マッチ
      const match = allChannels?.find(c =>
        c.channel_identifier === roomId ||
        c.channel_identifier === String(roomId) ||
        String(c.channel_identifier).includes(String(roomId))
      );
      if (match) {
        channel = { data: match, error: null, count: null, status: 200, statusText: 'OK' } as any;
        console.log(`[Chatwork Webhook] 部分一致で発見: ${JSON.stringify(match)}`);
      }
    }

    if (!channel.data?.project_id) {
      await sendReply(roomId, `このルームはNodeMapプロジェクトに紐づいていません。\n(roomId: ${roomId})`);
      return;
    }

    // ★ AI intent分類（フォールバック: キーワードベース）
    let cleanText: string;
    try {
      const { extractChatworkMentionText } = await import('@/services/v43/botIntentClassifier.service');
      cleanText = extractChatworkMentionText(text);
    } catch (importErr) {
      console.error('[Chatwork Webhook] botIntentClassifier import エラー:', importErr);
      cleanText = text.replace(/\[To:\d+\][^\n]*/g, '').trim();
    }

    let classification;
    try {
      const { classifyBotIntentWithAi } = await import('@/services/v43/botAiClassifier.service');
      classification = await classifyBotIntentWithAi(cleanText);
    } catch (aiErr) {
      console.error('[Chatwork Webhook] AI分類 import/実行エラー:', aiErr);
      classification = { intent: 'bot_help' as const, isTaskCreate: false, source: 'keyword' as const };
    }

    // タスク作成依頼と判定された場合 → 作成フローへ
    if (classification.isTaskCreate) {
      processTaskCreation({
        text: cleanText,
        roomId,
        messageId: '',
        fromAccountId: 0,
      }).catch(err => {
        console.error('[Chatwork Webhook] ボット→タスク作成リダイレクトエラー:', err);
        sendReply(roomId, 'タスク作成中にエラーが発生しました。').catch(() => {});
      });
      return;
    }

    // レスポンス生成
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://node-map-eight.vercel.app';
    const { generateBotResponse } = await import('@/services/v43/botResponseGenerator.service');
    const response = await generateBotResponse(channel.data.project_id, classification.intent, baseUrl);

    // Chatwork返信
    await sendReply(roomId, response.text);
  } catch (error) {
    console.error('[Chatwork Webhook] ボット応答処理エラー:', error);
    // ★ エラーでも必ず返信する
    await sendReply(roomId, '処理中にエラーが発生しました。もう一度お試しください。').catch(() => {});
  }
}

// ★ 注意: すべてのChatwork返信は sendReply() を使用すること
// sendReply は CHATWORK_BOT_API_TOKEN を優先使用し、BOTアカウントから送信する
