// v4.2: プロジェクト繰り返しルール API（GET / POST）
// GET  /api/projects/[id]/recurring-rules — ルール一覧取得
// POST /api/projects/[id]/recurring-rules — ルール作成

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    const { getRecurringRules } = await import('@/services/v42/recurringRules.service');
    const rules = await getRecurringRules(projectId);

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    console.error('[RecurringRules API] GET エラー:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();

    const { type, title, rrule, lead_days, calendar_sync, auto_create, metadata, meeting_group_id } = body;

    if (!type || !['meeting', 'task', 'job'].includes(type)) {
      return NextResponse.json({ error: '無効なtype（meeting/task/jobのいずれか）' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'titleは必須です' }, { status: 400 });
    }
    if (!rrule || typeof rrule !== 'string') {
      return NextResponse.json({ error: 'rruleは必須です（iCal RRULE形式）' }, { status: 400 });
    }

    const { createRecurringRule } = await import('@/services/v42/recurringRules.service');
    const rule = await createRecurringRule({
      project_id: projectId,
      type,
      title,
      rrule,
      lead_days,
      calendar_sync,
      auto_create,
      metadata,
      meeting_group_id: meeting_group_id || null,
    });

    if (!rule) {
      return NextResponse.json({ error: 'ルール作成に失敗しました（RRULE形式を確認してください）' }, { status: 400 });
    }

    // カレンダー即時登録（calendar_sync=trueの場合）
    // Google CalendarネイティブRRULEで繰り返し予定を1つ作成
    let calendarResult = null;
    if (calendar_sync) {
      try {
        const meta = metadata || {};
        const startHour = (meta.start_hour as number) || 10;
        const startMinute = (meta.start_minute as number) || 0;
        const durationMin = (meta.duration_minutes as number) || 60;

        // 初回開始日を今日にする（RRULEが繰り返しを管理）
        const now = new Date();
        // JSTの今日の日付を取得（Vercel UTC環境対応）
        const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const y = jstNow.getUTCFullYear();
        const mo = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
        const d = String(jstNow.getUTCDate()).padStart(2, '0');
        const sh = String(startHour).padStart(2, '0');
        const sm = String(startMinute).padStart(2, '0');

        const endTotalMin = startHour * 60 + startMinute + durationMin;
        const eh = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0');
        const em = String(endTotalMin % 60).padStart(2, '0');

        const scheduledStart = `${y}-${mo}-${d}T${sh}:${sm}:00+09:00`;
        const scheduledEnd = `${y}-${mo}-${d}T${eh}:${em}:00+09:00`;

        // プロジェクト名・組織IDを取得
        const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
        const sb = getServerSupabase() || getSupabase();
        let projectName = '';
        let organizationId = '';
        if (sb) {
          try {
            const { data: pj } = await sb.from('projects').select('name, organization_id').eq('id', projectId).single();
            projectName = pj?.name || '';
            organizationId = pj?.organization_id || '';
          } catch { /* */ }
        }

        // 参加者のメールアドレスを contact_channels から解決
        const participants = (meta.participants as string[]) || [];
        let attendeeEmails: string[] = [];
        if (sb && participants.length > 0) {
          try {
            const { data: channels } = await sb
              .from('contact_channels')
              .select('address')
              .in('contact_id', participants)
              .eq('channel', 'email');
            attendeeEmails = (channels || []).map(c => c.address).filter(Boolean);
          } catch { /* */ }
        }

        // description にID情報を記載（名寄せ用）
        const typeLabel = type === 'meeting' ? 'MTG' : '定期作業';
        const appUrl = 'https://node-map-eight.vercel.app';
        const projectUrl = organizationId
          ? `${appUrl}/organizations/${organizationId}?project=${projectId}`
          : `${appUrl}/organizations`;
        const description = [
          `【NodeMap 定期イベント: ${typeLabel}】`,
          projectName ? `プロジェクト: ${projectName}` : '',
          `---`,
          `rule_id: ${rule.id}`,
          `project_id: ${projectId}`,
          `type: ${type}`,
          ``,
          projectUrl,
        ].filter(Boolean).join('\n');

        const { createCalendarEventForSource } = await import('@/services/calendar/calendarSync.service');
        calendarResult = await createCalendarEventForSource({
          userId,
          title,
          description,
          scheduledStart,
          scheduledEnd,
          sourceType: type === 'meeting' ? 'meeting' : 'job',
          sourceId: rule.id,
          recurrence: [`RRULE:${rrule}`],
          attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        });

        // calendar_event_id を metadata に保存（削除時に使用）
        if (calendarResult?.success && calendarResult.calendarEventId && sb) {
          const updatedMeta = { ...(metadata || {}), calendar_event_id: calendarResult.calendarEventId };
          await sb
            .from('project_recurring_rules')
            .update({ metadata: updatedMeta })
            .eq('id', rule.id);
          // レスポンスにも反映
          rule.metadata = updatedMeta;
        }

        console.log('[RecurringRules] カレンダー即時登録:', calendarResult?.success ? '成功' : calendarResult?.error);
      } catch (calErr) {
        console.error('[RecurringRules] カレンダー登録エラー（ルール作成は成功）:', calErr);
      }
    }

    return NextResponse.json({ success: true, data: rule, calendar: calendarResult });
  } catch (error) {
    console.error('[RecurringRules API] POST エラー:', error);
    return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 });
  }
}
