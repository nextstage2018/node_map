// カレンダー接続デバッグ用エンドポイント v2
// GET /api/calendar/debug でブラウザから直接確認可能

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import { BUSINESS_HOURS, isJapaneseHoliday } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export async function GET() {
  const steps: { step: string; result: string; detail?: unknown }[] = [];

  try {
    // Step 1: ユーザー認証
    const userId = await getServerUserId();
    steps.push({ step: '1. ユーザー認証', result: userId ? `OK (${userId.substring(0, 8)}...)` : 'FAIL: 未認証' });
    if (!userId) {
      return NextResponse.json({ success: false, steps }, { status: 401 });
    }

    // Step 2: トークン取得
    const sb = createServerClient();
    if (!sb) {
      steps.push({ step: '2. Supabaseクライアント', result: 'FAIL: createServerClient() returned null' });
      return NextResponse.json({ success: false, steps });
    }

    const { data: tokenRow, error: tokenErr } = await sb
      .from('user_service_tokens')
      .select('token_data, is_active, connected_at, updated_at')
      .eq('user_id', userId)
      .eq('service_name', 'gmail')
      .eq('is_active', true)
      .single();

    if (tokenErr || !tokenRow?.token_data) {
      steps.push({ step: '2. トークン取得', result: `FAIL: ${tokenErr?.message || 'token_data null'}` });
      return NextResponse.json({ success: false, steps });
    }

    const tokenData = tokenRow.token_data as Record<string, unknown>;
    const scope = (tokenData.scope as string) || '';
    steps.push({
      step: '2. トークン取得',
      result: 'OK',
      detail: {
        scope_includes_calendar: scope.includes('calendar'),
        expiry: tokenData.expiry,
        email: tokenData.email,
      },
    });

    // Step 3: アクセストークン準備（リフレッシュ含む）
    let accessToken = tokenData.access_token as string;
    const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
    const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';

    // まず現在のトークンでテスト
    const testRes = await fetch(`${CALENDAR_API_BASE}/calendars/primary?fields=id,summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!testRes.ok) {
      // リフレッシュ試行
      if (tokenData.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokenData.refresh_token as string,
            grant_type: 'refresh_token',
          }),
        });
        if (refreshRes.ok) {
          const newToken = await refreshRes.json();
          accessToken = newToken.access_token;
          steps.push({ step: '3. トークンリフレッシュ', result: 'OK (リフレッシュ成功)' });
        } else {
          steps.push({ step: '3. トークンリフレッシュ', result: `FAIL: HTTP ${refreshRes.status}` });
          return NextResponse.json({ success: false, steps });
        }
      } else {
        steps.push({ step: '3. トークン', result: `FAIL: HTTP ${testRes.status}, リフレッシュ不可` });
        return NextResponse.json({ success: false, steps });
      }
    } else {
      steps.push({ step: '3. Calendar API接続', result: 'OK' });
    }

    // Step 4: 実際のイベント取得テスト（明日から7日間）
    const nowUtc = new Date();
    const jstMs = nowUtc.getTime() + 9 * 60 * 60 * 1000;
    const jstNow = new Date(jstMs);
    const jstYear = jstNow.getUTCFullYear();
    const jstMonth = jstNow.getUTCMonth();
    const jstDay = jstNow.getUTCDate();

    // 明日の00:00 JST = UTC で -9h
    const tomorrowStartUTC = new Date(Date.UTC(jstYear, jstMonth, jstDay + 1) - 9 * 60 * 60 * 1000);
    const weekEndUTC = new Date(tomorrowStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000);

    steps.push({
      step: '4. 検索日付範囲',
      result: `JST: ${jstMonth + 1}/${jstDay + 1} 〜 7日間`,
      detail: {
        now_utc: nowUtc.toISOString(),
        jst_date: `${jstYear}-${jstMonth + 1}-${jstDay}`,
        search_start: tomorrowStartUTC.toISOString(),
        search_end: weekEndUTC.toISOString(),
        business_hours: `${BUSINESS_HOURS.weekdayStart}:00 〜 ${BUSINESS_HOURS.weekdayEnd}:00`,
      },
    });

    // Step 5: Google Calendar APIで直接イベント取得
    const eventsParams = new URLSearchParams({
      timeMin: tomorrowStartUTC.toISOString(),
      timeMax: weekEndUTC.toISOString(),
      maxResults: '100',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Asia/Tokyo',
    });

    const eventsRes = await fetch(
      `${CALENDAR_API_BASE}/calendars/primary/events?${eventsParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!eventsRes.ok) {
      const errText = await eventsRes.text();
      steps.push({
        step: '5. イベント取得',
        result: `FAIL: HTTP ${eventsRes.status}`,
        detail: { error: errText.substring(0, 500) },
      });
      return NextResponse.json({ success: false, steps });
    }

    const eventsData = await eventsRes.json();
    const rawEvents = (eventsData.items || []) as Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
    }>;

    steps.push({
      step: '5. イベント取得 (primary)',
      result: `OK (${rawEvents.length}件)`,
      detail: rawEvents.map(e => ({
        summary: e.summary || '(no title)',
        start: e.start?.dateTime || e.start?.date || '?',
        end: e.end?.dateTime || e.end?.date || '?',
        isAllDay: !!e.start?.date,
        status: e.status,
      })),
    });

    // Step 6: calendarList で追加カレンダーも確認
    const listRes = await fetch(
      `${CALENDAR_API_BASE}/users/me/calendarList?minAccessRole=reader`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const calendars = (listData.items || []) as Array<{ id: string; summary: string; selected?: boolean }>;
      steps.push({
        step: '6. カレンダーリスト',
        result: `OK (${calendars.length}件)`,
        detail: calendars.map(c => ({
          id: c.id,
          summary: c.summary,
          selected: c.selected,
          isPrimary: c.id === 'primary' || c.id === (tokenData.email as string),
          isHoliday: c.id.includes('#holiday'),
        })),
      });
    } else {
      steps.push({ step: '6. カレンダーリスト', result: `FAIL: HTTP ${listRes.status}` });
    }

    // Step 7: findFreeSlots内部ロジックをステップバイステップでシミュレーション
    const dayDetails: unknown[] = [];
    const workStart = BUSINESS_HOURS.weekdayStart; // 10
    const workEnd = BUSINESS_HOURS.weekdayEnd;     // 19
    const nowMs2 = Date.now();

    // 非全日 & 非NodeMapイベントのbusyスロット
    const busySlots: { start: number; end: number; summary: string }[] = [];
    for (const e of rawEvents) {
      if (e.start?.date) continue; // 全日イベントスキップ
      const summary = e.summary || '';
      if (summary.startsWith('[NM-Task]') || summary.startsWith('[NM-Job]')) continue;
      if (e.start?.dateTime && e.end?.dateTime) {
        busySlots.push({
          start: new Date(e.start.dateTime).getTime(),
          end: new Date(e.end.dateTime).getTime(),
          summary,
        });
      }
    }
    busySlots.sort((a, b) => a.start - b.start);

    steps.push({
      step: '7. Busyスロット',
      result: `${busySlots.length}件`,
      detail: busySlots.map(s => ({
        summary: s.summary,
        start: new Date(s.start).toISOString(),
        end: new Date(s.end).toISOString(),
      })),
    });

    // 日別ループ
    const startParts = getJSTDateParts(tomorrowStartUTC);
    let curY = startParts.year;
    let curM = startParts.month;
    let curD = startParts.day;
    let totalFreeSlots = 0;

    for (let i = 0; i < 10; i++) {
      const dayStartJST = createJSTDate(curY, curM, curD, workStart, 0, 0);
      const dayEndJST = createJSTDate(curY, curM, curD, workEnd, 0, 0);

      if (dayStartJST.getTime() >= weekEndUTC.getTime()) break;

      const jstP = getJSTDateParts(dayStartJST);
      const dow = jstP.dayOfWeek;
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dateLabel = `${curM + 1}/${curD}(${dayNames[dow]})`;

      // 週末チェック
      if (dow === 0 || dow === 6) {
        dayDetails.push({ date: dateLabel, status: 'スキップ（週末）' });
        const next = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(next);
        curY = np.year; curM = np.month; curD = np.day;
        continue;
      }

      // 祝日チェック
      const holidayDate = new Date(curY, curM, curD);
      if (isJapaneseHoliday(holidayDate)) {
        dayDetails.push({ date: dateLabel, status: 'スキップ（祝日）' });
        const next = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(next);
        curY = np.year; curM = np.month; curD = np.day;
        continue;
      }

      const dayStartMs = dayStartJST.getTime();
      const dayEndMs = dayEndJST.getTime();

      // 営業時間終了チェック
      if (dayEndMs <= nowMs2) {
        dayDetails.push({ date: dateLabel, status: 'スキップ（営業時間終了済み）', dayEndUTC: new Date(dayEndMs).toISOString(), nowUTC: new Date(nowMs2).toISOString() });
        const next = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
        const np = getJSTDateParts(next);
        curY = np.year; curM = np.month; curD = np.day;
        continue;
      }

      // その日のbusyスロット
      const dayBusy = busySlots
        .filter(s => s.start < dayEndMs && s.end > dayStartMs)
        .map(s => ({
          start: Math.max(s.start, dayStartMs),
          end: Math.min(s.end, dayEndMs),
          summary: s.summary,
        }));

      // 空き時間計算
      let cursor = Math.max(dayStartMs, nowMs2);
      const freeRanges: string[] = [];

      for (const busy of dayBusy) {
        if (busy.start > cursor) {
          const gapMin = (busy.start - cursor) / 60000;
          if (gapMin >= 60) {
            const s = getJSTDateParts(new Date(cursor));
            const e = getJSTDateParts(new Date(busy.start));
            freeRanges.push(`${s.hours}:${String(s.minutes).padStart(2, '0')}〜${e.hours}:${String(e.minutes).padStart(2, '0')} (${gapMin}分)`);
            totalFreeSlots++;
          }
        }
        cursor = Math.max(cursor, busy.end);
      }

      if (cursor < dayEndMs) {
        const gapMin = (dayEndMs - cursor) / 60000;
        if (gapMin >= 60) {
          const s = getJSTDateParts(new Date(cursor));
          const e = getJSTDateParts(new Date(dayEndMs));
          freeRanges.push(`${s.hours}:${String(s.minutes).padStart(2, '0')}〜${e.hours}:${String(e.minutes).padStart(2, '0')} (${gapMin}分)`);
          totalFreeSlots++;
        }
      }

      dayDetails.push({
        date: dateLabel,
        status: 'OK',
        dayStartJST_utc: dayStartJST.toISOString(),
        dayEndJST_utc: dayEndJST.toISOString(),
        busyCount: dayBusy.length,
        busy: dayBusy.map(b => ({ summary: b.summary, start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() })),
        freeSlots: freeRanges,
        cursor_start: new Date(Math.max(dayStartMs, nowMs2)).toISOString(),
      });

      // 次の日
      const next = new Date(dayStartJST.getTime() + 24 * 60 * 60 * 1000);
      const np = getJSTDateParts(next);
      curY = np.year; curM = np.month; curD = np.day;
    }

    steps.push({
      step: '8. 日別空き時間シミュレーション',
      result: `${totalFreeSlots}件の空きスロット`,
      detail: dayDetails,
    });

    // Step 9: 実際の findFreeSlots 呼び出し（比較用）
    try {
      const { findFreeSlots, formatFreeSlotsForContext } = await import('@/services/calendar/calendarClient.service');
      const freeSlots = await findFreeSlots(userId, tomorrowStartUTC.toISOString(), weekEndUTC.toISOString(), 60);
      steps.push({
        step: '9. findFreeSlots実行結果',
        result: `${freeSlots.length}件`,
        detail: {
          formatted: formatFreeSlotsForContext(freeSlots),
          raw: freeSlots.slice(0, 5),
        },
      });
    } catch (fsErr) {
      steps.push({ step: '9. findFreeSlots実行結果', result: `FAIL: ${String(fsErr)}` });
    }

    return NextResponse.json({ success: true, steps });
  } catch (topErr) {
    steps.push({ step: 'トップレベルエラー', result: `FAIL: ${String(topErr)}` });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}

// ヘルパー関数（calendarClient.serviceと同じロジック）
function createJSTDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date {
  const utcMs = Date.UTC(year, month, day, hours - 9, minutes, seconds);
  return new Date(utcMs);
}

function getJSTDateParts(date: Date): { year: number; month: number; day: number; dayOfWeek: number; hours: number; minutes: number } {
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
