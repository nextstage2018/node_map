/**
 * v4.0 Phase 6: タスク完了時のSlack/Chatwork通知サービス
 *
 * タスクが完了（status='done'）になった時、元のSlack/Chatworkスレッドに
 * 完了通知を自動投稿する。
 *
 * 前提: tasks テーブルに source_type / source_message_id / source_channel_id がある
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

interface TaskForNotify {
  id: string;
  title: string;
  source_type: string | null;
  source_message_id: string | null;
  source_channel_id: string | null;
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

    // タスクのソース情報を取得
    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, source_type, source_message_id, source_channel_id')
      .eq('id', taskId)
      .single();

    if (!task) return false;

    const typedTask = task as TaskForNotify;

    // source_type がない、またはmanual/secretary/meeting_recordの場合はスキップ
    if (!typedTask.source_type || !['slack', 'chatwork'].includes(typedTask.source_type)) {
      return false;
    }

    if (!typedTask.source_channel_id) return false;

    const message = `✅ タスク完了: ${typedTask.title}`;

    if (typedTask.source_type === 'slack') {
      return await notifySlack(typedTask, message, userId);
    } else if (typedTask.source_type === 'chatwork') {
      return await notifyChatwork(typedTask, message);
    }

    return false;
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
