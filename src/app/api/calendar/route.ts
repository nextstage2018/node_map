// Phase B拡張: Google Calendar API
// GET: 予定取得（today / week / range）
// POST: 予定作成

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import {
  getTodayEvents,
  getWeekEvents,
  getEvents,
  findFreeSlots,
  createEvent,
  isCalendarConnected,
} from '@/services/calendar/calendarClient.service';

export const dynamic = 'force-dynamic';

// GET: 予定取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // カレンダー接続チェック
    const connected = await isCalendarConnected(userId);
    if (!connected) {
      return NextResponse.json({
        success: false,
        error: 'Google Calendar が未連携です。設定画面から Gmail（カレンダー含む）を連携してください。',
        notConnected: true,
      }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'today'; // today / week / range / free

    switch (mode) {
      case 'today': {
        const events = await getTodayEvents(userId);
        return NextResponse.json({ success: true, data: { events, mode: 'today' } });
      }

      case 'week': {
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const events = await getWeekEvents(userId, offset);
        return NextResponse.json({ success: true, data: { events, mode: 'week' } });
      }

      case 'range': {
        const timeMin = searchParams.get('timeMin');
        const timeMax = searchParams.get('timeMax');
        if (!timeMin || !timeMax) {
          return NextResponse.json({ error: 'timeMin and timeMax are required' }, { status: 400 });
        }
        const events = await getEvents(userId, timeMin, timeMax);
        return NextResponse.json({ success: true, data: { events, mode: 'range' } });
      }

      case 'free': {
        // 空き時間検索
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const duration = parseInt(searchParams.get('duration') || '60', 10);

        if (!startDate || !endDate) {
          // デフォルト: 来週の空き
          const now = new Date();
          const nextWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
          const nextWeekEnd = new Date(nextWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          const slots = await findFreeSlots(userId, nextWeekStart.toISOString(), nextWeekEnd.toISOString(), duration);
          return NextResponse.json({ success: true, data: { freeSlots: slots, mode: 'free' } });
        }

        const slots = await findFreeSlots(userId, startDate, endDate, duration);
        return NextResponse.json({ success: true, data: { freeSlots: slots, mode: 'free' } });
      }

      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Calendar API] GET エラー:', error);
    return NextResponse.json({ error: 'カレンダー取得に失敗しました' }, { status: 500 });
  }
}

// POST: 予定作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connected = await isCalendarConnected(userId);
    if (!connected) {
      return NextResponse.json({
        success: false,
        error: 'Google Calendar が未連携です',
        notConnected: true,
      }, { status: 400 });
    }

    const body = await request.json();
    const { summary, description, start, end, location, attendees } = body;

    if (!summary || !start || !end) {
      return NextResponse.json({ error: 'summary, start, end は必須です' }, { status: 400 });
    }

    const event = await createEvent(userId, {
      summary,
      description,
      start,
      end,
      location,
      attendees,
    });

    if (!event) {
      return NextResponse.json({ error: '予定の作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: event });
  } catch (error) {
    console.error('[Calendar API] POST エラー:', error);
    return NextResponse.json({ error: '予定作成に失敗しました' }, { status: 500 });
  }
}
