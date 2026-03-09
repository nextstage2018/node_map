// Phase B拡張: Google Calendar サービス
// 予定取得・作成・空き時間検索

import { createServerClient } from '@/lib/supabase';
import { BUSINESS_HOURS, isNodeMapEvent, isJapaneseHoliday } from '@/lib/constants';

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
  scope?: string;
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
// カレンダーから予定を取得（primaryカレンダーのみ）
// ========================================
// 注意: 他ユーザーのカレンダー（taniguchi, yokota等）を含めると
// 他人の「業務」ブロック（10:00-19:00）が自分のbusy判定に入ってしまうため、
// primaryカレンダーのみを使用する。
export async function getAllCalendarEvents(
  userId: string,
  timeMin: string,
  timeMax: string,
  maxResults = 100
): Promise<CalendarEvent[]> {
  const events = await getEvents(userId, timeMin, timeMax, 'primary', maxResults);
  console.log('[Calendar] primaryイベント数:', events.length);
  return events;
}

// ========================================
// 今日の予定取得（ショートカット）
// ========================================
export async function getTodayEvents(userId: string): Promise<CalendarEvent[]> {
  // JST（UTC+9）で今日の0:00〜23:59を正しく計算
  const nowJST = getJSTDateParts(new Date());
  const todayStart = createJSTDate(nowJST.year, nowJST.month, nowJST.day, 0, 0, 0);
  const todayEnd = createJSTDate(nowJST.year, nowJST.month, nowJST.day, 23, 59, 59);

  return getAllCalendarEvents(userId, todayStart.toISOString(), todayEnd.toISOString());
}

// ========================================
// 指定期間の予定取得
// ========================================
export async function getWeekEvents(userId: string, offsetDays = 0): Promise<CalendarEvent[]> {
  // JST（UTC+9）で日付を正しく計算
  const nowJST = getJSTDateParts(new Date());
  const start = createJSTDate(nowJST.year, nowJST.month, nowJST.day + offsetDays, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  return getAllCalendarEvents(userId, start.toISOString(), end.toISOString());
}

// ========================================
// 空き時間検索（拡張版: NodeMap作業ブロックも考慮）
// ========================================
export interface EnhancedFreeSlot extends FreeSlot {
  // 拡張情報（AI日程調整用）
  source?: 'google' | 'nodemap';
}

// JST（UTC+9）でDateを作成するヘルパー
// Vercel等のサーバーはUTCで動くため、JSTの時刻を正しく計算するために必要
function createJSTDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date {
  // JST = UTC + 9時間 なので、UTC時刻 = JST時刻 - 9時間
  const utcMs = Date.UTC(year, month, day, hours - 9, minutes, seconds);
  return new Date(utcMs);
}

// ISO文字列からJST日付部分を取得
function getJSTDateParts(date: Date): { year: number; month: number; day: number; dayOfWeek: number; hours: number; minutes: number } {
  // JSTオフセット = +9時間
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth(),
    day: jst.getUTCDate(),
    dayOfWeek: jst.getUTCDay(),
    hours: jst.getUTCHours(),
    minutes: jst.getUTCMinutes(),
  };
}

export async function findFreeSlots(
  userId: string,
  startDate: string,
  endDate: string,
  slotDurationMinutes = 60,
  workingHoursStart = BUSINESS_HOURS.weekdayStart,
  workingHoursEnd = BUSINESS_HOURS.weekdayEnd
): Promise<FreeSlot[]> {
  try {
    // 1. 全カレンダーから予定を取得（複数カレンダー対応）
    const events = await getAllCalendarEvents(userId, startDate, endDate);
    console.log('[Calendar] findFreeSlots: 取得イベント数:', events.length, 'イベント:', events.map(e => `${e.summary}(${e.start}〜${e.end})`).join(', '));

    // 2. NodeMap の作業ブロックを取得（カレンダー未反映分のみ）
    let nodeMapBlocks: { start: string; end: string; calendarEventId: string | null }[] = [];
    try {
      const { getNodeMapScheduledBlocks } = await import('./calendarSync.service');
      const allBlocks = await getNodeMapScheduledBlocks(userId, startDate, endDate);
      // calendar_event_id が設定済み = 既にGoogleカレンダーに反映済み → 除外（二重カウント防止）
      nodeMapBlocks = allBlocks.filter(b => !b.calendarEventId);
    } catch {
      // calendarSync.service が存在しない場合は無視
    }

    // 3. 全ての busy スロットを統合
    const busySlots: { start: number; end: number }[] = [];

    // Google Calendar イベント（[NM-Task]/[NM-Job]プレフィックス付きはスキップ＝空きとみなす）
    for (const e of events) {
      if (e.isAllDay) continue;
      // Phase A: NodeMap自身が作った予定は空きとして扱う
      if (isNodeMapEvent(e.summary)) continue;
      busySlots.push({
        start: new Date(e.start).getTime(),
        end: new Date(e.end).getTime(),
      });
    }

    // NodeMap 作業ブロック（カレンダー未反映分のみ）
    for (const b of nodeMapBlocks) {
      busySlots.push({
        start: new Date(b.start).getTime(),
        end: new Date(b.end).getTime(),
      });
    }

    // 開始時間順にソート
    busySlots.sort((a, b) => a.start - b.start);
    console.log('[Calendar] busySlots数:', busySlots.length, 'busySlots:', busySlots.map(s => `${new Date(s.start).toISOString()}〜${new Date(s.end).toISOString()}`).join(', '));

    const freeSlots: FreeSlot[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nowMs = Date.now(); // 現在時刻（過去スロットフィルタ用）

    // JSTベースで日付をループ（サーバーがUTCでも正しく計算）
    const startParts = getJSTDateParts(start);
    const endParts = getJSTDateParts(end);

    // 開始日から終了日までJSTベースで1日ずつ進む
    let currentYear = startParts.year;
    let currentMonth = startParts.month;
    let currentDay = startParts.day;

    for (let i = 0; i < 30; i++) { // 最大30日間の安全ガード
      const dayStartJST = createJSTDate(currentYear, currentMonth, currentDay, workingHoursStart, 0, 0);
      const dayEndJST = createJSTDate(currentYear, currentMonth, currentDay, workingHoursEnd, 0, 0);

      // 終了日を超えたら終了
      if (dayStartJST.getTime() >= end.getTime()) break;

      const jstParts = getJSTDateParts(dayStartJST);
      const dayOfWeek = jstParts.dayOfWeek;

      // 土日スキップ
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // 次の日へ
        const nextDay = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(nextDay);
        currentYear = np.year; currentMonth = np.month; currentDay = np.day;
        continue;
      }

      // 祝日スキップ（JSTの日付で判定）
      const jstDateForHoliday = new Date(currentYear, currentMonth, currentDay);
      if (isJapaneseHoliday(jstDateForHoliday)) {
        const nextDay = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(nextDay);
        currentYear = np.year; currentMonth = np.month; currentDay = np.day;
        continue;
      }

      const dayStartMs = dayStartJST.getTime();
      const dayEndMs = dayEndJST.getTime();

      // 今日の営業時間が既に終了している場合はスキップ
      if (dayEndMs <= nowMs) {
        const nextDay = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(nextDay);
        currentYear = np.year; currentMonth = np.month; currentDay = np.day;
        continue;
      }

      // その日のbusy スロットを抽出
      const dayBusy = busySlots
        .filter(s => s.start < dayEndMs && s.end > dayStartMs)
        .map(s => ({
          start: Math.max(s.start, dayStartMs),
          end: Math.min(s.end, dayEndMs),
        }));

      // 空き時間を計算（今日の場合は現在時刻以降のみ）
      let cursor = Math.max(dayStartMs, nowMs);

      for (const busy of dayBusy) {
        if (busy.start > cursor) {
          const gapMinutes = (busy.start - cursor) / 60000;
          if (gapMinutes >= slotDurationMinutes) {
            freeSlots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(busy.start).toISOString(),
              durationMinutes: gapMinutes,
            });
          }
        }
        cursor = Math.max(cursor, busy.end);
      }

      if (cursor < dayEndMs) {
        const gapMinutes = (dayEndMs - cursor) / 60000;
        if (gapMinutes >= slotDurationMinutes) {
          freeSlots.push({
            start: new Date(cursor).toISOString(),
            end: dayEndJST.toISOString(),
            durationMinutes: gapMinutes,
          });
        }
      }

      // 次の日へ
      const nextDay = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
      const np = getJSTDateParts(nextDay);
      currentYear = np.year; currentMonth = np.month; currentDay = np.day;
    }

    console.log('[Calendar] 空きスロット計算結果:', freeSlots.length, '件');
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
  if (!token) return false;

  // 1. scopeフィールドで判定（高速）
  const scope = token.scope || '';
  if (scope.includes('calendar')) {
    return true;
  }

  // 2. scopeが未保存（古いトークン）の場合、実際にAPI呼び出しで確認
  console.log('[Calendar] scopeフィールドが空のため、API呼び出しで接続確認。scope:', scope);
  try {
    const res = await calendarFetch(userId, '/calendars/primary?fields=id');
    if (res && res.ok) {
      console.log('[Calendar] API呼び出し成功 → カレンダー接続確認済み');

      // v3.2改善: 成功時にscopeをDBに保存（次回からAPI呼び出し不要）
      try {
        const sb = createServerClient();
        if (sb && token.scope !== undefined) {
          const updatedScope = token.scope
            ? `${token.scope} https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events`
            : 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
          await sb
            .from('user_service_tokens')
            .update({
              token_data: { ...token, scope: updatedScope },
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('service_name', 'gmail');
          console.log('[Calendar] scopeをDBに保存しました');
        }
      } catch (saveErr) {
        console.warn('[Calendar] scope保存エラー（処理続行）:', saveErr);
      }

      return true;
    }
    console.log('[Calendar] API呼び出し失敗（status:', res?.status, '）→ カレンダー未接続');
    return false;
  } catch (err) {
    console.error('[Calendar] API接続確認エラー:', err);
    return false;
  }
}

// ========================================
// 予定のテキスト要約（AIコンテキスト用）— JST表示
// ========================================
export function formatEventsForContext(events: CalendarEvent[]): string {
  if (events.length === 0) return '予定なし';

  return events.map(e => {
    const startJST = getJSTDateParts(new Date(e.start));
    const endJST = getJSTDateParts(new Date(e.end));

    if (e.isAllDay) {
      return `- [終日] ${e.summary}`;
    }

    const timeStr = `${startJST.hours.toString().padStart(2, '0')}:${startJST.minutes.toString().padStart(2, '0')}〜${endJST.hours.toString().padStart(2, '0')}:${endJST.minutes.toString().padStart(2, '0')}`;
    const attendeeStr = e.attendees && e.attendees.length > 0
      ? `（${e.attendees.map(a => a.displayName || a.email).join(', ')}）`
      : '';
    return `- ${timeStr} ${e.summary}${attendeeStr}`;
  }).join('\n');
}

// ========================================
// 空き時間のテキスト要約（Phase C: 全候補出力・日付グルーピング）— JST表示
// ========================================
export function formatFreeSlotsForContext(slots: FreeSlot[], maxSlots = 50): string {
  if (slots.length === 0) return '空き時間なし';

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const target = slots.slice(0, maxSlots);

  // 日付でグルーピング（JSTベース）
  const grouped = new Map<string, { dateStr: string; times: string[] }>();
  for (const s of target) {
    const startJST = getJSTDateParts(new Date(s.start));
    const endJST = getJSTDateParts(new Date(s.end));
    const dateKey = `${startJST.year}-${startJST.month}-${startJST.day}`;
    const dateStr = `${startJST.month + 1}/${startJST.day}（${dayNames[startJST.dayOfWeek]}）`;
    const timeStr = `${startJST.hours.toString().padStart(2, '0')}:${startJST.minutes.toString().padStart(2, '0')}〜${endJST.hours.toString().padStart(2, '0')}:${endJST.minutes.toString().padStart(2, '0')}`;

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { dateStr, times: [] });
    }
    grouped.get(dateKey)!.times.push(timeStr);
  }

  // 日付ごとに全空き時間を出力
  const lines: string[] = [];
  for (const [, group] of grouped) {
    lines.push(`- ${group.dateStr} ${group.times.join('、')}`);
  }
  return lines.join('\n');
}
