// Phase 55: カレンダーイベント自動取り込みCron（毎日6:00）
// 昨日のカレンダーイベントをbusiness_eventsに自動登録
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getEvents } from '@/services/calendar/calendarClient.service';

export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * descriptionからGoogle DocsのURLを抽出（Gemini議事録）
 */
function extractMeetingNotesUrl(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+[^\s)"]*/);
  return match ? match[0] : null;
}

export async function GET(request: Request) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' });
    }

    // カレンダー接続済みユーザーを取得
    const { data: tokens } = await supabase
      .from('user_service_tokens')
      .select('user_id, token_data')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'カレンダー接続ユーザーなし', processed: 0 });
    }

    // カレンダースコープがあるユーザーのみ
    const calendarUsers = tokens.filter((t) => {
      const scope = (t.token_data as Record<string, string>)?.scope || '';
      return scope.includes('calendar');
    });

    let totalCreated = 0;

    for (const token of calendarUsers) {
      const userId = token.user_id;
      try {
        // 昨日のイベントを取得
        const now = new Date();
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);

        const events = await getEvents(userId, yesterdayStart.toISOString(), yesterdayEnd.toISOString());

        // 終日予定・キャンセル済みを除外
        const filtered = events.filter((e) => !e.isAllDay && e.status !== 'cancelled');

        for (const event of filtered) {
          // 重複チェック（source_calendar_event_id）
          const { data: existing } = await supabase
            .from('business_events')
            .select('id')
            .eq('source_calendar_event_id', event.id)
            .eq('user_id', userId)
            .limit(1);

          if (existing && existing.length > 0) continue;

          // 議事録URL抽出
          const notesUrl = extractMeetingNotesUrl(event.description);

          // attendees からコンタクト検索
          const attendeeNames: string[] = [];
          let contactId: string | null = null;

          if (event.attendees && event.attendees.length > 0) {
            for (const attendee of event.attendees) {
              if (!attendee.email) continue;

              // contact_channels でメール検索
              const { data: channelMatch } = await supabase
                .from('contact_channels')
                .select('contact_id, contact_persons(name)')
                .eq('address', attendee.email.toLowerCase())
                .limit(1);

              if (channelMatch && channelMatch.length > 0) {
                if (!contactId) contactId = channelMatch[0].contact_id;
                const cp = channelMatch[0].contact_persons as { name?: string } | null;
                if (cp?.name) attendeeNames.push(cp.name);
              } else if (attendee.displayName) {
                attendeeNames.push(attendee.displayName);
              }
            }
          }

          // プロジェクト推定: contactのorganization → projects
          let projectId: string | null = null;
          if (contactId) {
            const { data: contactData } = await supabase
              .from('contact_persons')
              .select('organization_id')
              .eq('id', contactId)
              .single();

            if (contactData?.organization_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('id')
                .eq('organization_id', contactData.organization_id)
                .eq('status', 'active')
                .limit(1);

              if (projectData && projectData.length > 0) {
                projectId = projectData[0].id;
              }
            }
          }

          // content作成
          let content = '';
          if (attendeeNames.length > 0) {
            content += `【参加者】${attendeeNames.join(', ')}\n\n`;
          }
          if (notesUrl) {
            content += `【議事録】\n${notesUrl}\n`;
          }
          if (event.location) {
            content += `\n【場所】${event.location}`;
          }

          // business_events に登録
          const { error } = await supabase
            .from('business_events')
            .insert({
              title: event.summary,
              content: content.trim() || null,
              event_type: 'calendar_meeting',
              project_id: projectId,
              contact_id: contactId,
              user_id: userId,
              source_calendar_event_id: event.id,
              meeting_notes_url: notesUrl,
              event_start: event.start,
              event_end: event.end,
              ai_generated: true,
            });

          if (error) {
            console.error(`[SyncCalendarEvents] イベント登録エラー (${event.id}):`, error);
          } else {
            totalCreated++;
          }
        }
      } catch (userError) {
        console.error(`[SyncCalendarEvents] ユーザー処理エラー (${userId}):`, userError);
      }
    }

    console.log(`[SyncCalendarEvents] 完了: ${totalCreated}件作成`);
    return NextResponse.json({
      success: true,
      created: totalCreated,
      usersProcessed: calendarUsers.length,
    });
  } catch (error) {
    console.error('[SyncCalendarEvents] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'カレンダーイベント同期に失敗しました' },
      { status: 500 }
    );
  }
}
