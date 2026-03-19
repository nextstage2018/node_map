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
        const stagnantInfo = `${issue.days_stagnant}日経過${issue.status === 'stale' ? '（停滞中・要対応）' : ''}`;
        const descParts: string[] = [stagnantInfo];

        // 課題の説明文（AI解析で生成された文脈）を追加
        if (issue.description) {
          const descText = issue.description.length > 150
            ? issue.description.substring(0, 150) + '...'
            : issue.description;
          descParts.push(`背景: ${descText}`);
        }

        // 関連する直近の決定事項があれば参照情報を追加
        try {
          const { data: relatedDecisions } = await supabase
            .from('decision_log')
            .select('title')
            .eq('project_id', projectId)
            .eq('status', 'active')
            .ilike('title', `%${issue.title.substring(0, 20)}%`)
            .limit(1);
          if (relatedDecisions && relatedDecisions.length > 0) {
            descParts.push(`関連決定: ${relatedDecisions[0].title}`);
          }
        } catch { /* ignore */ }

        items.push({
          id: crypto.randomUUID(),
          type: 'open_issue',
          reference_id: issue.id,
          title: issue.title,
          description: descParts.join('\n'),
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

    // 3. 進行中タスクの進捗確認（AI会話要約 + 関連資料リンク付き）
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

        // タスクの最新AI会話を取得（取り組み内容の要約として）
        let progressSummary = '';
        try {
          const { data: latestConvs } = await supabase
            .from('task_conversations')
            .select('content, role, phase')
            .eq('task_id', task.id)
            .eq('role', 'assistant')
            .neq('phase', 'checkpoint')
            .order('created_at', { ascending: false })
            .limit(1);
          if (latestConvs && latestConvs.length > 0) {
            const text = latestConvs[0].content;
            progressSummary = text.length > 200 ? text.substring(0, 200) + '...' : text;
          }
        } catch { /* ignore */ }

        // 関連資料リンクを取得
        let docInfo = '';
        try {
          const { data: docs } = await supabase
            .from('drive_documents')
            .select('title, document_url')
            .eq('task_id', task.id)
            .not('document_url', 'is', null)
            .limit(3);
          if (docs && docs.length > 0) {
            docInfo = '\n📎 ' + docs.map((d: any) => d.title || '資料').join(', ');
          }
        } catch { /* ignore */ }

        // チェックポイントスコアを取得
        let scoreInfo = '';
        try {
          const { data: cpData } = await supabase
            .from('task_conversations')
            .select('content')
            .eq('task_id', task.id)
            .eq('phase', 'checkpoint')
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1);
          if (cpData && cpData.length > 0) {
            try {
              const parsed = JSON.parse(cpData[0].content);
              if (parsed.total_score) scoreInfo = ` [品質: ${parsed.total_score}点]`;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }

        const datePart = isOverdue
          ? `⚠️ 期限超過: ${new Date(task.due_date).toLocaleDateString('ja-JP')}`
          : task.due_date
            ? `期限: ${new Date(task.due_date).toLocaleDateString('ja-JP')}`
            : '期限未設定';

        const descParts = [datePart + scoreInfo];
        if (progressSummary) descParts.push(`進捗: ${progressSummary}`);
        if (docInfo) descParts.push(docInfo);

        items.push({
          id: crypto.randomUUID(),
          type: 'task_progress',
          reference_id: task.id,
          title: task.title,
          description: descParts.join('\n'),
          priority: isOverdue ? 'high' : 'medium',
          assigned_contact_id: task.assigned_to || null,
          discussed: false,
          resolution_note: null,
          estimated_minutes: 5,
        });
      }
    }

    // 4. v4.0: 直近1週間の完了タスク（タスク本体から成果情報を取得）
    const { data: completedTasksRaw } = await supabase
      .from('tasks')
      .select('id, title, status, due_date, assigned_to, updated_at')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .gte('updated_at', weekAgo)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (completedTasksRaw) {
      for (const task of completedTasksRaw) {
        // 完了タスクのAI会話要約を取得（何に取り組んだかの概要）
        let completionSummary = '';
        try {
          const { data: convs } = await supabase
            .from('task_conversations')
            .select('content, role, phase')
            .eq('task_id', task.id)
            .eq('role', 'assistant')
            .neq('phase', 'checkpoint')
            .order('created_at', { ascending: false })
            .limit(1);
          if (convs && convs.length > 0) {
            const text = convs[0].content;
            completionSummary = text.length > 200 ? text.substring(0, 200) + '...' : text;
          }
        } catch { /* ignore */ }

        // 成果物（関連資料）リンクを取得
        let deliverables = '';
        try {
          const { data: docs } = await supabase
            .from('drive_documents')
            .select('title, document_url')
            .eq('task_id', task.id)
            .not('document_url', 'is', null)
            .limit(3);
          if (docs && docs.length > 0) {
            deliverables = '\n📎 成果物: ' + docs.map((d: any) => `${d.title || '資料'}(${d.document_url})`).join(', ');
          }
        } catch { /* ignore */ }

        // チェックポイントスコアを取得
        let scoreInfo = '';
        try {
          const { data: cpData } = await supabase
            .from('task_conversations')
            .select('content')
            .eq('task_id', task.id)
            .eq('phase', 'checkpoint')
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1);
          if (cpData && cpData.length > 0) {
            try {
              const parsed = JSON.parse(cpData[0].content);
              if (parsed.total_score) scoreInfo = ` [最終品質: ${parsed.total_score}点]`;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }

        const completedDate = `完了日: ${new Date(task.updated_at).toLocaleDateString('ja-JP')}`;
        const descParts = [completedDate + scoreInfo];
        if (completionSummary) descParts.push(`取り組み内容: ${completionSummary}`);
        if (deliverables) descParts.push(deliverables);

        items.push({
          id: crypto.randomUUID(),
          type: 'task_completed',
          reference_id: task.id,
          title: `【成果報告】${task.title}`,
          description: descParts.join('\n'),
          priority: 'low',
          assigned_contact_id: task.assigned_to || null,
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
 * v8.0: プロジェクトログDocに事前アジェンダを挿入 + カレンダーにDocリンク貼付
 */
export async function generateAgendasForAllProjects(
  userId: string
): Promise<{ generated: number; skipped: number; errors: number; calendarUpdated: number; docsUpdated: number }> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { generated: 0, skipped: 0, errors: 0, calendarUpdated: 0, docsUpdated: 0 };

  const stats = { generated: 0, skipped: 0, errors: 0, calendarUpdated: 0, docsUpdated: 0 };

  try {
    // アクティブなプロジェクトを取得
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, log_document_id, log_document_url')
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

          // v8.0: プロジェクトログDocに事前アジェンダを挿入
          try {
            const {
              getOrCreateProjectLogDoc,
              collectAgendaData,
              insertPreMeetingAgenda,
              addDocLinkToCalendarEvent,
            } = await import('@/services/v8/projectLogDoc.service');

            // ログDoc取得（なければ自動作成）
            const docInfo = await getOrCreateProjectLogDoc(userId, project.id);
            if (docInfo) {
              // アジェンダデータ収集
              const agendaData = await collectAgendaData(project.id, meetingDate, userId);
              if (agendaData) {
                const inserted = await insertPreMeetingAgenda(userId, docInfo.documentId, agendaData);
                if (inserted) {
                  stats.docsUpdated++;
                  console.log(`[MeetingAgenda Cron] v8.0 Doc更新: PJ ${project.name}`);
                }
              }

              // カレンダーイベントにDocリンクを貼付
              try {
                const dayStart = `${meetingDate}T00:00:00+09:00`;
                const dayEnd = `${meetingDate}T23:59:59+09:00`;
                const { getEvents } = await import('@/services/calendar/calendarClient.service');
                const events = await getEvents(userId, dayStart, dayEnd);
                for (const event of events) {
                  if (event.id) {
                    await addDocLinkToCalendarEvent(
                      userId,
                      event.id,
                      docInfo.documentUrl,
                      event.description
                    );
                  }
                }
              } catch (calLinkErr) {
                console.warn(`[MeetingAgenda Cron] カレンダーリンク貼付失敗:`, calLinkErr);
              }
            }
          } catch (docErr) {
            console.warn(`[MeetingAgenda Cron] v8.0 Doc処理失敗 PJ ${project.id}:`, docErr);
          }

          // v4.1: カレンダー備考にアジェンダを注入（既存機能、Doc未対応環境のフォールバック）
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
 * v4.1→v10.3改修: アジェンダをカレンダーイベントの備考(description)に注入
 * 3段階でカレンダーイベントを検索:
 *   1. meeting_records.calendar_event_id（既存。会議録に紐づくイベント）
 *   2. project_recurring_rules.metadata.calendar_event_id（定期イベント）
 *   3. Google Calendar API直接検索（[NM-Meeting] or project_id: でマッチ）
 */
async function injectAgendaToCalendarEvents(
  projectId: string,
  meetingDate: string,
  items: AgendaItem[],
  userId: string
): Promise<number> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return 0;

  const agendaText = formatAgendaForCalendarDescription(items);
  if (!agendaText) return 0;

  const { updateCalendarEvent } = await import('@/services/calendar/calendarSync.service');
  const updatedEventIds = new Set<string>(); // 重複更新防止

  // --- 経路1: meeting_records.calendar_event_id ---
  try {
    const dayStart = `${meetingDate}T00:00:00+09:00`;
    const dayEnd = `${meetingDate}T23:59:59+09:00`;

    const { data: meetings } = await supabase
      .from('meeting_records')
      .select('id, calendar_event_id')
      .eq('project_id', projectId)
      .not('calendar_event_id', 'is', null)
      .gte('meeting_start_at', dayStart)
      .lte('meeting_start_at', dayEnd);

    if (meetings) {
      for (const meeting of meetings) {
        if (meeting.calendar_event_id && !updatedEventIds.has(meeting.calendar_event_id)) {
          const result = await updateCalendarEvent(meeting.calendar_event_id, userId, {
            description: agendaText,
          });
          if (result.success) {
            updatedEventIds.add(meeting.calendar_event_id);
            console.log(`[Agenda→Calendar] 経路1(meeting_records): ${meeting.calendar_event_id}`);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Agenda→Calendar] 経路1エラー:', err);
  }

  // --- 経路2: project_recurring_rules（定期イベント）のカレンダーID ---
  try {
    const { data: rules } = await supabase
      .from('project_recurring_rules')
      .select('id, title, metadata')
      .eq('project_id', projectId)
      .eq('type', 'meeting')
      .eq('enabled', true);

    if (rules) {
      for (const rule of rules) {
        const calEventId = rule.metadata?.calendar_event_id;
        if (calEventId && !updatedEventIds.has(calEventId)) {
          // 繰り返しイベントの場合、特定日のインスタンスIDを使用
          // Google CalendarのRRULEイベントは元IDで更新するとシリーズ全体が変わるため
          // 特定日インスタンスを取得して更新
          try {
            const instanceId = await getRecurringEventInstanceId(userId, calEventId, meetingDate);
            const targetId = instanceId || calEventId;

            if (!updatedEventIds.has(targetId)) {
              const result = await updateCalendarEvent(targetId, userId, {
                description: agendaText,
              });
              if (result.success) {
                updatedEventIds.add(targetId);
                console.log(`[Agenda→Calendar] 経路2(recurring_rules): ${targetId} (rule: ${rule.title})`);
              }
            }
          } catch {
            // インスタンス取得失敗は無視
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Agenda→Calendar] 経路2エラー:', err);
  }

  // --- 経路3: Google Calendar API直接検索（フォールバック） ---
  if (updatedEventIds.size === 0) {
    try {
      const { getEvents } = await import('@/services/calendar/calendarClient.service');
      const dayStart = `${meetingDate}T00:00:00+09:00`;
      const dayEnd = `${meetingDate}T23:59:59+09:00`;
      const events = await getEvents(userId, dayStart, dayEnd);

      // プロジェクト名を取得
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .maybeSingle();

      const projectName = project?.name || '';

      for (const event of events) {
        if (!event.id || updatedEventIds.has(event.id)) continue;

        // マッチ条件: [NM-Meeting]プレフィックス or descriptionにproject_id:含む
        const summary = event.summary || '';
        const desc = event.description || '';
        const isNmMeeting = summary.includes('[NM-Meeting]');
        const hasProjectId = desc.includes(`project_id: ${projectId}`);
        const hasProjectName = projectName && summary.includes(projectName);

        if (isNmMeeting || hasProjectId || hasProjectName) {
          const result = await updateCalendarEvent(event.id, userId, {
            description: agendaText,
          });
          if (result.success) {
            updatedEventIds.add(event.id);
            console.log(`[Agenda→Calendar] 経路3(Calendar検索): ${event.id} (${summary})`);
          }
        }
      }
    } catch (err) {
      console.warn('[Agenda→Calendar] 経路3エラー:', err);
    }
  }

  return updatedEventIds.size;
}

/**
 * 繰り返しカレンダーイベントの特定日インスタンスIDを取得
 * Google Calendar APIのinstancesエンドポイントを使用
 */
async function getRecurringEventInstanceId(
  userId: string,
  recurringEventId: string,
  targetDate: string
): Promise<string | null> {
  try {
    const { getValidAccessToken } = await import('@/services/calendar/calendarClient.service');
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) return null;

    const timeMin = `${targetDate}T00:00:00+09:00`;
    const timeMax = `${targetDate}T23:59:59+09:00`;

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(recurringEventId)}/instances?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }
    return null;
  } catch {
    return null;
  }
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
