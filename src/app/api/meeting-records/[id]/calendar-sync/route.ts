// v4.1: 会議録 → Googleカレンダー同期API
// POST /api/meeting-records/[id]/calendar-sync
// 会議を [NM-Meeting] プレフィックス付きでカレンダーイベントとして登録
// オプション: description にアジェンダを自動注入

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingRecordId } = await params;

    // オプション: リクエストボディでアジェンダdescriptionを受け取る
    let agendaDescription: string | undefined;
    try {
      const body = await request.json();
      agendaDescription = body.agenda_description;
    } catch {
      // bodyなしでもOK
    }

    // アジェンダが未指定の場合、meeting_agendaテーブルから自動取得を試みる
    if (!agendaDescription) {
      try {
        const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
        const supabase = getServerSupabase() || getSupabase();
        if (supabase) {
          // 会議録のproject_idとmeeting_start_atを取得
          const { data: meeting } = await supabase
            .from('meeting_records')
            .select('project_id, meeting_start_at')
            .eq('id', meetingRecordId)
            .single();

          if (meeting?.project_id && meeting?.meeting_start_at) {
            const meetingDate = meeting.meeting_start_at.split('T')[0];
            const { data: agenda } = await supabase
              .from('meeting_agenda')
              .select('items, title')
              .eq('project_id', meeting.project_id)
              .eq('meeting_date', meetingDate)
              .single();

            if (agenda?.items) {
              agendaDescription = formatAgendaForDescription(agenda.items);
            }
          }
        }
      } catch {
        // アジェンダ取得失敗は無視
      }
    }

    // カレンダー同期実行
    const { syncMeetingToCalendar } = await import('@/services/calendar/calendarSync.service');
    const result = await syncMeetingToCalendar(meetingRecordId, userId, agendaDescription);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'カレンダー同期に失敗しました' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        calendarEventId: result.calendarEventId,
        htmlLink: result.htmlLink,
      },
    });
  } catch (error) {
    console.error('[MeetingCalendarSync] エラー:', error);
    return NextResponse.json(
      { error: 'カレンダー同期に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * アジェンダ items をカレンダー備考(description)用テキストに変換
 */
function formatAgendaForDescription(
  items: { type: string; title: string; description: string; priority: string; estimated_minutes: number }[]
): string {
  if (!items || items.length === 0) return '';

  const lines: string[] = ['【アジェンダ】\n'];

  const typeLabel: Record<string, string> = {
    open_issue: '未確定事項',
    decision_review: '決定確認',
    task_progress: 'タスク進捗',
    task_completed: '成果報告',
    custom: 'その他',
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = typeLabel[item.type] || item.type;
    const priority = item.priority === 'critical' ? '🔴' : item.priority === 'high' ? '🟠' : '';
    lines.push(`${i + 1}. ${priority}[${label}] ${item.title} (${item.estimated_minutes}分)`);
    if (item.description) {
      lines.push(`   ${item.description}`);
    }
  }

  const totalMinutes = items.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
  lines.push(`\n合計見積: 約${totalMinutes}分`);

  return lines.join('\n');
}
