// Calendar × タスク/ジョブ 同期サービス
// タスク/ジョブの作成・更新・完了時にGoogleカレンダーと自動同期

import { createServerClient } from '@/lib/supabase';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import {
  createEvent,
  isCalendarConnected,
  CalendarEvent,
  CreateEventParams,
} from './calendarClient.service';

// ========================================
// 型定義
// ========================================
export interface CalendarSyncResult {
  success: boolean;
  calendarEventId?: string;
  htmlLink?: string;
  error?: string;
}

interface SyncToCalendarParams {
  userId: string;
  title: string;
  description?: string;
  scheduledStart: string;  // ISO 8601
  scheduledEnd: string;    // ISO 8601
  sourceType: 'task' | 'job';
  sourceId: string;
  attendees?: string[];    // メールアドレス配列
}

// ========================================
// Google Calendar extendedProperties で
// NodeMap 由来の予定を識別する
// ========================================
const NODEMAP_EXTENDED_PROP_KEY = 'nodeMapType';
const NODEMAP_ID_PROP_KEY = 'nodeMapId';

// ========================================
// タスク → カレンダー同期
// ========================================
export async function syncTaskToCalendar(
  taskId: string,
  userId: string
): Promise<CalendarSyncResult> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return { success: false, error: 'DB接続なし' };

  // タスク情報取得
  const { data: task, error } = await sb
    .from('tasks')
    .select('title, description, scheduled_start, scheduled_end, calendar_event_id')
    .eq('id', taskId)
    .single();

  if (error || !task) return { success: false, error: 'タスクが見つかりません' };
  if (!task.scheduled_start || !task.scheduled_end) {
    return { success: false, error: 'スケジュール時刻が未設定です' };
  }

  // 既にカレンダー登録済みなら更新
  if (task.calendar_event_id) {
    return updateCalendarEvent(task.calendar_event_id, userId, {
      summary: `[NodeMap] ${task.title}`,
      description: task.description || undefined,
      start: task.scheduled_start,
      end: task.scheduled_end,
      sourceType: 'task',
      sourceId: taskId,
    });
  }

  // 新規作成
  return createCalendarEventForSource({
    userId,
    title: task.title,
    description: task.description || undefined,
    scheduledStart: task.scheduled_start,
    scheduledEnd: task.scheduled_end,
    sourceType: 'task',
    sourceId: taskId,
  });
}

// ========================================
// ジョブ → カレンダー同期
// ========================================
export async function syncJobToCalendar(
  jobId: string,
  userId: string
): Promise<CalendarSyncResult> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return { success: false, error: 'DB接続なし' };

  const { data: job, error } = await sb
    .from('jobs')
    .select('title, description, scheduled_start, scheduled_end, calendar_event_id')
    .eq('id', jobId)
    .single();

  if (error || !job) return { success: false, error: 'ジョブが見つかりません' };
  if (!job.scheduled_start || !job.scheduled_end) {
    return { success: false, error: 'スケジュール時刻が未設定です' };
  }

  if (job.calendar_event_id) {
    return updateCalendarEvent(job.calendar_event_id, userId, {
      summary: `[NodeMap] ${job.title}`,
      description: job.description || undefined,
      start: job.scheduled_start,
      end: job.scheduled_end,
      sourceType: 'job',
      sourceId: jobId,
    });
  }

  return createCalendarEventForSource({
    userId,
    title: job.title,
    description: job.description || undefined,
    scheduledStart: job.scheduled_start,
    scheduledEnd: job.scheduled_end,
    sourceType: 'job',
    sourceId: jobId,
  });
}

// ========================================
// カレンダー予定の新規作成（共通）
// ========================================
async function createCalendarEventForSource(
  params: SyncToCalendarParams
): Promise<CalendarSyncResult> {
  const connected = await isCalendarConnected(params.userId);
  if (!connected) {
    return { success: false, error: 'Googleカレンダー未連携' };
  }

  try {
    const event = await createEventWithExtendedProps(params.userId, {
      summary: `[NodeMap] ${params.title}`,
      description: params.description,
      start: params.scheduledStart,
      end: params.scheduledEnd,
      attendees: params.attendees,
    }, params.sourceType, params.sourceId);

    if (!event) {
      return { success: false, error: 'カレンダー予定作成に失敗' };
    }

    // calendar_event_id をDB保存
    const sb = getServerSupabase() || getSupabase();
    if (sb) {
      const table = params.sourceType === 'task' ? 'tasks' : 'jobs';
      await sb
        .from(table)
        .update({ calendar_event_id: event.id })
        .eq('id', params.sourceId);
    }

    return {
      success: true,
      calendarEventId: event.id,
      htmlLink: event.htmlLink,
    };
  } catch (err) {
    console.error('[CalendarSync] 予定作成エラー:', err);
    return { success: false, error: err instanceof Error ? err.message : '不明なエラー' };
  }
}

// ========================================
// extendedProperties 付きで予定を作成
// ========================================
async function createEventWithExtendedProps(
  userId: string,
  eventParams: CreateEventParams,
  sourceType: 'task' | 'job',
  sourceId: string
): Promise<CalendarEvent | null> {
  // calendarClient の calendarFetch を直接使いたいが、
  // createEvent はラッパーなので、description にメタデータを埋め込む方式と
  // Google Calendar API の extendedProperties を併用する

  const sb = createServerClient();
  if (!sb) return null;

  // トークン取得（calendarClient の内部関数を再利用できないため簡易実装）
  const { data: tokenRow } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .single();

  if (!tokenRow?.token_data) return null;
  const tokenData = tokenRow.token_data as { access_token: string; refresh_token?: string; expiry?: string };
  const accessToken = tokenData.access_token;

  const timeZone = eventParams.timeZone || 'Asia/Tokyo';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventBody: Record<string, any> = {
    summary: eventParams.summary,
    start: { dateTime: eventParams.start, timeZone },
    end: { dateTime: eventParams.end, timeZone },
    // extendedProperties で NodeMap メタデータを埋め込む
    extendedProperties: {
      private: {
        [NODEMAP_EXTENDED_PROP_KEY]: sourceType,
        [NODEMAP_ID_PROP_KEY]: sourceId,
      },
    },
  };

  if (eventParams.description) eventBody.description = eventParams.description;
  if (eventParams.location) eventBody.location = eventParams.location;
  if (eventParams.attendees && eventParams.attendees.length > 0) {
    eventBody.attendees = eventParams.attendees.map((email: string) => ({ email }));
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!res.ok) {
      console.error('[CalendarSync] Google Calendar API エラー:', res.status);
      return null;
    }

    const data = await res.json();
    const startObj = data.start as Record<string, string> | undefined;
    const endObj = data.end as Record<string, string> | undefined;

    return {
      id: data.id,
      summary: data.summary || eventParams.summary,
      description: data.description,
      start: startObj?.dateTime || startObj?.date || eventParams.start,
      end: endObj?.dateTime || endObj?.date || eventParams.end,
      location: data.location,
      attendees: data.attendees || [],
      htmlLink: data.htmlLink,
      status: data.status,
    };
  } catch (err) {
    console.error('[CalendarSync] 予定作成fetch失敗:', err);
    return null;
  }
}

// ========================================
// カレンダー予定の更新
// ========================================
export async function updateCalendarEvent(
  calendarEventId: string,
  userId: string,
  params: {
    summary?: string;
    description?: string;
    start?: string;
    end?: string;
    sourceType?: 'task' | 'job';
    sourceId?: string;
  }
): Promise<CalendarSyncResult> {
  const sb = createServerClient();
  if (!sb) return { success: false, error: 'DB接続なし' };

  const { data: tokenRow } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .single();

  if (!tokenRow?.token_data) {
    return { success: false, error: 'Googleトークンなし' };
  }
  const tokenData = tokenRow.token_data as { access_token: string };
  const timeZone = 'Asia/Tokyo';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patchBody: Record<string, any> = {};
  if (params.summary) patchBody.summary = params.summary;
  if (params.description !== undefined) patchBody.description = params.description;
  if (params.start) patchBody.start = { dateTime: params.start, timeZone };
  if (params.end) patchBody.end = { dateTime: params.end, timeZone };
  if (params.sourceType && params.sourceId) {
    patchBody.extendedProperties = {
      private: {
        [NODEMAP_EXTENDED_PROP_KEY]: params.sourceType,
        [NODEMAP_ID_PROP_KEY]: params.sourceId,
      },
    };
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(calendarEventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!res.ok) {
      console.error('[CalendarSync] 予定更新失敗:', res.status);
      return { success: false, error: `Google API ${res.status}` };
    }

    return { success: true, calendarEventId };
  } catch (err) {
    console.error('[CalendarSync] 予定更新エラー:', err);
    return { success: false, error: err instanceof Error ? err.message : '不明' };
  }
}

// ========================================
// カレンダー予定の削除
// ========================================
export async function deleteCalendarEvent(
  calendarEventId: string,
  userId: string
): Promise<CalendarSyncResult> {
  const sb = createServerClient();
  if (!sb) return { success: false, error: 'DB接続なし' };

  const { data: tokenRow } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .single();

  if (!tokenRow?.token_data) {
    return { success: false, error: 'Googleトークンなし' };
  }
  const tokenData = tokenRow.token_data as { access_token: string };

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(calendarEventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    // 204 = 成功、404 = 既に削除済み（どちらもOK）
    if (res.status === 204 || res.status === 404) {
      return { success: true, calendarEventId };
    }

    console.error('[CalendarSync] 予定削除失敗:', res.status);
    return { success: false, error: `Google API ${res.status}` };
  } catch (err) {
    console.error('[CalendarSync] 予定削除エラー:', err);
    return { success: false, error: err instanceof Error ? err.message : '不明' };
  }
}

// ========================================
// グループタスク: 全メンバーのカレンダーに同期
// ========================================
export async function syncGroupTaskToMembers(
  taskId: string
): Promise<{ synced: number; failed: number }> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return { synced: 0, failed: 0 };

  // タスク情報取得
  const { data: task } = await sb
    .from('tasks')
    .select('title, description, scheduled_start, scheduled_end')
    .eq('id', taskId)
    .single();

  if (!task || !task.scheduled_start || !task.scheduled_end) {
    return { synced: 0, failed: 0 };
  }

  // メンバー一覧取得
  const { data: members } = await sb
    .from('task_members')
    .select('id, user_id, calendar_event_id')
    .eq('task_id', taskId);

  if (!members || members.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const member of members) {
    // カレンダー連携済みか確認
    const connected = await isCalendarConnected(member.user_id);
    if (!connected) {
      failed++;
      continue;
    }

    try {
      if (member.calendar_event_id) {
        // 既存予定を更新
        const result = await updateCalendarEvent(member.calendar_event_id, member.user_id, {
          summary: `[NodeMap] ${task.title}`,
          description: task.description || undefined,
          start: task.scheduled_start,
          end: task.scheduled_end,
          sourceType: 'task',
          sourceId: taskId,
        });
        if (result.success) synced++;
        else failed++;
      } else {
        // 新規作成
        const result = await createCalendarEventForSource({
          userId: member.user_id,
          title: task.title,
          description: task.description || undefined,
          scheduledStart: task.scheduled_start,
          scheduledEnd: task.scheduled_end,
          sourceType: 'task',
          sourceId: taskId,
        });
        if (result.success && result.calendarEventId) {
          // メンバーの calendar_event_id を保存
          await sb
            .from('task_members')
            .update({ calendar_event_id: result.calendarEventId })
            .eq('id', member.id);
          synced++;
        } else {
          failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// ========================================
// NodeMap由来の予定か判定（extendedProperties）
// ========================================
export function isNodeMapEvent(event: CalendarEvent & { extendedProperties?: { private?: Record<string, string> } }): {
  isNodeMap: boolean;
  sourceType?: 'task' | 'job';
  sourceId?: string;
} {
  const props = event.extendedProperties?.private;
  if (!props || !props[NODEMAP_EXTENDED_PROP_KEY]) {
    return { isNodeMap: false };
  }
  return {
    isNodeMap: true,
    sourceType: props[NODEMAP_EXTENDED_PROP_KEY] as 'task' | 'job',
    sourceId: props[NODEMAP_ID_PROP_KEY],
  };
}

// ========================================
// NodeMapの作業ブロック（Googleカレンダー未反映分）を取得
// findFreeSlots 拡張用
// ========================================
export async function getNodeMapScheduledBlocks(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ start: string; end: string; source: 'task' | 'job'; sourceId: string; calendarEventId: string | null }[]> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return [];

  const blocks: { start: string; end: string; source: 'task' | 'job'; sourceId: string; calendarEventId: string | null }[] = [];

  // タスクの作業ブロック
  const { data: tasks } = await sb
    .from('tasks')
    .select('id, scheduled_start, scheduled_end, calendar_event_id')
    .eq('user_id', userId)
    .not('scheduled_start', 'is', null)
    .not('scheduled_end', 'is', null)
    .neq('status', 'done')
    .gte('scheduled_end', startDate)
    .lte('scheduled_start', endDate);

  if (tasks) {
    for (const t of tasks) {
      blocks.push({
        start: t.scheduled_start,
        end: t.scheduled_end,
        source: 'task',
        sourceId: t.id,
        calendarEventId: t.calendar_event_id,
      });
    }
  }

  // ジョブの作業ブロック
  const { data: jobs } = await sb
    .from('jobs')
    .select('id, scheduled_start, scheduled_end, calendar_event_id')
    .eq('user_id', userId)
    .not('scheduled_start', 'is', null)
    .not('scheduled_end', 'is', null)
    .not('status', 'in', '("done","failed")')
    .gte('scheduled_end', startDate)
    .lte('scheduled_start', endDate);

  if (jobs) {
    for (const j of jobs) {
      blocks.push({
        start: j.scheduled_start,
        end: j.scheduled_end,
        source: 'job',
        sourceId: j.id,
        calendarEventId: j.calendar_event_id,
      });
    }
  }

  return blocks;
}
