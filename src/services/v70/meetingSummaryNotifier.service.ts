/**
 * v7.0: 会議サマリー自動チャネル投稿サービス
 *
 * パイプライン完了後に、プロジェクトのSlack/Chatworkチャネルへ自動投稿:
 * - 議事録要約
 * - 決定事項
 * - 未確定事項
 * - タスク提案（Slack: Block Kit カード / Chatwork: ネイティブタスク）
 *
 * 公開レベル: organizations.relationship_type で分岐
 *   internal → 全項目表示
 *   client/partner → 未確定事項を除外
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import type { AIDetectedOpenIssue } from '@/services/v34/openIssues.service';
import type { AIDetectedDecision } from '@/services/v34/decisionLog.service';

// ============================================================
// 型定義
// ============================================================

export interface MeetingSummaryNotifyParams {
  projectId: string;
  meetingTitle: string;
  meetingDate: string;
  meetingRecordId: string;
  summary: string;
  decisions: AIDetectedDecision[];
  openIssues: AIDetectedOpenIssue[];
  actionItems: {
    title: string;
    assignee: string;
    assigneeContactId: string | null;
    context: string;
    due_date: string | null;
    priority: 'high' | 'medium' | 'low';
  }[];
  userId: string;
}

interface ProjectChannel {
  service_name: string;
  identifier: string;  // Slack: channel_id, Chatwork: room_id
}

interface SlackTaskProposalResult {
  messageTs: string | null;
  actionItemIndex: number;
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * 会議パイプライン完了後にチャネルへ自動投稿
 * ※ 失敗してもメインパイプラインはブロックしない（try-catch済み）
 */
export async function notifyMeetingSummaryToChannels(
  params: MeetingSummaryNotifyParams
): Promise<{ slackSent: boolean; chatworkSent: boolean }> {
  const result = { slackSent: false, chatworkSent: false };

  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      console.error('[MeetingSummaryNotifier] Supabase接続なし');
      return result;
    }

    // 1. プロジェクトのチャネル一覧を取得
    const { data: channels } = await supabase
      .from('project_channels')
      .select('service_name, channel_identifier')
      .eq('project_id', params.projectId);

    if (!channels || channels.length === 0) {
      console.log('[MeetingSummaryNotifier] チャネルなし、スキップ');
      return result;
    }

    // 2. 公開レベルを取得（relationship_type）
    const relationshipType = await getRelationshipType(supabase, params.projectId);
    const isInternal = relationshipType === 'internal';

    // 3. 各チャネルへ投稿
    for (const channel of channels as { service_name: string; channel_identifier: string }[]) {
      try {
        if (channel.service_name === 'slack') {
          await sendSlackMeetingSummary(params, channel.channel_identifier, isInternal);
          result.slackSent = true;
        } else if (channel.service_name === 'chatwork') {
          await sendChatworkMeetingSummary(params, channel.channel_identifier, isInternal);
          result.chatworkSent = true;
        }
      } catch (channelError) {
        console.error(`[MeetingSummaryNotifier] ${channel.service_name}投稿エラー:`, channelError);
      }
    }

    console.log(`[MeetingSummaryNotifier] 完了: slack=${result.slackSent}, chatwork=${result.chatworkSent}`);
    return result;
  } catch (error) {
    console.error('[MeetingSummaryNotifier] エラー:', error);
    return result;
  }
}

// ============================================================
// Slack投稿（Block Kit）
// ============================================================

/**
 * Slackにサマリー + Block Kitタスク提案カードを投稿
 */
async function sendSlackMeetingSummary(
  params: MeetingSummaryNotifyParams,
  channelId: string,
  isInternal: boolean
): Promise<void> {
  const token = await getSlackBotToken(params.userId);
  if (!token) {
    console.log('[MeetingSummaryNotifier] Slackトークンなし、スキップ');
    return;
  }

  // --- パート1: サマリーメッセージ ---
  const summaryBlocks = buildSlackSummaryBlocks(params, isInternal);
  const summaryText = `📋 会議録サマリー: ${params.meetingTitle}`;

  const summaryRes = await postSlackMessage({
    token,
    channelId,
    blocks: summaryBlocks,
    text: summaryText,
  });

  if (!summaryRes.ok) {
    console.error('[MeetingSummaryNotifier] Slackサマリー投稿失敗');
    return;
  }

  const threadTs = summaryRes.messageTs;

  // --- パート2: タスク提案カード（スレッド内に個別投稿） ---
  if (params.actionItems.length > 0 && threadTs) {
    for (let i = 0; i < params.actionItems.length; i++) {
      const item = params.actionItems[i];
      try {
        const taskBlocks = buildSlackTaskProposalCard(item, i, params.meetingRecordId);
        await postSlackMessage({
          token,
          channelId,
          blocks: taskBlocks,
          text: `タスク提案: ${item.title}`,
          threadTs,
        });
      } catch (cardError) {
        console.error(`[MeetingSummaryNotifier] Slackタスク提案カード${i}投稿エラー:`, cardError);
      }
    }
  }

  console.log(`[MeetingSummaryNotifier] Slack投稿完了: ${params.meetingTitle}`);
}

/**
 * Slackサマリー部分のBlock Kitブロック
 */
function buildSlackSummaryBlocks(
  params: MeetingSummaryNotifyParams,
  isInternal: boolean
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // ヘッダー
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📋 ${params.meetingTitle}`,
      emoji: true,
    },
  });

  // 要約
  if (params.summary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*【要約】*\n${truncateText(params.summary, 500)}`,
      },
    });
  }

  // 決定事項
  if (params.decisions.length > 0) {
    const decisionLines = params.decisions
      .map(d => `• ${d.title}${d.decision_content ? `\n   _${truncateText(d.decision_content, 100)}_` : ''}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*【決定事項】*\n${decisionLines}`,
      },
    });
  }

  // 未確定事項（internalのみ）
  if (isInternal && params.openIssues.length > 0) {
    const issueLines = params.openIssues
      .map(issue => `• ${issue.title}${issue.description ? `\n   _${truncateText(issue.description, 80)}_` : ''}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*【未確定事項】*\n${issueLines}`,
      },
    });
  }

  // 区切り線
  blocks.push({ type: 'divider' });

  // タスク提案があることを知らせる
  if (params.actionItems.length > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📌 *タスク提案が${params.actionItems.length}件あります*（このスレッド内で承認・編集できます）`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Slack タスク提案カード（個別Block Kit）
 * 承認ボタン → タスクとしてNodeMapに登録
 * 編集ボタン → モーダルで担当者・期限を編集してから登録
 * 却下ボタン → 提案を却下
 */
function buildSlackTaskProposalCard(
  item: MeetingSummaryNotifyParams['actionItems'][0],
  index: number,
  meetingRecordId: string
): Record<string, unknown>[] {
  const priorityEmoji = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
  const dueDateStr = item.due_date ? formatDateJP(item.due_date) : '未定';

  const blocks: Record<string, unknown>[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${priorityEmoji} *${item.title}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*担当候補:* ${item.assignee || '未定'}` },
        { type: 'mrkdwn', text: `*期限:* ${dueDateStr}` },
      ],
    },
  ];

  // コンテキスト（背景情報）を折りたたみ表示
  if (item.context) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `💡 ${truncateText(item.context, 200)}` },
      ],
    });
  }

  // アクションボタン
  // value に JSON で提案情報を格納（interactions で受信時にパース）
  const proposalValue = JSON.stringify({
    meetingRecordId,
    index,
    title: item.title,
    assignee: item.assignee,
    assigneeContactId: item.assigneeContactId,
    dueDate: item.due_date,
    priority: item.priority,
    context: item.context,
  });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ 編集して承認', emoji: true },
        style: 'primary',
        action_id: `nm_proposal_edit_${meetingRecordId}_${index}`,
        value: proposalValue,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ 却下', emoji: true },
        action_id: `nm_proposal_dismiss_${meetingRecordId}_${index}`,
        value: proposalValue,
      },
    ],
  });

  return blocks;
}

// ============================================================
// Chatwork投稿（テキスト + ネイティブタスク）
// ============================================================

/**
 * Chatworkにサマリーテキスト + ネイティブタスク作成
 */
async function sendChatworkMeetingSummary(
  params: MeetingSummaryNotifyParams,
  roomId: string,
  isInternal: boolean
): Promise<void> {
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) {
    console.log('[MeetingSummaryNotifier] Chatworkトークンなし、スキップ');
    return;
  }

  // --- パート1: サマリーテキスト投稿 ---
  const summaryText = buildChatworkSummaryText(params, isInternal);
  await postChatworkMessage(token, roomId, summaryText);

  // --- パート2: ネイティブタスク作成 ---
  if (params.actionItems.length > 0) {
    for (const item of params.actionItems) {
      try {
        // Chatworkの担当者IDを解決
        const assigneeAccountId = item.assigneeContactId
          ? await resolveChatworkAccountId(item.assigneeContactId)
          : null;

        await createChatworkNativeTask({
          token,
          roomId,
          body: buildChatworkTaskBody(item, params.meetingTitle),
          dueDate: item.due_date,
          assigneeAccountId,
        });
      } catch (taskError) {
        console.error(`[MeetingSummaryNotifier] Chatworkタスク作成エラー:`, taskError);
      }
    }
  }

  console.log(`[MeetingSummaryNotifier] Chatwork投稿完了: ${params.meetingTitle}`);
}

/**
 * Chatworkサマリーテキスト
 */
function buildChatworkSummaryText(
  params: MeetingSummaryNotifyParams,
  isInternal: boolean
): string {
  const lines: string[] = [];

  lines.push(`[info][title]📋 ${params.meetingTitle}[/title]`);

  // 要約
  if (params.summary) {
    lines.push('【要約】');
    lines.push(truncateText(params.summary, 500));
    lines.push('');
  }

  // 決定事項
  if (params.decisions.length > 0) {
    lines.push('【決定事項】');
    params.decisions.forEach(d => {
      lines.push(`・${d.title}`);
      if (d.decision_content) lines.push(`  ${d.decision_content}`);
    });
    lines.push('');
  }

  // 未確定事項（internalのみ）
  if (isInternal && params.openIssues.length > 0) {
    lines.push('【未確定事項】');
    params.openIssues.forEach(issue => {
      lines.push(`・${issue.title}`);
      if (issue.description) lines.push(`  ${issue.description}`);
    });
    lines.push('');
  }

  // タスク提案の通知
  if (params.actionItems.length > 0) {
    lines.push(`📌 タスクが${params.actionItems.length}件作成されました（Chatworkタスクパネルを確認してください）`);
    params.actionItems.forEach(item => {
      const dueDateStr = item.due_date ? formatDateJP(item.due_date) : '期限未定';
      lines.push(`・${item.title}（${item.assignee || '担当未定'}, ${dueDateStr}）`);
    });
  }

  lines.push('[/info]');
  return lines.join('\n');
}

/**
 * Chatworkネイティブタスクの本文
 */
function buildChatworkTaskBody(
  item: MeetingSummaryNotifyParams['actionItems'][0],
  meetingTitle: string
): string {
  const parts = [item.title];
  if (item.context) {
    parts.push(`\n背景: ${truncateText(item.context, 200)}`);
  }
  parts.push(`\n会議: ${meetingTitle}`);
  return parts.join('');
}

/**
 * Chatwork ネイティブタスクAPIでタスクを作成
 */
async function createChatworkNativeTask(params: {
  token: string;
  roomId: string;
  body: string;
  dueDate: string | null;
  assigneeAccountId: string | null;
}): Promise<void> {
  const formParams = new URLSearchParams();
  formParams.append('body', params.body);

  if (params.assigneeAccountId) {
    formParams.append('to_ids', params.assigneeAccountId);
  }

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
    console.error(`[MeetingSummaryNotifier] Chatworkタスク作成エラー: ${res.status} ${errorText}`);
  } else {
    console.log(`[MeetingSummaryNotifier] Chatworkタスク作成成功`);
  }
}

/**
 * contact_persons の contact_channels からChatwork account_idを取得
 */
async function resolveChatworkAccountId(contactId: string): Promise<string | null> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return null;

    const { data } = await supabase
      .from('contact_channels')
      .select('address')
      .eq('contact_id', contactId)
      .eq('channel', 'chatwork')
      .limit(1)
      .single();

    return data?.address || null;
  } catch {
    return null;
  }
}

// ============================================================
// Slack Interactions ハンドラ（タスク提案の承認/編集/却下）
// ============================================================

/**
 * タスク提案の「承認」ボタン処理
 * task_suggestionsのステータス更新 + tasks テーブルに新規作成 + カード更新
 */
export async function handleProposalApprove(payload: {
  value: string;  // JSON文字列
  channel_id: string;
  message_ts: string;
  user_id: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const proposal = JSON.parse(payload.value);
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false, message: 'DB接続エラー' };

    // 会議録からproject_idを取得
    const { data: record } = await supabase
      .from('meeting_records')
      .select('project_id')
      .eq('id', proposal.meetingRecordId)
      .single();

    if (!record) return { ok: false, message: '会議録が見つかりません' };

    // タスクを作成
    const taskId = crypto.randomUUID();
    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      title: proposal.title,
      project_id: record.project_id,
      status: 'todo',
      priority: proposal.priority || 'medium',
      due_date: proposal.dueDate || null,
      assigned_contact_id: proposal.assigneeContactId || null,
      description: proposal.context || null,
      source_type: 'meeting_record',
      user_id: process.env.ENV_TOKEN_OWNER_ID || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[MeetingSummaryNotifier] タスク作成エラー:', error);
      return { ok: false, message: 'タスク作成エラー' };
    }

    // Slackカードを承認済みに更新
    const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
    if (token) {
      await updateSlackProposalCard(token, payload.channel_id, payload.message_ts, proposal.title, 'approved');
    }

    console.log(`[MeetingSummaryNotifier] タスク承認: ${proposal.title}`);
    return { ok: true, message: `タスク作成: ${proposal.title}` };
  } catch (error) {
    console.error('[MeetingSummaryNotifier] 承認エラー:', error);
    return { ok: false, message: '処理エラー' };
  }
}

/**
 * タスク提案の「編集して承認」ボタン処理 → モーダルを開く
 */
export async function handleProposalEdit(payload: {
  trigger_id: string;
  value: string;  // JSON文字列
  channel_id: string;
  message_ts: string;
}): Promise<{ ok: boolean }> {
  try {
    const proposal = JSON.parse(payload.value);
    // channel_id/message_tsをprivate_metadataに含める（view_submissionでカード更新に必要）
    proposal._channel_id = payload.channel_id;
    proposal._message_ts = payload.message_ts;
    const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
    if (!token) return { ok: false };

    // プロジェクトメンバーを取得（担当者ドロップダウン用）
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false };

    const { data: record } = await supabase
      .from('meeting_records')
      .select('project_id')
      .eq('id', proposal.meetingRecordId)
      .single();

    if (!record) return { ok: false };

    const { data: members } = await supabase
      .from('project_members')
      .select('contact_id, contact_persons!inner(id, name)')
      .eq('project_id', record.project_id);

    // メンバーオプションを構築
    const memberOptions = (members || [])
      .filter((m: Record<string, unknown>) => {
        const cp = m.contact_persons as Record<string, unknown> | null;
        return cp?.name;
      })
      .map((m: Record<string, unknown>) => {
        const cp = m.contact_persons as Record<string, string>;
        return {
          text: { type: 'plain_text' as const, text: cp.name },
          value: cp.id,
        };
      });

    // 「自分」を追加（linked_user_id → owner_user_id の順で検索）
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID || '';
    if (ownerUserId) {
      // まず linked_user_id で検索
      let myContact: { id: string; name: string } | null = null;
      const { data: linked } = await supabase
        .from('contact_persons')
        .select('id, name')
        .eq('linked_user_id', ownerUserId)
        .limit(1)
        .single();
      myContact = linked;

      // linked_user_id で見つからない場合、user_service_tokens のSlack authed_user_id から検索
      if (!myContact) {
        try {
          const { data: tokenRow } = await supabase
            .from('user_service_tokens')
            .select('token_data')
            .eq('user_id', ownerUserId)
            .eq('service_name', 'slack')
            .eq('is_active', true)
            .single();
          const slackUserId = tokenRow?.token_data?.authed_user_id;
          if (slackUserId) {
            const { data: slackContact } = await supabase
              .from('contact_channels')
              .select('contact_id, contact_persons!inner(id, name)')
              .eq('channel', 'slack')
              .eq('address', slackUserId)
              .limit(1)
              .single();
            if (slackContact?.contact_persons) {
              const cp = slackContact.contact_persons as unknown as { id: string; name: string };
              myContact = { id: cp.id, name: cp.name };
            }
          }
        } catch { /* フォールバック失敗は無視 */ }
      }

      if (myContact && !memberOptions.find((o: { value: string }) => o.value === myContact!.id)) {
        memberOptions.unshift({
          text: { type: 'plain_text' as const, text: `${myContact.name}（自分）` },
          value: myContact.id,
        });
      }
    }

    // モーダル
    const view: Record<string, unknown> = {
      type: 'modal',
      callback_id: 'nm_proposal_edit_submit',
      private_metadata: JSON.stringify(proposal),  // channel_id/message_ts含む
      title: { type: 'plain_text', text: 'タスクを編集して承認' },
      submit: { type: 'plain_text', text: '承認する' },
      close: { type: 'plain_text', text: 'キャンセル' },
      blocks: [
        {
          type: 'input',
          block_id: 'proposal_title_block',
          label: { type: 'plain_text', text: 'タスク名' },
          element: {
            type: 'plain_text_input',
            action_id: 'proposal_title',
            initial_value: proposal.title || '',
          },
        },
        ...(memberOptions.length > 0 ? [{
          type: 'input',
          block_id: 'proposal_assignee_block',
          label: { type: 'plain_text', text: '担当者' },
          optional: true,
          element: {
            type: 'static_select',
            action_id: 'proposal_assignee',
            placeholder: { type: 'plain_text', text: '担当者を選択' },
            options: memberOptions,
            ...(proposal.assigneeContactId ? {
              initial_option: memberOptions.find((o: { value: string }) => o.value === proposal.assigneeContactId) || undefined,
            } : {}),
          },
        }] : []),
        {
          type: 'input',
          block_id: 'proposal_due_date_block',
          label: { type: 'plain_text', text: '期限' },
          optional: true,
          element: {
            type: 'datepicker',
            action_id: 'proposal_due_date',
            ...(proposal.dueDate ? { initial_date: proposal.dueDate } : {}),
            placeholder: { type: 'plain_text', text: '期限を選択' },
          },
        },
        {
          type: 'input',
          block_id: 'proposal_priority_block',
          label: { type: 'plain_text', text: '優先度' },
          element: {
            type: 'static_select',
            action_id: 'proposal_priority',
            options: [
              { text: { type: 'plain_text', text: '🔴 高' }, value: 'high' },
              { text: { type: 'plain_text', text: '🟡 中' }, value: 'medium' },
              { text: { type: 'plain_text', text: '🟢 低' }, value: 'low' },
            ],
            initial_option: {
              text: { type: 'plain_text', text: proposal.priority === 'high' ? '🔴 高' : proposal.priority === 'low' ? '🟢 低' : '🟡 中' },
              value: proposal.priority || 'medium',
            },
          },
        },
      ],
    };

    const res = await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ trigger_id: payload.trigger_id, view }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[MeetingSummaryNotifier] モーダルオープンエラー:', data.error);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error('[MeetingSummaryNotifier] 編集モーダルエラー:', error);
    return { ok: false };
  }
}

/**
 * 編集モーダル送信処理 → タスク作成
 */
export async function handleProposalEditSubmit(payload: {
  private_metadata: string;  // 元の提案JSON
  title: string;
  assigneeContactId: string | null;
  dueDate: string | null;
  priority: string;
  channel_id: string;
  message_ts: string;
}): Promise<{ ok: boolean }> {
  try {
    const proposal = JSON.parse(payload.private_metadata);
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { ok: false };

    const { data: record } = await supabase
      .from('meeting_records')
      .select('project_id')
      .eq('id', proposal.meetingRecordId)
      .single();

    if (!record) return { ok: false };

    // タスクを作成（編集済みの値で）
    const taskId = crypto.randomUUID();
    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      title: payload.title,
      project_id: record.project_id,
      status: 'todo',
      priority: payload.priority || 'medium',
      due_date: payload.dueDate || null,
      assigned_contact_id: payload.assigneeContactId || null,
      description: proposal.context || null,
      source_type: 'meeting_record',
      user_id: process.env.ENV_TOKEN_OWNER_ID || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[MeetingSummaryNotifier] タスク作成エラー:', error);
      return { ok: false };
    }

    // Slackカードを承認済みに更新
    const channelId = proposal._channel_id || payload.channel_id;
    const messageTs = proposal._message_ts || payload.message_ts;
    if (channelId && messageTs) {
      const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
      if (token) {
        await updateSlackProposalCard(token, channelId, messageTs, payload.title, 'approved');
      }
    }

    console.log(`[MeetingSummaryNotifier] 編集タスク承認: ${payload.title}`);
    return { ok: true };
  } catch (error) {
    console.error('[MeetingSummaryNotifier] 編集送信エラー:', error);
    return { ok: false };
  }
}

/**
 * タスク提案の「却下」ボタン処理
 */
export async function handleProposalDismiss(payload: {
  value: string;
  channel_id: string;
  message_ts: string;
}): Promise<{ ok: boolean }> {
  try {
    const proposal = JSON.parse(payload.value);

    // Slackカードを却下表示に更新
    const token = await getSlackBotToken(process.env.ENV_TOKEN_OWNER_ID || '');
    if (token) {
      await updateSlackProposalCard(token, payload.channel_id, payload.message_ts, proposal.title, 'dismissed');
    }

    console.log(`[MeetingSummaryNotifier] タスク却下: ${proposal.title}`);
    return { ok: true };
  } catch (error) {
    console.error('[MeetingSummaryNotifier] 却下エラー:', error);
    return { ok: false };
  }
}

/**
 * Slackのタスク提案カードを結果表示に更新
 */
async function updateSlackProposalCard(
  token: string,
  channelId: string,
  messageTs: string,
  title: string,
  status: 'approved' | 'dismissed'
): Promise<void> {
  const emoji = status === 'approved' ? '✅' : '❌';
  const label = status === 'approved' ? '承認済み' : '却下';

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: status === 'approved'
          ? `${emoji} *${title}* — タスク登録しました`
          : `${emoji} ~${title}~ — ${label}`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `NodeMap — ${formatDateTimeJP(new Date())}` },
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
        text: `${emoji} ${title} — ${label}`,
      }),
    });
  } catch (error) {
    console.error('[MeetingSummaryNotifier] カード更新エラー:', error);
  }
}

// ============================================================
// ユーティリティ
// ============================================================

async function getRelationshipType(
  supabase: ReturnType<typeof getServerSupabase>,
  projectId: string
): Promise<string> {
  try {
    if (!supabase) return 'internal';
    const { data: project } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (!project?.organization_id) return 'internal';

    const { data: org } = await supabase
      .from('organizations')
      .select('relationship_type')
      .eq('id', project.organization_id)
      .single();

    return org?.relationship_type || 'internal';
  } catch {
    return 'internal';
  }
}

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

async function postSlackMessage(params: {
  token: string;
  channelId: string;
  blocks: Record<string, unknown>[];
  text: string;
  threadTs?: string;
}): Promise<{ ok: boolean; messageTs: string | null }> {
  try {
    const body: Record<string, unknown> = {
      channel: params.channelId,
      blocks: params.blocks,
      text: params.text,
      unfurl_links: false,
    };
    if (params.threadTs) body.thread_ts = params.threadTs;

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
      console.error('[MeetingSummaryNotifier] Slack投稿エラー:', data.error);
      return { ok: false, messageTs: null };
    }
    return { ok: true, messageTs: data.ts };
  } catch (error) {
    console.error('[MeetingSummaryNotifier] Slack投稿例外:', error);
    return { ok: false, messageTs: null };
  }
}

async function postChatworkMessage(token: string, roomId: string, body: string): Promise<void> {
  try {
    const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `body=${encodeURIComponent(body)}`,
    });

    if (!res.ok) {
      console.error(`[MeetingSummaryNotifier] Chatwork投稿エラー: ${res.status}`);
    }
  } catch (error) {
    console.error('[MeetingSummaryNotifier] Chatwork投稿例外:', error);
  }
}

function formatDateJP(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${month}/${day}(${weekdays[d.getDay()]})`;
}

function formatDateTimeJP(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${m}/${d} ${h}:${min}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '…';
}
