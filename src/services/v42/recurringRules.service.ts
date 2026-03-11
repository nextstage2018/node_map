// v4.2: 繰り返しルール（project_recurring_rules）サービス
// meeting / task / job の繰り返し自動生成を管理

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

export interface RecurringRule {
  id: string;
  project_id: string;
  type: 'meeting' | 'task' | 'job';
  title: string;
  rrule: string;
  lead_days: number;
  calendar_sync: boolean;
  auto_create: boolean;
  metadata: Record<string, unknown>;
  enabled: boolean;
  occurrence_count: number;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringRuleInput {
  project_id: string;
  type: 'meeting' | 'task' | 'job';
  title: string;
  rrule: string;
  lead_days?: number;
  calendar_sync?: boolean;
  auto_create?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateRecurringRuleInput {
  title?: string;
  rrule?: string;
  lead_days?: number;
  calendar_sync?: boolean;
  auto_create?: boolean;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

// ========================================
// RRULE パーサー（軽量版）
// ========================================

interface RRuleParams {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byday?: string[];   // MO, TU, WE, ...
  bymonthday?: number[];
  count?: number;
  until?: Date;
}

/**
 * RRULE文字列をパースしてパラメータを返す
 * 例: "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1"
 */
export function parseRRule(rruleStr: string): RRuleParams | null {
  try {
    // "RRULE:" プレフィックスがあれば除去
    const clean = rruleStr.replace(/^RRULE:/i, '');
    const parts = clean.split(';');
    const params: Partial<RRuleParams> = { interval: 1 };

    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key.toUpperCase()) {
        case 'FREQ':
          params.freq = value.toUpperCase() as RRuleParams['freq'];
          break;
        case 'INTERVAL':
          params.interval = parseInt(value, 10) || 1;
          break;
        case 'BYDAY':
          params.byday = value.split(',').map(d => d.trim().toUpperCase());
          break;
        case 'BYMONTHDAY':
          params.bymonthday = value.split(',').map(d => parseInt(d.trim(), 10));
          break;
        case 'COUNT':
          params.count = parseInt(value, 10);
          break;
        case 'UNTIL':
          // YYYYMMDD or YYYYMMDDTHHMMSSZ
          if (value.length >= 8) {
            const y = parseInt(value.substring(0, 4), 10);
            const m = parseInt(value.substring(4, 6), 10) - 1;
            const d = parseInt(value.substring(6, 8), 10);
            params.until = new Date(y, m, d);
          }
          break;
      }
    }

    if (!params.freq) return null;
    return params as RRuleParams;
  } catch {
    return null;
  }
}

/**
 * 次回発生日をRRULEから算出
 * baseDate: 計算の基準日（通常は今日）
 */
export function getNextOccurrence(rruleStr: string, baseDate: Date = new Date()): Date | null {
  const params = parseRRule(rruleStr);
  if (!params) return null;

  // UNTIL超過チェック
  if (params.until && baseDate > params.until) return null;

  const dayMap: Record<string, number> = {
    SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
  };

  switch (params.freq) {
    case 'DAILY': {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + params.interval);
      return next;
    }

    case 'WEEKLY': {
      if (params.byday && params.byday.length > 0) {
        // 指定曜日の中で次に来る日を探す
        const targetDays = params.byday.map(d => dayMap[d]).filter(d => d !== undefined);
        const today = baseDate.getDay();

        for (let offset = 1; offset <= 7 * params.interval; offset++) {
          const candidate = new Date(baseDate);
          candidate.setDate(candidate.getDate() + offset);
          if (targetDays.includes(candidate.getDay())) {
            return candidate;
          }
        }
      }
      // BYDAYなしの場合は単純に interval 週後の同曜日
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 7 * params.interval);
      return next;
    }

    case 'MONTHLY': {
      if (params.bymonthday && params.bymonthday.length > 0) {
        // 指定日で次月を探す
        const targetDay = params.bymonthday[0];
        const next = new Date(baseDate);
        // 今月の指定日がまだ来てなければ今月、過ぎていれば来月
        next.setDate(targetDay);
        if (next <= baseDate) {
          next.setMonth(next.getMonth() + params.interval);
          next.setDate(targetDay);
        }
        return next;
      }
      // BYMONTHDAY なしの場合は同日の来月
      const next = new Date(baseDate);
      next.setMonth(next.getMonth() + params.interval);
      return next;
    }

    case 'YEARLY': {
      const next = new Date(baseDate);
      next.setFullYear(next.getFullYear() + params.interval);
      return next;
    }

    default:
      return null;
  }
}

/**
 * 基準日からN日以内に次回発生日があるかチェック
 */
export function isWithinLeadDays(
  rruleStr: string,
  leadDays: number,
  baseDate: Date = new Date()
): { shouldGenerate: boolean; nextDate: Date | null } {
  const next = getNextOccurrence(rruleStr, baseDate);
  if (!next) return { shouldGenerate: false, nextDate: null };

  const diffMs = next.getTime() - baseDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return {
    shouldGenerate: diffDays <= leadDays && diffDays >= 0,
    nextDate: next,
  };
}

// ========================================
// CRUD操作
// ========================================

export async function getRecurringRules(
  projectId: string
): Promise<RecurringRule[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('project_recurring_rules')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[RecurringRules] 取得エラー:', error);
    return [];
  }
  return data || [];
}

export async function createRecurringRule(
  input: CreateRecurringRuleInput
): Promise<RecurringRule | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  // RRULE文字列の検証
  if (!parseRRule(input.rrule)) {
    console.error('[RecurringRules] 無効なRRULE:', input.rrule);
    return null;
  }

  const { data, error } = await supabase
    .from('project_recurring_rules')
    .insert({
      project_id: input.project_id,
      type: input.type,
      title: input.title,
      rrule: input.rrule,
      lead_days: input.lead_days ?? 7,
      calendar_sync: input.calendar_sync ?? false,
      auto_create: input.auto_create ?? true,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error('[RecurringRules] 作成エラー:', error);
    return null;
  }
  return data;
}

export async function updateRecurringRule(
  ruleId: string,
  input: UpdateRecurringRuleInput
): Promise<RecurringRule | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  if (input.rrule && !parseRRule(input.rrule)) {
    console.error('[RecurringRules] 無効なRRULE:', input.rrule);
    return null;
  }

  const { data, error } = await supabase
    .from('project_recurring_rules')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', ruleId)
    .select()
    .single();

  if (error) {
    console.error('[RecurringRules] 更新エラー:', error);
    return null;
  }
  return data;
}

export async function deleteRecurringRule(ruleId: string): Promise<boolean> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('project_recurring_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    console.error('[RecurringRules] 削除エラー:', error);
    return false;
  }
  return true;
}

// ========================================
// Cron処理: 繰り返しルールの自動生成
// ========================================

export interface ProcessStats {
  processed: number;
  tasksCreated: number;
  jobsCreated: number;
  meetingsCreated: number;
  skipped: number;
  errors: number;
}

/**
 * 全有効ルールを処理して、タスク/ジョブ/会議を自動生成
 */
export async function processAllRecurringRules(
  userId: string
): Promise<ProcessStats> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { processed: 0, tasksCreated: 0, jobsCreated: 0, meetingsCreated: 0, skipped: 0, errors: 0 };

  const stats: ProcessStats = { processed: 0, tasksCreated: 0, jobsCreated: 0, meetingsCreated: 0, skipped: 0, errors: 0 };

  try {
    // 有効なルールを全取得
    const { data: rules, error } = await supabase
      .from('project_recurring_rules')
      .select('*')
      .eq('enabled', true)
      .eq('auto_create', true);

    if (error || !rules) {
      console.error('[RecurringRules Cron] ルール取得エラー:', error);
      return stats;
    }

    const today = new Date();

    for (const rule of rules) {
      stats.processed++;

      try {
        const { shouldGenerate, nextDate } = isWithinLeadDays(rule.rrule, rule.lead_days, today);

        if (!shouldGenerate || !nextDate) {
          stats.skipped++;
          continue;
        }

        // 既に同日に生成済みかチェック（last_generated_atで判定）
        if (rule.last_generated_at) {
          const lastGen = new Date(rule.last_generated_at);
          const nextDateStr = nextDate.toISOString().split('T')[0];
          const lastGenStr = lastGen.toISOString().split('T')[0];
          // 同じ次回日に対して既に生成済みなら skip
          if (lastGenStr >= nextDateStr) {
            stats.skipped++;
            continue;
          }
        }

        // 新しい occurrence_count
        const newCount = (rule.occurrence_count || 0) + 1;
        const generatedTitle = `第${newCount}回 ${rule.title}`;
        const dueDateStr = nextDate.toISOString().split('T')[0];

        switch (rule.type) {
          case 'task': {
            // 最新マイルストーンを取得
            const { data: milestone } = await supabase
              .from('milestones')
              .select('id')
              .eq('project_id', rule.project_id)
              .in('status', ['pending', 'in_progress'])
              .order('due_date', { ascending: true })
              .limit(1)
              .maybeSingle();

            const { error: taskErr } = await supabase
              .from('tasks')
              .insert({
                user_id: userId,
                project_id: rule.project_id,
                title: generatedTitle,
                description: `繰り返しルール「${rule.title}」から自動生成（${dueDateStr}期限）`,
                status: 'todo',
                priority: 'medium',
                due_date: dueDateStr,
                milestone_id: milestone?.id || null,
                source_type: 'recurring',
              });

            if (taskErr) {
              console.error(`[RecurringRules Cron] タスク作成エラー (${rule.id}):`, taskErr);
              stats.errors++;
            } else {
              stats.tasksCreated++;
            }
            break;
          }

          case 'job': {
            const { error: jobErr } = await supabase
              .from('jobs')
              .insert({
                user_id: userId,
                project_id: rule.project_id,
                title: generatedTitle,
                description: `繰り返しルール「${rule.title}」から自動生成`,
                type: (rule.metadata as Record<string, unknown>)?.job_type || 'routine',
                status: 'pending',
                due_date: dueDateStr,
              });

            if (jobErr) {
              console.error(`[RecurringRules Cron] ジョブ作成エラー (${rule.id}):`, jobErr);
              stats.errors++;
            } else {
              stats.jobsCreated++;
            }
            break;
          }

          case 'meeting': {
            // 会議カレンダー同期（v4.1の仕組みを利用）
            if (rule.calendar_sync) {
              try {
                const { CALENDAR_PREFIX } = await import('@/lib/constants');
                const { createCalendarEventForSource } = await import('@/services/calendar/calendarSync.service');

                // デフォルト会議時間: metadata から取得 or 10:00-11:00
                const meetingHour = ((rule.metadata as Record<string, unknown>)?.start_hour as number) || 10;
                const durationMin = ((rule.metadata as Record<string, unknown>)?.duration_minutes as number) || 60;

                const startTime = new Date(nextDate);
                startTime.setHours(meetingHour, 0, 0, 0);
                const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000);

                await createCalendarEventForSource({
                  userId,
                  title: generatedTitle,
                  description: `定例会議: ${rule.title}`,
                  scheduledStart: startTime.toISOString(),
                  scheduledEnd: endTime.toISOString(),
                  sourceType: 'meeting',
                  sourceId: rule.id,
                });

                // CALENDAR_PREFIX は直接使用しない（createCalendarEventForSource内で付与）
                void CALENDAR_PREFIX;
              } catch (calErr) {
                console.warn(`[RecurringRules Cron] カレンダー登録失敗 (${rule.id}):`, calErr);
              }
            }
            stats.meetingsCreated++;
            break;
          }
        }

        // ルールの occurrence_count と last_generated_at を更新
        await supabase
          .from('project_recurring_rules')
          .update({
            occurrence_count: newCount,
            last_generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

      } catch (ruleErr) {
        console.error(`[RecurringRules Cron] ルール処理エラー (${rule.id}):`, ruleErr);
        stats.errors++;
      }
    }

    return stats;
  } catch (err) {
    console.error('[RecurringRules Cron] 全体エラー:', err);
    return stats;
  }
}

// ========================================
// MeetGeek照合: 定例会マッチング
// ========================================

/**
 * MeetGeek Webhook受信時、定例会ルールとの照合を行う
 * 同日 + タイトル類似度で判定 → recurring_rule_id を返す
 */
export async function matchRecurringMeeting(
  projectId: string,
  meetingTitle: string,
  meetingDate: string
): Promise<{ ruleId: string | null; occurrenceNumber: number }> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { ruleId: null, occurrenceNumber: 0 };

  try {
    // プロジェクトの有効な会議ルールを取得
    const { data: rules } = await supabase
      .from('project_recurring_rules')
      .select('*')
      .eq('project_id', projectId)
      .eq('type', 'meeting')
      .eq('enabled', true);

    if (!rules || rules.length === 0) return { ruleId: null, occurrenceNumber: 0 };

    // 各ルールとタイトル類似度を計算
    const titleLower = meetingTitle.toLowerCase();

    for (const rule of rules) {
      const ruleTitleLower = rule.title.toLowerCase();

      // タイトル類似度チェック（部分一致 or 高い類似度）
      const similarity = calculateSimilarity(titleLower, ruleTitleLower);
      const isPartialMatch =
        titleLower.includes(ruleTitleLower) ||
        ruleTitleLower.includes(titleLower);

      if (similarity > 0.5 || isPartialMatch) {
        // 該当日がRRULEの発生日に合致するかチェック
        const meetingDateObj = new Date(meetingDate);
        const params = parseRRule(rule.rrule);

        if (params) {
          const dayOfWeek = meetingDateObj.getDay();
          const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

          let dateMatches = false;

          if (params.freq === 'DAILY') {
            dateMatches = true;
          } else if (params.freq === 'WEEKLY' && params.byday) {
            dateMatches = params.byday.includes(dayNames[dayOfWeek]);
          } else if (params.freq === 'MONTHLY' && params.bymonthday) {
            dateMatches = params.bymonthday.includes(meetingDateObj.getDate());
          } else {
            // 曜日指定なしの場合はタイトル一致で十分
            dateMatches = true;
          }

          if (dateMatches) {
            const newCount = (rule.occurrence_count || 0) + 1;

            // ルールの occurrence_count を更新
            await supabase
              .from('project_recurring_rules')
              .update({
                occurrence_count: newCount,
                last_generated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', rule.id);

            console.log(`[RecurringRules] MeetGeek照合: "${meetingTitle}" → ルール "${rule.title}" (第${newCount}回)`);
            return { ruleId: rule.id, occurrenceNumber: newCount };
          }
        }
      }
    }

    return { ruleId: null, occurrenceNumber: 0 };
  } catch (err) {
    console.error('[RecurringRules] MeetGeek照合エラー:', err);
    return { ruleId: null, occurrenceNumber: 0 };
  }
}

/**
 * 簡易文字列類似度（Jaccard係数ベース）
 */
function calculateSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
