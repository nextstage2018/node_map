/**
 * v4.5: 外部タスク同期サービス
 *
 * NodeMapのタスク作成時に、Slack Block Kit カード / Chatworkネイティブタスクを同時作成。
 * 完了時の双方向同期も担当。
 *
 * ■ Slack: Block Kit リッチカード（ボタン付き）を投稿
 *   - 「完了」ボタン → /api/webhooks/slack/interactions で受信 → NodeMapタスク完了
 *   - NodeMapで完了 → chat.update でカードを完了表示に更新
 *
 * ■ Chatwork: ネイティブタスクAPI でタスク作成
 *   - Chatwork画面のタスクパネルに表示される
 *   - NodeMapで完了 → Chatwork API でタスクも完了に
 *   - Chatworkで完了 → Webhook受信 → NodeMapタスク完了
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ============================================================
// 型定義
// ============================================================

export interface ExternalTaskParams {
  taskId: string;
  title: string;
  dueDate: string | null;
  projectName: string | null;
  milestoneName: string | null;
  requesterName: string | null;
  serviceName: 'slack' | 'chatwork';
  channelId: string;          // Slack: channel ID, Chatwork: room ID
  threadTs?: string;           // Slack: スレッドのts
  assigneeIdentifier?: string; // Chatwork: account_id, Slack: user_id
}

interface SlackBlockKitResult {
  ok: boolean;
  messageTs: string | null;
}

interface ChatworkTaskResult {
  ok: boolean;
  taskId: number | null;
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * タスク作成後に外部サービスへ同期
 * ※ 失敗してもNodeMapのタスク作成自体はブロックしない
 */
export async function syncTaskToExternal(params: ExternalTaskParams): Promise<void> {
  try {
    if (params.serviceName === 'slack') {
      await syncToSlack(params);
    } else if (params.serviceName === 'chatwork') {
      await syncToChatwork(params);
    }
  } catch (error) {
    console.error('[ExternalTaskSync] 同期エラー（無視して続行）:', error);
  }
}

/**
 * タスク完了時に外部サービスも完了にする
 */
export async function syncTaskCompletionToExternal(taskId: string, userId: string): Promise<void> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return;

    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, source_type, source_channel_id, external_task_id, slack_message_ts')
      .eq('id', taskId)
      .single();

    if (!task) return;

    if (task.source_type === 'slack' && task.slack_message_ts) {
      await updateSlackCardToCompleted(task.source_channel_id, task.slack_message_ts, task.title, userId);
    }

    if (task.source_type === 'chatwork' && task.external_task_id && task.source_channel_id) {
      await completeChatworkTask(task.source_channel_id, task.external_task_id);
    }
  } catch (error) {
    console.error('[ExternalTaskSync] 完了同期エラー:', error);
  }
}

// ============================================================
// Slack Block Kit カード
// ============================================================

/**
 * Slack Block Kit でリッチなタスクカードを投稿
 */
async function syncToSlack(params: ExternalTaskParams): Promise<void> {
  const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
  if (!token) {
    console.log('[ExternalTaskSync] Slackトークン未設定、スキップ');
    return;
  }

  const blocks = buildSlackTaskCard(params);
  const fallbackText = `タスク作成: ${params.title}`;

  const result = await postSlackBlockMessage({
    token,
    channelId: params.channelId,
    threadTs: params.threadTs,
    blocks,
    text: fallbackText,
  });

  if (result.ok && result.messageTs) {
    // slack_message_ts を保存（後で chat.update するため）
    await updateTaskExternalInfo(params.taskId, {
      slack_message_ts: result.messageTs,
      external_sync_status: 'synced',
    });
    console.log(`[ExternalTaskSync] Slack カード投稿成功: ts=${result.messageTs}`);
  } else {
    await updateTaskExternalInfo(params.taskId, { external_sync_status: 'failed' });
  }
}

/**
 * Slack Block Kit タスクカードのブロック定義
 * スクリーンショットの「sapot」アプリ風のデザイン
 */
function buildSlackTaskCard(params: ExternalTaskParams): Record<string, unknown>[] {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://node-map-eight.vercel.app';

  // ヘッダー: タスク名 + 期限
  const titleLine = params.dueDate
    ? `*${params.title}*  (${formatDateJP(params.dueDate)})`
    : `*${params.title}*`;

  // 詳細フィールド
  const fields: Record<string, unknown>[] = [];
  if (params.requesterName) {
    fields.push({ type: 'mrkdwn', text: `*依頼:* ${params.requesterName}` });
  }
  if (params.projectName) {
    fields.push({ type: 'mrkdwn', text: `*PJ:* ${params.projectName}` });
  }
  if (params.milestoneName) {
    fields.push({ type: 'mrkdwn', text: `*MS:* ${params.milestoneName}` });
  }
  if (params.dueDate) {
    fields.push({ type: 'mrkdwn', text: `*期限:* ${formatDateJP(params.dueDate)}` });
  }

  const blocks: Record<string, unknown>[] = [
    // タイトルセクション
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:clipboard: ${titleLine}`,
      },
    },
  ];

  // フィールドがある場合は追加
  if (fields.length > 0) {
    blocks.push({
      type: 'section',
      fields,
    });
  }

  // アクションボタン
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '編集 ✏️', emoji: true },
        action_id: `nm_task_edit_${params.taskId}`,
        value: params.taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '完了 ✨', emoji: true },
        style: 'primary',
        action_id: `nm_task_complete_${params.taskId}`,
        value: params.taskId,
      },
    ],
  });

  // コンテキスト（フッター）
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `NodeMap タスク管理`,
      },
    ],
  });

  return blocks;
}

/**
 * Slack Block Kit カードを完了状態に更新
 */
async function updateSlackCardToCompleted(
  channelId: string,
  messageTs: string,
  title: string,
  userId: string
): Promise<void> {
  const token = await getSlackBotToken(userId);
  if (!token) return;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:white_check_mark: ~${title}~ *完了*`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `NodeMap タスク管理 — ${formatDateTimeJP(new Date())} に完了`,
        },
      ],
    },
  ];

  try {
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: `✅ タスク完了: ${title}`,
      }),
    });
    console.log(`[ExternalTaskSync] Slack カード完了更新: ${title}`);
  } catch (error) {
    console.error('[ExternalTaskSync] Slack カード更新エラー:', error);
  }
}

/**
 * Slack API でBlock Kitメッセージを投稿
 */
async function postSlackBlockMessage(params: {
  token: string;
  channelId: string;
  threadTs?: string;
  blocks: Record<string, unknown>[];
  text: string;
}): Promise<SlackBlockKitResult> {
  try {
    const body: Record<string, unknown> = {
      channel: params.channelId,
      blocks: params.blocks,
      text: params.text,       // フォールバック（通知用）
      unfurl_links: false,
    };
    if (params.threadTs) {
      body.thread_ts = params.threadTs;
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[ExternalTaskSync] Slack Block投稿エラー:', data.error);
      return { ok: false, messageTs: null };
    }

    return { ok: true, messageTs: data.ts };
  } catch (error) {
    console.error('[ExternalTaskSync] Slack Block投稿例外:', error);
    return { ok: false, messageTs: null };
  }
}

// ============================================================
// Chatwork ネイティブタスク
// ============================================================

/**
 * Chatwork APIでルーム内タスクを作成
 */
async function syncToChatwork(params: ExternalTaskParams): Promise<void> {
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) {
    console.log('[ExternalTaskSync] Chatworkトークン未設定、スキップ');
    return;
  }

  const result = await createChatworkTask({
    token,
    roomId: params.channelId,
    body: buildChatworkTaskBody(params),
    dueDate: params.dueDate,
    assigneeAccountId: params.assigneeIdentifier,
  });

  if (result.ok && result.taskId) {
    await updateTaskExternalInfo(params.taskId, {
      external_task_id: String(result.taskId),
      external_sync_status: 'synced',
    });
    console.log(`[ExternalTaskSync] Chatwork タスク作成成功: task_id=${result.taskId}`);
  } else {
    await updateTaskExternalInfo(params.taskId, { external_sync_status: 'failed' });
  }
}

/**
 * Chatworkタスクの本文を構築
 */
function buildChatworkTaskBody(params: ExternalTaskParams): string {
  const parts = [params.title];
  if (params.projectName) parts.push(`PJ: ${params.projectName}`);
  if (params.milestoneName) parts.push(`MS: ${params.milestoneName}`);
  return parts.join('\n');
}

/**
 * Chatwork API でタスクを作成
 */
async function createChatworkTask(params: {
  token: string;
  roomId: string;
  body: string;
  dueDate: string | null;
  assigneeAccountId?: string;
}): Promise<ChatworkTaskResult> {
  try {
    const formParams = new URLSearchParams();
    formParams.append('body', params.body);

    // 担当者（to_ids）
    if (params.assigneeAccountId) {
      formParams.append('to_ids', params.assigneeAccountId);
    }

    // 期限
    if (params.dueDate) {
      const unixTime = Math.floor(new Date(params.dueDate + 'T18:00:00+09:00').getTime() / 1000);
      formParams.append('limit', String(unixTime));
      formParams.append('limit_type', 'time');
    }

    const res = await fetch(`https://api.chatwork.com/v2/rooms/${params.roomId}/tasks`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': params.token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[ExternalTaskSync] Chatwork タスク作成エラー: ${res.status} ${errorText}`);
      return { ok: false, taskId: null };
    }

    const data = await res.json();
    return { ok: true, taskId: data.task_ids?.[0] || data.task_id || null };
  } catch (error) {
    console.error('[ExternalTaskSync] Chatwork タスク作成例外:', error);
    return { ok: false, taskId: null };
  }
}

/**
 * Chatwork API でタスクを完了にする
 */
async function completeChatworkTask(roomId: string, externalTaskId: string): Promise<void> {
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(
      `https://api.chatwork.com/v2/rooms/${roomId}/tasks/${externalTaskId}/status`,
      {
        method: 'PUT',
        headers: {
          'X-ChatWorkToken': token,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'body=done',
      }
    );

    if (res.ok) {
      console.log(`[ExternalTaskSync] Chatwork タスク完了: task_id=${externalTaskId}`);
    } else {
      console.error(`[ExternalTaskSync] Chatwork タスク完了エラー: ${res.status}`);
    }
  } catch (error) {
    console.error('[ExternalTaskSync] Chatwork タスク完了例外:', error);
  }
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * tasks テーブルの外部同期情報を更新
 */
async function updateTaskExternalInfo(
  taskId: string,
  updates: Record<string, string>
): Promise<void> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return;

    await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', taskId);
  } catch (error) {
    console.error('[ExternalTaskSync] DB更新エラー:', error);
  }
}

/**
 * Slack Bot トークンを取得
 */
async function getSlackBotToken(userId: string): Promise<string | null> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (supabase && userId) {
      const { data: tokenRow } = await supabase
        .from('user_service_tokens')
        .select('token_data')
        .eq('user_id', userId)
        .eq('service_name', 'slack')
        .eq('is_active', true)
        .single();

      if (tokenRow?.token_data?.access_token) {
        return tokenRow.token_data.access_token;
      }
    }
  } catch { /* フォールバック */ }

  return process.env.SLACK_BOT_TOKEN || null;
}

/**
 * 日付を日本語フォーマット
 */
function formatDateJP(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[d.getDay()];
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}(${weekday})`;
}

/**
 * 日時を日本語フォーマット
 */
function formatDateTimeJP(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${month}/${day} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ============================================================
// Slack Interactions 処理（ボタン押下ハンドラ）
// ============================================================

/**
 * Slack Interactivity payload からタスク完了を処理
 * /api/webhooks/slack/interactions から呼ばれる
 */
export async function handleSlackTaskComplete(payload: {
  action_id: string;
  value: string;         // taskId
  channel_id: string;
  message_ts: string;
  user_id: string;
}): Promise<{ ok: boolean; message: string }> {
  const { value: taskId, channel_id, message_ts } = payload;

  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false, message: 'DB接続エラー' };

    // タスクを取得
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, status, project_id')
      .eq('id', taskId)
      .single();

    if (!task) return { ok: false, message: 'タスクが見つかりません' };
    if (task.status === 'done') return { ok: true, message: '既に完了済みです' };

    // タスクを完了に
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) return { ok: false, message: 'タスク更新エラー' };

    // Slack カードを完了表示に更新
    const userId = process.env.ENV_TOKEN_OWNER_ID || '';
    await updateSlackCardToCompleted(channel_id, message_ts, task.title, userId);

    // Chatwork側にも外部タスクがあれば完了に
    const { data: fullTask } = await supabase
      .from('tasks')
      .select('external_task_id, source_channel_id, source_type')
      .eq('id', taskId)
      .single();

    if (fullTask?.source_type === 'chatwork' && fullTask.external_task_id && fullTask.source_channel_id) {
      await completeChatworkTask(fullTask.source_channel_id, fullTask.external_task_id);
    }

    // ビジネスイベント
    if (task.project_id) {
      try {
        await supabase.from('business_events').insert({
          id: crypto.randomUUID(),
          project_id: task.project_id,
          event_type: 'task_completed',
          content: `タスク完了（Slackボタン）: ${task.title}`,
          event_date: new Date().toISOString(),
          ai_generated: true,
        });
      } catch { /* 無視 */ }
    }

    console.log(`[ExternalTaskSync] Slackボタンでタスク完了: ${task.title}`);
    return { ok: true, message: `タスク完了: ${task.title}` };
  } catch (error) {
    console.error('[ExternalTaskSync] Slackボタン完了エラー:', error);
    return { ok: false, message: '処理エラー' };
  }
}

// ============================================================
// Slack 編集モーダル
// ============================================================

/**
 * Slack 編集モーダルを開く
 * 「編集」ボタン押下時に trigger_id を使ってモーダルを表示
 */
export async function openSlackEditModal(payload: {
  trigger_id: string;
  taskId: string;
}): Promise<{ ok: boolean }> {
  const { trigger_id, taskId } = payload;

  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false };

    // タスク情報を取得（担当者・プロジェクト含む）
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, due_date, description, assigned_contact_id, project_id')
      .eq('id', taskId)
      .single();

    if (!task) return { ok: false };

    const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
    if (!token) return { ok: false };

    // プロジェクトメンバーを取得（担当者ドロップダウン用）
    const memberOptions: { text: { type: 'plain_text'; text: string }; value: string }[] = [];

    if (task.project_id) {
      const { data: members } = await supabase
        .from('project_members')
        .select('contact_id, contact_persons!inner(id, name)')
        .eq('project_id', task.project_id);

      if (members) {
        for (const m of members) {
          const cp = m.contact_persons as unknown as { id: string; name: string } | null;
          if (cp?.name) {
            memberOptions.push({
              text: { type: 'plain_text' as const, text: cp.name },
              value: cp.id,
            });
          }
        }
      }
    }

    // 「自分」をリストに追加
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID || '';
    if (ownerUserId) {
      const { data: myContact } = await supabase
        .from('contact_persons')
        .select('id, name')
        .eq('linked_user_id', ownerUserId)
        .limit(1)
        .maybeSingle();

      if (myContact && !memberOptions.find(o => o.value === myContact.id)) {
        memberOptions.unshift({
          text: { type: 'plain_text' as const, text: `${myContact.name}（自分）` },
          value: myContact.id,
        });
      }
    }

    // モーダルのブロック定義
    const blocks: Record<string, unknown>[] = [
      {
        type: 'input',
        block_id: 'task_title_block',
        label: { type: 'plain_text', text: '内容' },
        element: {
          type: 'plain_text_input',
          action_id: 'task_title',
          initial_value: task.title || '',
          max_length: 100,
        },
      },
    ];

    // 担当者ドロップダウン（メンバーがいる場合のみ）
    if (memberOptions.length > 0) {
      const assigneeBlock: Record<string, unknown> = {
        type: 'input',
        block_id: 'task_assignee_block',
        label: { type: 'plain_text', text: '担当者' },
        optional: true,
        element: {
          type: 'static_select',
          action_id: 'task_assignee',
          placeholder: { type: 'plain_text', text: '担当者を選択' },
          options: memberOptions,
        },
      };

      // 現在の担当者がメンバーリストにいれば初期選択
      if (task.assigned_contact_id) {
        const currentOption = memberOptions.find(o => o.value === task.assigned_contact_id);
        if (currentOption) {
          (assigneeBlock.element as Record<string, unknown>).initial_option = currentOption;
        }
      }

      blocks.push(assigneeBlock);
    }

    blocks.push(
      {
        type: 'input',
        block_id: 'task_due_date_block',
        label: { type: 'plain_text', text: '期限' },
        optional: true,
        element: {
          type: 'datepicker',
          action_id: 'task_due_date',
          initial_date: task.due_date || undefined,
          placeholder: { type: 'plain_text', text: '期限を選択' },
        },
      },
      {
        type: 'input',
        block_id: 'task_description_block',
        label: { type: 'plain_text', text: '詳細' },
        optional: true,
        element: {
          type: 'plain_text_input',
          action_id: 'task_description',
          multiline: true,
          initial_value: task.description || '',
          max_length: 500,
        },
      },
    );

    // モーダルのビュー定義
    const view: Record<string, unknown> = {
      type: 'modal',
      callback_id: 'nm_task_edit_submit',
      private_metadata: taskId,
      title: { type: 'plain_text', text: 'タスクを編集する' },
      submit: { type: 'plain_text', text: 'OK！' },
      close: { type: 'plain_text', text: 'やめとく' },
      blocks,
    };

    const res = await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ trigger_id, view }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[ExternalTaskSync] モーダルオープンエラー:', data.error);
      return { ok: false };
    }

    console.log(`[ExternalTaskSync] 編集モーダル表示: ${task.title}`);
    return { ok: true };
  } catch (error) {
    console.error('[ExternalTaskSync] モーダルオープン例外:', error);
    return { ok: false };
  }
}

/**
 * モーダル送信（view_submission）を処理してタスクを更新
 */
export async function handleSlackEditSubmission(payload: {
  taskId: string;
  title: string;
  dueDate: string | null;
  description: string | null;
  assigneeContactId?: string | null;
  channel_id: string;
  message_ts: string;
}): Promise<{ ok: boolean }> {
  const { taskId, title, dueDate, description, assigneeContactId } = payload;

  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false };

    // タスクを更新
    const updates: Record<string, unknown> = {
      title,
      updated_at: new Date().toISOString(),
    };
    if (dueDate !== undefined) updates.due_date = dueDate;
    if (description !== undefined) updates.description = description;
    if (assigneeContactId !== undefined) updates.assigned_contact_id = assigneeContactId;

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      console.error('[ExternalTaskSync] タスク更新エラー:', error);
      return { ok: false };
    }

    // Slack カードも更新（タスク情報を再取得してカードを差し替え）
    const { data: updatedTask } = await supabase
      .from('tasks')
      .select('id, title, due_date, project_id, milestone_id, slack_message_ts, source_channel_id, requester_contact_id')
      .eq('id', taskId)
      .single();

    if (updatedTask?.slack_message_ts && updatedTask?.source_channel_id) {
      // プロジェクト名・MS名・依頼者名を取得
      let projectName: string | null = null;
      let milestoneName: string | null = null;
      let requesterName: string | null = null;

      if (updatedTask.project_id) {
        const { data: pj } = await supabase.from('projects').select('name').eq('id', updatedTask.project_id).single();
        projectName = pj?.name || null;
      }
      if (updatedTask.milestone_id) {
        const { data: ms } = await supabase.from('milestones').select('title').eq('id', updatedTask.milestone_id).single();
        milestoneName = ms?.title || null;
      }
      if (updatedTask.requester_contact_id) {
        const { data: req } = await supabase.from('contact_persons').select('name').eq('id', updatedTask.requester_contact_id).single();
        requesterName = req?.name || null;
      }

      // 新しいカードを生成して差し替え
      const blocks = buildSlackTaskCard({
        taskId,
        title: updatedTask.title,
        dueDate: updatedTask.due_date,
        projectName,
        milestoneName,
        requesterName,
        serviceName: 'slack',
        channelId: updatedTask.source_channel_id,
      });

      const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
      if (token) {
        await fetch('https://slack.com/api/chat.update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            channel: updatedTask.source_channel_id,
            ts: updatedTask.slack_message_ts,
            blocks,
            text: `タスク更新: ${updatedTask.title}`,
          }),
        });
      }
    }

    console.log(`[ExternalTaskSync] タスク編集完了: ${title}`);
    return { ok: true };
  } catch (error) {
    console.error('[ExternalTaskSync] タスク編集エラー:', error);
    return { ok: false };
  }
}
