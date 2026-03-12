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

export async function POST(request: NextRequest) {
  try {
    // ★ Slackリトライ対策: リトライリクエストは即座に200を返す
    // Slackは3秒以内に200が返らないとリトライする。
    // 初回は全処理を完了してからreturnするため3秒を超える可能性があるが、
    // リトライ時は重複処理を避けるため即座に200を返す。
    const retryNum = request.headers.get('X-Slack-Retry-Num');
    if (retryNum) {
      console.log(`[Slack Events] リトライ検知 (retry #${retryNum}), スキップ`);
      return NextResponse.json({ ok: true });
    }

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
      const channelId = event.channel;
      const threadTs = event.thread_ts || event.ts;

      // ★★★ 即レスをHTTPレスポンス返却前に同期送信 ★★★
      await sendQuickReply(channelId, threadTs, '確認中です...');

      // ★★★ 重要: 全処理をawaitで完了してからreturnする ★★★
      // Vercelはreturn後にバックグラウンド処理を打ち切るため、
      // fire-and-forget（.catch()のみ）ではタスク作成が完了しない。
      // Slackリトライはヘッダーチェックで回避済み。
      try {
        if (isTaskRequest(text)) {
          await processTaskCreation({
            text: text.replace(/<@[A-Z0-9]+>/g, '').trim(),
            channelId,
            messageTs: event.ts,
            threadTs,
            userId: event.user,
            teamId,
            skipInstantReply: true,
          });
        } else {
          await processBotMention({
            text,
            channelId,
            threadTs,
            teamId,
            slackUserId: event.user,
            skipInstantReply: true,
          });
        }
      } catch (err) {
        console.error('[Slack Events] 処理エラー:', err);
      }
    } else if (event.type === 'message' && !event.bot_id && !event.subtype) {
      const text = event.text || '';
      try {
        await processMessageSuggestion({
          text,
          channelId: event.channel,
          senderName: undefined,
        });
      } catch (err) {
        console.error('[Slack Events] メッセージ提案エラー:', err);
      }
    } else if (event.type === 'reaction_added') {
      const reaction = event.reaction || '';
      if (['white_check_mark', 'ballot_box_with_check', 'heavy_check_mark'].includes(reaction)) {
        try {
          await processReactionTaskCreation({
            channelId: event.item?.channel,
            messageTs: event.item?.ts,
            userId: event.user,
            teamId,
          });
        } catch (err) {
          console.error('[Slack Events] リアクション処理エラー:', err);
        }
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
  skipInstantReply?: boolean;
}) {
  const { text, channelId, messageTs, threadTs, userId, teamId, skipInstantReply } = params;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Slack Events] ENV_TOKEN_OWNER_ID が未設定');
      return;
    }

    // 即レス：処理開始を通知（POSTハンドラで送信済みの場合はスキップ）
    if (!skipInstantReply) {
      sendQuickReply(channelId, threadTs, 'タスク処理を開始します...');
    }

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
      senderIdentifier: userId, // Slack user ID (U...)
    });

    if (!result) {
      await sendSlackReply(channelId, threadTs, 'タスクの作成に失敗しました。もう一度お試しください。', ownerUserId);
      return;
    }

    // v4.5: Block Kit カードは externalTaskSync が自動投稿するため、
    // ここではシンプルな確認メッセージのみ（カードと重複しないように）
    // Block Kit カード投稿が失敗した場合のフォールバック
    const { getServerSupabase: getSB, getSupabase: getS } = await import('@/lib/supabase');
    const sb = getSB() || getS();
    if (sb) {
      const { data: syncCheck } = await sb
        .from('tasks')
        .select('external_sync_status')
        .eq('id', result.id)
        .single();

      if (syncCheck?.external_sync_status !== 'synced') {
        // Block Kit カード投稿に失敗していた場合のみテキスト返信
        const parts = [`タスクを作成しました: *${result.title}*`];
        if (result.dueDate) parts.push(`期限: ${result.dueDate}`);
        if (result.projectName) parts.push(`PJ: ${result.projectName}`);
        if (result.milestoneName) parts.push(`MS: ${result.milestoneName}`);
        await sendSlackReply(channelId, threadTs, parts.join('\n'), ownerUserId);
      }
    }
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

    const sourceMessageId = `slack-${channelId}-${messageTs}`;

    // v4.0 Phase 6: 既存タスクがあれば完了にする（双方向同期）
    try {
      const { findTaskBySourceMessage, completeTaskBySourceMessage } = await import('@/services/v4/taskCompletionNotify.service');
      const existingTask = await findTaskBySourceMessage(sourceMessageId);

      if (existingTask) {
        const completeResult = await completeTaskBySourceMessage(sourceMessageId, ownerUserId);
        if (completeResult.success) {
          await sendSlackReply(
            channelId,
            messageTs,
            `✅ タスク完了: *${completeResult.taskTitle}*`,
            ownerUserId
          );
        }
        return;
      }
    } catch (checkErr) {
      console.error('[Slack Events] 既存タスクチェックエラー:', checkErr);
    }

    // 既存タスクがなければ新規作成（従来の動作）
    sendQuickReply(channelId, messageTs, 'タスク処理を開始します...');

    const messageText = await fetchMessageText(channelId, messageTs, ownerUserId);
    if (!messageText) return;

    const { createTaskFromMessage } = await import('@/services/v4/taskFromMessage.service');
    const result = await createTaskFromMessage({
      messageText,
      serviceName: 'slack',
      channelId,
      messageId: sourceMessageId,
      userId: ownerUserId,
      senderIdentifier: userId, // Slack user ID (U...)
    });

    if (!result) return;

    // v4.5: Block Kit カードは externalTaskSync が自動投稿
    // 投稿失敗時のフォールバック
    const { getServerSupabase: getSB2, getSupabase: getS2 } = await import('@/lib/supabase');
    const sb2 = getSB2() || getS2();
    if (sb2) {
      const { data: syncCheck2 } = await sb2
        .from('tasks')
        .select('external_sync_status')
        .eq('id', result.id)
        .single();

      if (syncCheck2?.external_sync_status !== 'synced') {
        const parts = [`タスクを作成しました: *${result.title}*`];
        if (result.dueDate) parts.push(`期限: ${result.dueDate}`);
        if (result.projectName) parts.push(`PJ: ${result.projectName}`);
        if (result.milestoneName) parts.push(`MS: ${result.milestoneName}`);
        await sendSlackReply(channelId, messageTs, parts.join('\n'), ownerUserId);
      }
    }
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

// v4.0: 通常メッセージからアクションアイテムを検出 → タスク提案として保存
async function processMessageSuggestion(params: {
  text: string;
  channelId: string;
  senderName?: string;
}) {
  const { text, channelId, senderName } = params;
  if (!text || !channelId) return;

  try {
    const { isActionableMessage, suggestTaskFromMessage } = await import('@/services/v4/taskSuggestionDetector.service');

    if (!isActionableMessage(text)) return;

    await suggestTaskFromMessage({
      messageText: text,
      serviceName: 'slack',
      channelId,
      senderName,
    });
  } catch (error) {
    console.error('[Slack Events] メッセージ提案処理エラー:', error);
  }
}

// v4.3: チャネルボット — メンション応答（AI分類 + 即レス対応）
async function processBotMention(params: {
  text: string;
  channelId: string;
  threadTs: string;
  teamId: string;
  slackUserId?: string;
  skipInstantReply?: boolean;
}) {
  const { text, channelId, threadTs, slackUserId, skipInstantReply } = params;

  // ★ 即レスは原則POSTハンドラで送信済み。未送信の場合のみここで送信
  if (!skipInstantReply) {
    await sendQuickReply(channelId, threadTs, '確認中です...');
  }

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      console.error('[Slack Events] ENV_TOKEN_OWNER_ID が未設定');
      await sendQuickReply(channelId, threadTs, '設定エラーが発生しました。管理者にお問い合わせください。');
      return;
    }

    // チャネル → プロジェクト特定
    const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      await sendQuickReply(channelId, threadTs, 'データベースに接続できません。');
      return;
    }

    const { data: channel } = await supabase
      .from('project_channels')
      .select('project_id')
      .eq('service_name', 'slack')
      .eq('channel_identifier', channelId)
      .maybeSingle();

    console.log(`[Slack Events] チャネル検索: service=slack, channel_identifier=${channelId}, 結果=${JSON.stringify(channel)}`);

    if (!channel?.project_id) {
      await sendQuickReply(channelId, threadTs, 'このチャネルはNodeMapプロジェクトに紐づいていません。');
      return;
    }

    // ★ AI intent分類（フォールバック: キーワードベース）
    let cleanText: string;
    try {
      const { extractSlackMentionText } = await import('@/services/v43/botIntentClassifier.service');
      cleanText = extractSlackMentionText(text);
    } catch (importErr) {
      console.error('[Slack Events] botIntentClassifier import エラー:', importErr);
      cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();
    }

    let classification;
    try {
      const { classifyBotIntentWithAi } = await import('@/services/v43/botAiClassifier.service');
      classification = await classifyBotIntentWithAi(cleanText);
    } catch (aiErr) {
      console.error('[Slack Events] AI分類 import/実行エラー:', aiErr);
      // フォールバック: ヘルプを返す
      classification = { intent: 'bot_help' as const, isTaskCreate: false, source: 'keyword' as const };
    }

    // タスク作成依頼と判定された場合 → 作成フローへ
    if (classification.isTaskCreate) {
      try {
        await processTaskCreation({
          text: cleanText,
          channelId,
          messageTs: threadTs,
          threadTs,
          userId: slackUserId || ownerUserId,
          teamId: '',
          skipInstantReply: true, // 即レスは送信済み
        });
      } catch (err) {
        console.error('[Slack Events] ボット→タスク作成リダイレクトエラー:', err);
        await sendQuickReply(channelId, threadTs, 'タスク作成中にエラーが発生しました。').catch(() => {});
      }
      return;
    }

    // レスポンス生成
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://node-map-eight.vercel.app';
    const { generateBotResponse } = await import('@/services/v43/botResponseGenerator.service');
    const response = await generateBotResponse(channel.project_id, classification.intent, baseUrl);

    // Slack返信
    await sendSlackReply(channelId, threadTs, response.text, ownerUserId);
  } catch (error) {
    console.error('[Slack Events] ボット応答処理エラー:', error);
    // ★ エラーでも必ず返信する
    await sendQuickReply(channelId, threadTs, '処理中にエラーが発生しました。もう一度お試しください。').catch(() => {});
  }
}
