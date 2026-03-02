// Phase B拡張: Google Calendar サービス
// 予定取得・作成・空き時間検索

import { createServerClient } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ========================================
// 型定義
// ========================================
export interface CalendarEvent {
  id: string;
  summary: string;          // タイトル
  description?: string;
  start: string;            // ISO 8601
  end: string;              // ISO 8601
  location?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  htmlLink?: string;
  status?: string;          // confirmed / tentative / cancelled
  isAllDay?: boolean;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: string;            // ISO 8601
  end: string;              // ISO 8601
  location?: string;
  attendees?: string[];     // メールアドレス配列
  timeZone?: string;
}

// ========================================
// トークン管理
// ========================================
interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry: string | null;
  email?: string;
}

async function getGoogleToken(userId: string): Promise<TokenData | null> {
  const sb = createServerClient();
  if (!sb) return null;

  const { data } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .single();

  if (!data?.token_data) return null;
  return data.token_data as TokenData;
}

async function refreshTokenIfNeeded(userId: string, token: TokenData): Promise<string> {
  // トークンの有効期限チェック
  if (token.expiry) {
    const expiry = new Date(token.expiry);
    const now = new Date();
    // 5分の余裕を持って更新
    if (expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
      return token.access_token;
    }
  }

  // リフレッシュトークンで更新
  if (!token.refresh_token || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return token.access_token; // リフレッシュ不可、既存トークンを返す
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('[Calendar] トークンリフレッシュ失敗');
      return token.access_token;
    }

    const newToken = await res.json();

    // DB更新
    const sb = createServerClient();
    if (sb) {
      await sb
        .from('user_service_tokens')
        .update({
          token_data: {
            ...token,
            access_token: newToken.access_token,
            expiry: newToken.expires_in
              ? new Date(Date.now() + newToken.expires_in * 1000).toISOString()
              : token.expiry,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('service_name', 'gmail');
    }

    return newToken.access_token;
  } catch (error) {
    console.error('[Calendar] トークンリフレッシュエラー:', error);
    return token.access_token;
  }
}

// ========================================
// API呼び出しヘルパー
// ========================================
async function calendarFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const token = await getGoogleToken(userId);
  if (!token) {
    console.warn('[Calendar] Google トークン未設定（userId:', userId, '）');
    return null;
  }

  const accessToken = await refreshTokenIfNeeded(userId, token);

  return fetch(`${CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// ========================================
// 予定取得
// ========================================
export async function getEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  calendarId = 'primary',
  maxResults = 50
): Promise<CalendarEvent[]> {
  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Asia/Tokyo',
    });

    const res = await calendarFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    if (!res || !res.ok) {
      console.error('[Calendar] 予定取得失敗:', res?.status);
      return [];
    }

    const data = await res.json();
    const events: CalendarEvent[] = (data.items || []).map((item: Record<string, unknown>) => {
      const startObj = item.start as Record<string, string> | undefined;
      const endObj = item.end as Record<string, string> | undefined;
      const isAllDay = !!startObj?.date;

      return {
        id: item.id as string,
        summary: (item.summary as string) || '（タイトルなし）',
        description: item.description as string | undefined,
        start: startObj?.dateTime || startObj?.date || '',
        end: endObj?.dateTime || endObj?.date || '',
        location: item.location as string | undefined,
        attendees: (item.attendees as { email: string; displayName?: string; responseStatus?: string }[]) || [],
        htmlLink: item.htmlLink as string | undefined,
        status: item.status as string | undefined,
        isAllDay,
      };
    });

    return events;
  } catch (error) {
    console.error('[Calendar] 予定取得エラー:', error);
    return [];
  }
}

// ========================================
// 今日の予定取得（ショートカット）
// ========================================
export async function getTodayEvents(userId: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  return getEvents(userId, todayStart.toISOString(), todayEnd.toISOString());
}

// ========================================
// 指定期間の予定取得
// ========================================
export async function getWeekEvents(userId: string, offsetDays = 0): Promise<CalendarEvent[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  return getEvents(userId, start.toISOString(), end.toISOString());
}

// ========================================
// 空き時間検索
// ========================================
export async function findFreeSlots(
  userId: string,
  startDate: string,
  endDate: string,
  slotDurationMinutes = 60,
  workingHoursStart = 9,
  workingHoursEnd = 18
): Promise<FreeSlot[]> {
  try {
    const events = await getEvents(userId, startDate, endDate);
    const freeSlots: FreeSlot[] = [];

    // 日ごとに空き時間を計算
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      // 土日はスキップ
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), workingHoursStart, 0, 0);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), workingHoursEnd, 0, 0);

      // その日のイベントを取得
      const dayEvents = events
        .filter(e => {
          if (e.isAllDay) return false; // 終日イベントは空き判定から除外
          const eStart = new Date(e.start);
          const eEnd = new Date(e.end);
          return eStart < dayEnd && eEnd > dayStart;
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      // 空き時間を計算
      let cursor = dayStart.getTime();

      for (const evt of dayEvents) {
        const evtStart = Math.max(new Date(evt.start).getTime(), dayStart.getTime());
        const evtEnd = Math.min(new Date(evt.end).getTime(), dayEnd.getTime());

        if (evtStart > cursor) {
          const gapMinutes = (evtStart - cursor) / 60000;
          if (gapMinutes >= slotDurationMinutes) {
            freeSlots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(evtStart).toISOString(),
              durationMinutes: gapMinutes,
            });
          }
        }
        cursor = Math.max(cursor, evtEnd);
      }

      // 最後のイベント後の空き
      if (cursor < dayEnd.getTime()) {
        const gapMinutes = (dayEnd.getTime() - cursor) / 60000;
        if (gapMinutes >= slotDurationMinutes) {
          freeSlots.push({
            start: new Date(cursor).toISOString(),
            end: dayEnd.toISOString(),
            durationMinutes: gapMinutes,
          });
        }
      }
    }

    return freeSlots;
  } catch (error) {
    console.error('[Calendar] 空き時間検索エラー:', error);
    return [];
  }
}

// ========================================
// 予定作成
// ========================================
export async function createEvent(
  userId: string,
  params: CreateEventParams,
  calendarId = 'primary'
): Promise<CalendarEvent | null> {
  try {
    const timeZone = params.timeZone || 'Asia/Tokyo';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBody: Record<string, any> = {
      summary: params.summary,
      start: { dateTime: params.start, timeZone },
      end: { dateTime: params.end, timeZone },
    };

    if (params.description) eventBody.description = params.description;
    if (params.location) eventBody.location = params.location;
    if (params.attendees && params.attendees.length > 0) {
      eventBody.attendees = params.attendees.map(email => ({ email }));
      eventBody.conferenceData = undefined; // 必要に応じてGoogle Meetリンク生成
    }

    const res = await calendarFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(eventBody),
    });

    if (!res || !res.ok) {
      console.error('[Calendar] 予定作成失敗:', res?.status);
      return null;
    }

    const data = await res.json();
    const startObj = data.start as Record<string, string> | undefined;
    const endObj = data.end as Record<string, string> | undefined;

    return {
      id: data.id,
      summary: data.summary || params.summary,
      description: data.description,
      start: startObj?.dateTime || startObj?.date || params.start,
      end: endObj?.dateTime || endObj?.date || params.end,
      location: data.location,
      attendees: data.attendees || [],
      htmlLink: data.htmlLink,
      status: data.status,
    };
  } catch (error) {
    console.error('[Calendar] 予定作成エラー:', error);
    return null;
  }
}

// ========================================
// カレンダー接続チェック
// ========================================
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const token = await getGoogleToken(userId);
  return !!token;
}

// ========================================
// 予定のテキスト要約（AIコンテキスト用）
// ========================================
export function formatEventsForContext(events: CalendarEvent[]): string {
  if (events.length === 0) return '予定なし';

  return events.map(e => {
    const start = new Date(e.start);
    const end = new Date(e.end);

    if (e.isAllDay) {
      return `- [終日] ${e.summary}`;
    }

    const timeStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}〜${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    const attendeeStr = e.attendees && e.attendees.length > 0
      ? `（${e.attendees.map(a => a.displayName || a.email).join(', ')}）`
      : '';
    return `- ${timeStr} ${e.summary}${attendeeStr}`;
  }).join('\n');
}

// ========================================
// 空き時間のテキスト要約
// ========================================
export function formatFreeSlotsForContext(slots: FreeSlot[], maxSlots = 5): string {
  if (slots.length === 0) return '空き時間なし';

  return slots.slice(0, maxSlots).map(s => {
    const start = new Date(s.start);
    const end = new Date(s.end);
    const dateStr = `${start.getMonth() + 1}/${start.getDate()}（${['日', '月', '火', '水', '木', '金', '土'][start.getDay()]}）`;
    const timeStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}〜${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    return `- ${dateStr} ${timeStr}（${s.durationMinutes}分）`;
  }).join('\n');
}
