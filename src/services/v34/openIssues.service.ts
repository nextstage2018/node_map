// v3.4: 未確定事項（open_issues）サービス
// 会議録AI解析・チャネルメッセージから未確定事項を自動検出・管理

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

export interface OpenIssue {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'open' | 'resolved' | 'stale';
  source_type: 'meeting' | 'channel' | 'manual';
  source_meeting_record_id: string | null;
  source_message_ids: string[];
  related_decision_node_id: string | null;
  assigned_contact_id: string | null;
  priority_level: 'low' | 'medium' | 'high' | 'critical';
  priority_score: number;
  days_stagnant: number;
  last_mention_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resolved_meeting_record_id: string | null;
  resolved_by_decision_node_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateOpenIssueInput {
  project_id: string;
  user_id: string;
  title: string;
  description?: string;
  source_type: 'meeting' | 'channel' | 'manual';
  source_meeting_record_id?: string;
  source_message_ids?: string[];
  related_decision_node_id?: string;
  assigned_contact_id?: string;
  priority_level?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ResolveOpenIssueInput {
  resolution_note?: string;
  resolved_meeting_record_id?: string;
  resolved_by_decision_node_id?: string;
}

// AIが解析結果から返すopen_issue情報
export interface AIDetectedOpenIssue {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  related_topic?: string;
}

// AIが解析結果から返す解決済みissue情報
export interface AIResolvedIssue {
  issue_title: string;
  resolution_note: string;
}

// ========================================
// サービス関数
// ========================================

/**
 * プロジェクトの未確定事項を取得（AI解析コンテキスト注入用）
 * statusが open または stale のものを優先度順に最大20件
 */
export async function getOpenIssuesForContext(
  projectId: string,
  limit: number = 20
): Promise<OpenIssue[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('open_issues')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['open', 'stale'])
      .order('priority_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[OpenIssues] コンテキスト取得エラー:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[OpenIssues] コンテキスト取得例外:', err);
    return [];
  }
}

/**
 * 未確定事項を作成（重複チェック: UNIQUE(project_id, title, source_type)）
 */
export async function createOpenIssue(
  input: CreateOpenIssueInput
): Promise<OpenIssue | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('open_issues')
      .insert({
        project_id: input.project_id,
        user_id: input.user_id,
        title: input.title,
        description: input.description || null,
        source_type: input.source_type,
        source_meeting_record_id: input.source_meeting_record_id || null,
        source_message_ids: input.source_message_ids || [],
        related_decision_node_id: input.related_decision_node_id || null,
        assigned_contact_id: input.assigned_contact_id || null,
        priority_level: input.priority_level || 'medium',
        last_mention_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // UNIQUE制約違反 = 既存issue → last_mention_at を更新
      if (error.code === '23505') {
        console.log(`[OpenIssues] 既存issue更新: "${input.title}"`);
        await updateLastMention(input.project_id, input.title, input.source_type);
        return null;
      }
      console.error('[OpenIssues] 作成エラー:', error);
      return null;
    }

    console.log(`[OpenIssues] 新規作成: "${input.title}"`);
    return data;
  } catch (err) {
    console.error('[OpenIssues] 作成例外:', err);
    return null;
  }
}

/**
 * 未確定事項を解決（自動クローズ）
 */
export async function resolveOpenIssue(
  projectId: string,
  issueTitle: string,
  input: ResolveOpenIssueInput
): Promise<boolean> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('open_issues')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_note: input.resolution_note || null,
        resolved_meeting_record_id: input.resolved_meeting_record_id || null,
        resolved_by_decision_node_id: input.resolved_by_decision_node_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('title', issueTitle)
      .in('status', ['open', 'stale']);

    if (error) {
      console.error(`[OpenIssues] 解決エラー: "${issueTitle}"`, error);
      return false;
    }

    console.log(`[OpenIssues] 自動クローズ: "${issueTitle}"`);
    return true;
  } catch (err) {
    console.error('[OpenIssues] 解決例外:', err);
    return false;
  }
}

/**
 * AI解析結果から未確定事項を一括処理
 * - 新規issueを作成
 * - 解決済みissueを自動クローズ
 */
export async function processAIOpenIssues(
  projectId: string,
  userId: string,
  meetingRecordId: string,
  newIssues: AIDetectedOpenIssue[],
  resolvedIssues: AIResolvedIssue[]
): Promise<{ created: number; resolved: number }> {
  let created = 0;
  let resolved = 0;

  // 新規作成
  for (const issue of newIssues) {
    const result = await createOpenIssue({
      project_id: projectId,
      user_id: userId,
      title: issue.title,
      description: issue.description,
      source_type: 'meeting',
      source_meeting_record_id: meetingRecordId,
      priority_level: issue.priority,
    });
    if (result) created++;
  }

  // 自動クローズ
  for (const resolved_issue of resolvedIssues) {
    const success = await resolveOpenIssue(
      projectId,
      resolved_issue.issue_title,
      {
        resolution_note: resolved_issue.resolution_note,
        resolved_meeting_record_id: meetingRecordId,
      }
    );
    if (success) resolved++;
  }

  return { created, resolved };
}

/**
 * last_mention_at を更新（既存issueが再度言及された場合）
 */
async function updateLastMention(
  projectId: string,
  title: string,
  sourceType: string
): Promise<void> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return;

  try {
    await supabase
      .from('open_issues')
      .update({
        last_mention_at: new Date().toISOString(),
        days_stagnant: 0, // 再度言及されたのでリセット
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('title', title)
      .eq('source_type', sourceType)
      .in('status', ['open', 'stale']);
  } catch (err) {
    console.error('[OpenIssues] last_mention_at更新エラー:', err);
  }
}

/**
 * Cron用: 全プロジェクトの滞留日数・優先度・stale判定を更新
 */
export async function updateStagnationAndPriority(): Promise<{
  updated: number;
  staled: number;
  errors: number;
}> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { updated: 0, staled: 0, errors: 0 };

  const stats = { updated: 0, staled: 0, errors: 0 };

  try {
    // open/stale の全issueを取得
    const { data: issues, error } = await supabase
      .from('open_issues')
      .select('id, created_at, last_mention_at, priority_level, status, days_stagnant')
      .in('status', ['open', 'stale']);

    if (error || !issues) {
      console.error('[OpenIssues Cron] 取得エラー:', error);
      return stats;
    }

    const now = Date.now();
    const STALE_THRESHOLD_DAYS = 21;

    for (const issue of issues) {
      try {
        // 滞留日数 = 最後に言及された日 or 作成日からの経過日数
        const referenceDate = issue.last_mention_at || issue.created_at;
        const daysSince = Math.floor((now - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24));

        // 優先度スコア計算
        const priorityPoints: Record<string, number> = {
          low: 10,
          medium: 30,
          high: 60,
          critical: 100,
        };
        const levelPoints = priorityPoints[issue.priority_level] || 30;
        const priorityScore = Math.min(
          100,
          levelPoints * 0.6 + (daysSince / 30) * 40
        );

        // stale判定
        const newStatus = (issue.status === 'open' && daysSince > STALE_THRESHOLD_DAYS)
          ? 'stale'
          : issue.status;

        if (newStatus === 'stale' && issue.status === 'open') {
          stats.staled++;
        }

        await supabase
          .from('open_issues')
          .update({
            days_stagnant: daysSince,
            priority_score: Math.round(priorityScore * 100) / 100,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', issue.id);

        stats.updated++;
      } catch (itemErr) {
        console.error(`[OpenIssues Cron] issue ${issue.id} 更新エラー:`, itemErr);
        stats.errors++;
      }
    }

    return stats;
  } catch (err) {
    console.error('[OpenIssues Cron] 例外:', err);
    return stats;
  }
}
