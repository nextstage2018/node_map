// Phase 55: カレンダー過去イベント取得API（手動登録＋Cron共通基盤）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getEvents, CalendarEvent } from '@/services/calendar/calendarClient.service';

export const dynamic = 'force-dynamic';

/**
 * descriptionからGoogle DocsのURLを抽出
 */
function extractMeetingNotesUrl(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+[^\s)"]*/);
  return match ? match[0] : null;
}

// GET: 過去のカレンダーイベント一覧（直近2週間）
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '14', 10);

    const now = new Date();
    const timeMax = now.toISOString();
    const timeMin = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const events = await getEvents(userId, timeMin, timeMax);

    // 終日予定・キャンセル済みを除外、時間降順にソート
    const filtered = events
      .filter((e: CalendarEvent) => !e.isAllDay && e.status !== 'cancelled')
      .sort((a: CalendarEvent, b: CalendarEvent) => new Date(b.start).getTime() - new Date(a.start).getTime());

    // 各イベントから議事録URLを抽出
    const meetingNotesUrls: Record<string, string> = {};
    for (const event of filtered) {
      const url = extractMeetingNotesUrl(event.description);
      if (url) {
        meetingNotesUrls[event.id] = url;
      }
    }

    return NextResponse.json({
      success: true,
      data: { events: filtered, meetingNotesUrls },
    });
  } catch (error) {
    console.error('[Calendar PastEvents API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'カレンダーイベントの取得に失敗しました' },
      { status: 500 }
    );
  }
}
