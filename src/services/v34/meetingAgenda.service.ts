// v3.4: 会議アジェンダ（meeting_agenda）サービス
// open_issues + decision_log + tasks + completed_tasks(v4.0) から次回アジェンダを自動生成

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

export interface AgendaItem {
  id: string;
  type: 'open_issue' | 'decision_review' | 'task_progress' | 'task_completed' | 'custom';
  reference_id: string | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_contact_id: string | null;
  discussed: boolean;
  resolution_note: string | null;
  estimated_minutes: number;
}

export interface MeetingAgenda {
  id: string;
  project_id: string;
  user_id: string;
  meeting_date: string;
  title: string;
  status: 'draft' | 'confirmed' | 'completed';
  linked_meeting_record_id: string | null;
  items: AgendaItem[];
  generated_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ========================================
// サービス関数
// ========================================

/**
 * プロジェクトの最新アジェンダを取得
 */
export async function getLatestAgenda(
  projectId: string
): Promise<MeetingAgenda | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('meeting_agenda')
      .select('*')
      .eq('project_id', projectId)
      .order('meeting_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // 0 rows
      console.error('[MeetingAgenda] 取得エラー:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[MeetingAgenda] 取得例外:', err);
    return null;
  }
}

/**
 * アジェンダを自動生成
 * open_issues(open/stale) + decision_log(active, 直近1週間) + tasks(in_progress)
 */
export async function generateAgenda(
  projectId: string,
  userId: string,
  meetingDate: string
): Promise<MeetingAgenda | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    const items: AgendaItem[] = [];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. 未確定事項（open/stale） → 優先度順
    const { data: openIssues } = await supabase
      .from('open_issues')
      .select('id, title, description, priority_level, days_stagnant, assigned_contact_id, status')
      .eq('project_id', projectId)
      .in('status', ['open', 'stale'])
      .order('priority_score', { ascending: false })
      .limit(10);

    if (openIssues) {
      for (const issue of openIssues) {
        items.push({
          id: crypto.randomUUID(),
          type: 'open_issue',
          reference_id: issue.id,
          title: issue.title,
          description: issue.description || `${issue.days_stagnant}日経過${issue.status === 'stale' ? '（停滞）' : ''}`,
          priority: issue.priority_level,
          assigned_contact_id: issue.assigned_contact_id,
          discussed: false,
          resolution_note: null,
          estimated_minutes: issue.priority_level === 'critical' ? 15 : issue.priority_level === 'high' ? 10 : 5,
        });
      }
    }

    // 2. 直近1週間の決定事項確認
    const { data: recentDecisions } = await supabase
      .from('decision_log')
      .select('id, title, decision_content, implementation_status, decided_by_contact_id')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentDecisions) {
      for (const decision of recentDecisions) {
        items.push({
          id: crypto.randomUUID(),
          type: 'decision_review',
          reference_id: decision.id,
          title: `【確認】${decision.title}`,
          description: `${decision.decision_content}（実行状況: ${decision.implementation_status || 'pending'}）`,
          priority: 'medium',
          assigned_contact_id: decision.decided_by_contact_id,
          discussed: false,
          resolution_note: null,
          estimated_minutes: 5,
        });
      }
    }

    // 3. 進行中タスクの進捗確認
    const { data: inProgressTasks } = await supabase
      .from('tasks')
      .select('id, title, status, due_date, assigned_to')
      .eq('project_id', projectId)
      .eq('status', 'in_progress')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10);

    if (inProgressTasks) {
      for (const task of inProgressTasks) {
        const isOverdue = task.due_date && new Date(task.due_date) < new Date();
        items.push({
          id: crypto.randomUUID(),
          type: 'task_progress',
          reference_id: task.id,
          title: task.title,
          description: isOverdue
            ? `期限超過: ${new Date(task.due_date).toLocaleDateString('ja-JP')}`
            : task.due_date
              ? `期限: ${new Date(task.due_date).toLocaleDateString('ja-JP')}`
              : '期限未設定',
          priority: isOverdue ? 'high' : 'medium',
          assigned_contact_id: task.assigned_to || null,
          discussed: false,
          resolution_note: null,
          estimated_minutes: 5,
        });
      }
    }

    // 4. v4.0: 直近1週間の完了タスク（business_events から成果報告）
    const { data: completedTasks } = await supabase
      .from('business_events')
      .select('id, title, content, event_date, created_at')
      .eq('project_id', projectId)
      .eq('event_type', 'task_completed')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(5);

    if (completedTasks) {
      for (const event of completedTasks) {
        // タイトルから「タスク完了: 」プレフィックスを除去
        const cleanTitle = (event.title || event.content || '').replace(/^タスク完了:\s*/, '');
        items.push({
          id: crypto.randomUUID(),
          type: 'task_completed',
          reference_id: event.id,
          title: `【成果報告】${cleanTitle}`,
          description: event.content || `完了日: ${new Date(event.event_date || event.created_at).toLocaleDateString('ja-JP')}`,
          priority: 'low',
          assigned_contact_id: null,
          discussed: false,
          resolution_note: null,
          estimated_minutes: 3,
        });
      }
    }

    // items が空なら生成不要
    if (items.length === 0) {
      console.log(`[MeetingAgenda] 項目なし、生成スキップ: ${projectId}`);
      return null;
    }

    // 合計見積もり時間
    const totalMinutes = items.reduce((sum, item) => sum + item.estimated_minutes, 0);

    // upsert（同PJ同日は1つ）
    const { data, error } = await supabase
      .from('meeting_agenda')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          meeting_date: meetingDate,
          title: 'Agenda',
          status: 'draft',
          items,
          generated_at: new Date().toISOString(),
          metadata: { total_estimated_minutes: totalMinutes, item_count: items.length },
        },
        { onConflict: 'project_id,meeting_date' }
      )
      .select()
      .single();

    if (error) {
      console.error('[MeetingAgenda] 生成エラー:', error);
      return null;
    }

    console.log(`[MeetingAgenda] 生成完了: ${projectId} (${items.length}項目, 約${totalMinutes}分)`);
    return data;
  } catch (err) {
    console.error('[MeetingAgenda] 生成例外:', err);
    return null;
  }
}

/**
 * アジェンダのステータスを更新
 */
export async function updateAgendaStatus(
  agendaId: string,
  status: 'confirmed' | 'completed',
  linkedMeetingRecordId?: string
): Promise<boolean> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return false;

  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'confirmed') {
      updateData.confirmed_at = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (linkedMeetingRecordId) {
      updateData.linked_meeting_record_id = linkedMeetingRecordId;
    }

    const { error } = await supabase
      .from('meeting_agenda')
      .update(updateData)
      .eq('id', agendaId);

    if (error) {
      console.error('[MeetingAgenda] ステータス更新エラー:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MeetingAgenda] ステータス更新例外:', err);
    return false;
  }
}

/**
 * Cron用: 全プロジェクトの翌営業日アジェンダを自動生成
 * v4.1: 生成後にカレンダー備考にアジェンダを注入
 */
export async function generateAgendasForAllProjects(
  userId: string
): Promise<{ generated: number; skipped: number; errors: number; calendarUpdated: number }> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { generated: 0, skipped: 0, errors: 0, calendarUpdated: 0 };

  const stats = { generated: 0, skipped: 0, errors: 0, calendarUpdated: 0 };

  try {
    // アクティブなプロジェクトを取得
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id')
      .limit(50);

    if (error || !projects) {
      console.error('[MeetingAgenda Cron] プロジェクト取得エラー:', error);
      return stats;
    }

    // 翌営業日を計算
    const nextBusinessDay = getNextBusinessDay();
    const meetingDate = nextBusinessDay.toISOString().split('T')[0];

    for (const project of projects) {
      try {
        const result = await generateAgenda(project.id, userId, meetingDate);
        if (result) {
          stats.generated++;

          // v4.1: カレンダー備考にアジェンダを注入
          try {
            const calendarUpdated = await injectAgendaToCalendarEvents(
              project.id,
              meetingDate,
              result.items,
              userId
            );
            if (calendarUpdated > 0) {
              stats.calendarUpdated += calendarUpdated;
            }
          } catch (calErr) {
            console.warn(`[MeetingAgenda Cron] カレンダー注入失敗 PJ ${project.id}:`, calErr);
          }
        } else {
          stats.skipped++;
        }
      } catch (err) {
        console.error(`[MeetingAgenda Cron] PJ ${project.id} エラー:`, err);
        stats.errors++;
      }
    }

    return stats;
  } catch (err) {
    console.error('[MeetingAgenda Cron] 例外:', err);
    return stats;
  }
}

/**
 * v4.1: アジェンダをカレンダーイベントの備考(description)に注入
 * 該当日のNM-Meeting予定を検索し、descriptionを更新
 */
async function injectAgendaToCalendarEvents(
  projectId: string,
  meetingDate: string,
  items: AgendaItem[],
  userId: string
): Promise<number> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return 0;

  // 該当日の会議録を取得（calendar_event_id が設定されているもの）
  const dayStart = `${meetingDate}T00:00:00`;
  const dayEnd = `${meetingDate}T23:59:59`;

  const { data: meetings } = await supabase
    .from('meeting_records')
    .select('id, calendar_event_id')
    .eq('project_id', projectId)
    .not('calendar_event_id', 'is', null)
    .gte('meeting_start_at', dayStart)
    .lte('meeting_start_at', dayEnd);

  if (!meetings || meetings.length === 0) return 0;

  const description = formatAgendaForCalendarDescription(items);
  let updated = 0;

  for (const meeting of meetings) {
    if (!meeting.calendar_event_id) continue;

    try {
      const { updateCalendarEvent } = await import('@/services/calendar/calendarSync.service');
      const result = await updateCalendarEvent(meeting.calendar_event_id, userId, {
        description,
      });
      if (result.success) updated++;
    } catch {
      // 個別失敗は無視
    }
  }

  return updated;
}

/**
 * v4.1: アジェンダ items をカレンダー備考用テキストに変換
 */
function formatAgendaForCalendarDescription(items: AgendaItem[]): string {
  if (!items || items.length === 0) return '';

  const typeLabel: Record<string, string> = {
    open_issue: '未確定事項',
    decision_review: '決定確認',
    task_progress: 'タスク進捗',
    task_completed: '成果報告',
    custom: 'その他',
  };

  const lines: string[] = ['【アジェンダ】\n'];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = typeLabel[item.type] || item.type;
    const priorityIcon = item.priority === 'critical' ? '🔴' : item.priority === 'high' ? '🟠' : '';
    lines.push(`${i + 1}. ${priorityIcon}[${label}] ${item.title} (${item.estimated_minutes}分)`);
    if (item.description) {
      lines.push(`   ${item.description}`);
    }
  }

  const totalMinutes = items.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
  lines.push(`\n合計見積: 約${totalMinutes}分`);
  lines.push(`\n--- NodeMap自動生成 ---`);

  return lines.join('\n');
}

/**
 * 翌営業日を取得（土日スキップ）
 */
function getNextBusinessDay(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  // 土曜→月曜、日曜→月曜
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}
