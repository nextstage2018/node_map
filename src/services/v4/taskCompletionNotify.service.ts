/**
 * v4.0 Phase 6: タスク完了時のSlack/Chatwork通知サービス
 *
 * タスクが完了（status='done'）になった時、通知を自動投稿する。
 * - source_type が slack/chatwork → 元スレッドに返信
 * - それ以外（会議録・手動作成等） → project_channels 経由でPJチャネルに投稿
 *
 * 前提: tasks テーブルに source_type / source_message_id / source_channel_id / project_id がある
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

interface TaskForNotify {
  id: string;
  title: string;
  source_type: string | null;
  source_message_id: string | null;
  source_channel_id: string | null;
  project_id: string | null;
}

interface DocLink {
  title: string;
  url: string;
}

/**
 * タスクに紐づく関連資料リンクを取得
 */
async function getTaskDocumentLinks(supabase: any, taskId: string): Promise<DocLink[]> {
  try {
    const { data: docs } = await supabase
      .from('drive_documents')
      .select('title, document_url')
      .eq('task_id', taskId)
      .not('document_url', 'is', null)
      .limit(5);

    if (!docs || docs.length === 0) return [];
    return docs.map((d: any) => ({ title: d.title || '資料', url: d.document_url }));
  } catch {
    return [];
  }
}

/**
 * タスク完了通知を送信
 * @returns 通知が送られたかどうか
 */
export async function notifyTaskCompletion(
  taskId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return false;

    // タスクのソース情報を取得（v4.5: 外部同期カラムも含む）
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, source_type, source_message_id, source_channel_id, slack_message_ts, external_task_id, project_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      console.log('[TaskCompletionNotify] タスクが見つかりません:', taskId);
      return false;
    }

    const typedTask = task as TaskForNotify;
    console.log(`[TaskCompletionNotify] 通知開始: ${typedTask.title}, source_type=${typedTask.source_type}, project_id=${typedTask.project_id}, source_channel_id=${typedTask.source_channel_id}`);

    // v4.5: 外部タスク同期（Slack Block Kit カード更新 / Chatworkタスク完了）
    try {
      const { syncTaskCompletionToExternal } = await import('@/services/v45/externalTaskSync.service');
      await syncTaskCompletionToExternal(taskId, userId);
    } catch (syncErr) {
      console.error('[TaskCompletionNotify] 外部同期エラー（無視して続行）:', syncErr);
    }

    // 関連資料リンクを取得
    const docLinks = await getTaskDocumentLinks(supabase, taskId);

    // 完了通知メッセージを構築
    let message = `✅ タスク完了: ${typedTask.title}`;
    if (docLinks.length > 0) {
      message += '\n\n📎 関連資料:';
      for (const doc of docLinks) {
        message += `\n・${doc.title}: ${doc.url}`;
      }
    }

    let notified = false;

    // 経路1: source_type が slack/chatwork → 元スレッドに返信
    console.log(`[TaskCompletionNotify] 経路判定: source_type=${typedTask.source_type}`);
    if (typedTask.source_type && ['slack', 'chatwork'].includes(typedTask.source_type) && typedTask.source_channel_id) {
      if (typedTask.source_type === 'slack') {
        notified = await notifySlack(typedTask, message, userId);
      } else if (typedTask.source_type === 'chatwork') {
        notified = await notifyChatwork(typedTask, message);
      }
    }

    // 経路2: 会議録起点のタスク → 会議サマリーのSlackスレッドに返信
    if (!notified && typedTask.project_id) {
      console.log(`[TaskCompletionNotify] 経路2: 会議スレッド検索, project_id=${typedTask.project_id}`);
      notified = await notifyViaMeetingThread(supabase, typedTask, message, userId);
    }

    // 経路3: 上記いずれも失敗 → project_channels 経由でPJチャネルに投稿
    if (!notified && typedTask.project_id) {
      console.log(`[TaskCompletionNotify] 経路3: PJチャネル経由で通知試行, project_id=${typedTask.project_id}`);
      notified = await notifyViaProjectChannels(supabase, typedTask, message, userId);
    }

    console.log(`[TaskCompletionNotify] 結果: notified=${notified}`);
    return notified;
  } catch (error) {
    console.error('[TaskCompletionNotify] エラー:', error);
    return false;
  }
}

/**
 * Slackの元スレッドに完了通知
 */
async function notifySlack(
  task: TaskForNotify,
  message: string,
  userId: string
): Promise<boolean> {
  try {
    // source_message_id の形式: "slack-{channelId}-{messageTs}"
    const threadTs = extractSlackTs(task.source_message_id || '');

    const token = await getSlackToken(userId);
    if (!token) {
      console.log('[TaskCompletionNotify] Slackトークン未取得、スキップ');
      return false;
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: task.source_channel_id,
        text: message,
        thread_ts: threadTs || undefined,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[TaskCompletionNotify] Slack送信エラー:', data.error);
      return false;
    }

    console.log(`[TaskCompletionNotify] Slack通知送信: ${task.title}`);
    return true;
  } catch (error) {
    console.error('[TaskCompletionNotify] Slack通知エラー:', error);
    return false;
  }
}

/**
 * Chatworkのルームに完了通知
 */
async function notifyChatwork(
  task: TaskForNotify,
  message: string
): Promise<boolean> {
  try {
    const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
    if (!token) {
      console.log('[TaskCompletionNotify] Chatworkトークン未取得、スキップ');
      return false;
    }

    const roomId = task.source_channel_id;
    if (!roomId) return false;

    const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `body=${encodeURIComponent(message)}`,
    });

    if (!res.ok) {
      console.error('[TaskCompletionNotify] Chatwork送信エラー:', res.status);
      return false;
    }

    console.log(`[TaskCompletionNotify] Chatwork通知送信: ${task.title}`);
    return true;
  } catch (error) {
    console.error('[TaskCompletionNotify] Chatwork通知エラー:', error);
    return false;
  }
}

/**
 * 会議録サマリーのSlackスレッドに完了通知を返信
 * task_suggestions → meeting_record_id → meeting_records.metadata.slack_thread_ts
 */
async function notifyViaMeetingThread(
  supabase: any,
  task: TaskForNotify,
  message: string,
  userId: string
): Promise<boolean> {
  try {
    if (!task.project_id) return false;

    // タスクに紐づく会議録を探す（task_suggestions 経由、または直近の会議録）
    // 方法1: 直近の会議録でslack_thread_tsを持つものを探す
    const { data: records } = await supabase
      .from('meeting_records')
      .select('id, metadata')
      .eq('project_id', task.project_id)
      .not('metadata', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!records || records.length === 0) return false;

    // slack_thread_ts を持つ会議録を探す
    for (const record of records) {
      const meta = record.metadata;
      if (meta?.slack_thread_ts && meta?.slack_channel_id) {
        const token = await getSlackToken(userId);
        if (!token) continue;

        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            channel: meta.slack_channel_id,
            text: message,
            thread_ts: meta.slack_thread_ts,
          }),
        });

        const data = await res.json();
        if (data.ok) {
          console.log(`[TaskCompletionNotify] 会議スレッドに通知送信: ${task.title}`);
          return true;
        } else {
          console.warn(`[TaskCompletionNotify] 会議スレッド返信失敗: ${data.error}`);
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[TaskCompletionNotify] 会議スレッド通知エラー:', error);
    return false;
  }
}

/**
 * project_channels 経由でPJチャネルに完了通知
 * source_typeがslack/chatwork以外（会議録・手動作成等）のタスク用
 */
async function notifyViaProjectChannels(
  supabase: any,
  task: TaskForNotify,
  message: string,
  userId: string
): Promise<boolean> {
  try {
    if (!task.project_id) return false;

    // プロジェクトに紐づくチャネルを取得
    const { data: channels } = await supabase
      .from('project_channels')
      .select('service_name, channel_identifier')
      .eq('project_id', task.project_id);

    if (!channels || channels.length === 0) {
      console.log(`[TaskCompletionNotify] PJチャネル未登録: project_id=${task.project_id}`);
      return false;
    }

    console.log(`[TaskCompletionNotify] PJチャネル ${channels.length}件: ${channels.map((c: any) => `${c.service_name}:${c.channel_identifier}`).join(', ')}`);

    let sent = false;

    for (const ch of channels) {
      try {
        if (ch.service_name === 'slack' && ch.channel_identifier) {
          const token = await getSlackToken(userId);
          if (token) {
            const res = await fetch('https://slack.com/api/chat.postMessage', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                channel: ch.channel_identifier,
                text: message,
              }),
            });
            const data = await res.json();
            if (data.ok) {
              console.log(`[TaskCompletionNotify] Slack(PJチャネル)通知送信: ${task.title}`);
              sent = true;
            }
          }
        } else if (ch.service_name === 'chatwork' && ch.channel_identifier) {
          const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
          if (token) {
            const res = await fetch(`https://api.chatwork.com/v2/rooms/${ch.channel_identifier}/messages`, {
              method: 'POST',
              headers: {
                'X-ChatWorkToken': token,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: `body=${encodeURIComponent(message)}`,
            });
            if (res.ok) {
              console.log(`[TaskCompletionNotify] Chatwork(PJチャネル)通知送信: ${task.title}`);
              sent = true;
            }
          }
        }
      } catch (chErr) {
        console.warn(`[TaskCompletionNotify] チャネル通知失敗(${ch.service_name}):`, chErr);
      }
    }

    return sent;
  } catch (error) {
    console.error('[TaskCompletionNotify] PJチャネル通知エラー:', error);
    return false;
  }
}

/**
 * source_message_id からSlackのタイムスタンプを抽出
 * 形式: "slack-{channelId}-{messageTs}"
 */
function extractSlackTs(sourceMessageId: string): string | null {
  if (!sourceMessageId.startsWith('slack-')) return null;
  const parts = sourceMessageId.split('-');
  // "slack-CXXX-1234567890.123456" → 最後のパートがts
  if (parts.length >= 3) {
    return parts.slice(2).join('-'); // tsに'-'が含まれる可能性を考慮
  }
  return null;
}

/**
 * SlackのBotトークンを取得
 */
async function getSlackToken(userId: string): Promise<string | null> {
  // まずユーザーのOAuthトークンを確認
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (supabase) {
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
  } catch {
    // フォールバック
  }

  // 環境変数のBotトークン
  return process.env.SLACK_BOT_TOKEN || null;
}

/**
 * source_message_id からタスクを検索
 */
export async function findTaskBySourceMessage(
  sourceMessageId: string
): Promise<TaskForNotify | null> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return null;

    const { data } = await supabase
      .from('tasks')
      .select('id, title, source_type, source_message_id, source_channel_id')
      .eq('source_message_id', sourceMessageId)
      .limit(1)
      .single();

    return data as TaskForNotify | null;
  } catch {
    return null;
  }
}

/**
 * タスクを完了にする（Slack/Chatworkからの双方向同期用）
 */
export async function completeTaskBySourceMessage(
  sourceMessageId: string,
  userId: string
): Promise<{ success: boolean; taskTitle?: string }> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { success: false };

    // source_message_id でタスクを検索
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, status')
      .eq('source_message_id', sourceMessageId)
      .limit(1)
      .single();

    if (!task) return { success: false };

    // 既に完了済みならスキップ
    if (task.status === 'done') {
      return { success: true, taskTitle: task.title };
    }

    // ステータスを done に更新
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', task.id);

    if (error) {
      console.error('[TaskCompletionNotify] タスク完了更新エラー:', error);
      return { success: false };
    }

    // ビジネスイベント追加（タスク完了）
    try {
      const { data: fullTask } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', task.id)
        .single();

      if (fullTask?.project_id) {
        await supabase.from('business_events').insert({
          id: crypto.randomUUID(),
          project_id: fullTask.project_id,
          event_type: 'task_completed',
          content: `タスク完了: ${task.title}`,
          event_date: new Date().toISOString(),
          ai_generated: true,
        });
      }
    } catch {
      // ビジネスイベント失敗は無視
    }

    console.log(`[TaskCompletionNotify] タスク完了: ${task.title}`);
    return { success: true, taskTitle: task.title };
  } catch (error) {
    console.error('[TaskCompletionNotify] completeTaskBySourceMessage エラー:', error);
    return { success: false };
  }
}
