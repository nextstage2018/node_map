// v3.4: 意思決定ログ（decision_log）サービス
// 「決まったこと」の不変ログ + 変更チェーン管理

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

export interface DecisionLog {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  decision_content: string;
  rationale: string | null;
  decision_tree_node_id: string | null;
  previous_decision_id: string | null;
  change_reason: string | null;
  status: 'active' | 'superseded' | 'reverted' | 'on_hold';
  source_meeting_record_id: string | null;
  source_type: 'meeting' | 'channel' | 'manual';
  decided_by_contact_id: string | null;
  implementation_status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  implementation_notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateDecisionLogInput {
  project_id: string;
  user_id: string;
  title: string;
  decision_content: string;
  rationale?: string;
  decision_tree_node_id?: string;
  source_type: 'meeting' | 'channel' | 'manual';
  source_meeting_record_id?: string;
  decided_by_contact_id?: string;
}

// AIが解析結果から返す決定事項情報
export interface AIDetectedDecision {
  title: string;
  decision_content: string;
  rationale: string;
  related_topic?: string;
}

// ========================================
// サービス関数
// ========================================

/**
 * プロジェクトの直近の決定事項を取得（AI解析コンテキスト注入用）
 * statusがactiveのものを直近順に最大10件
 */
export async function getRecentDecisionsForContext(
  projectId: string,
  limit: number = 10
): Promise<DecisionLog[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('decision_log')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DecisionLog] コンテキスト取得エラー:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[DecisionLog] コンテキスト取得例外:', err);
    return [];
  }
}

/**
 * 決定事項を記録
 * 同タイトルのactive決定が既存の場合は変更チェーン（superseded→新規）
 */
export async function createDecisionLog(
  input: CreateDecisionLogInput
): Promise<DecisionLog | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  try {
    // 同プロジェクト・同タイトルのactive決定があるか確認
    const { data: existing } = await supabase
      .from('decision_log')
      .select('id, decision_content')
      .eq('project_id', input.project_id)
      .eq('title', input.title)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    let previousDecisionId: string | null = null;
    let changeReason: string | null = null;

    if (existing && existing.length > 0) {
      const prev = existing[0];
      // 内容が同じなら重複 → スキップ
      if (prev.decision_content === input.decision_content) {
        console.log(`[DecisionLog] 同一決定スキップ: "${input.title}"`);
        return null;
      }

      // 旧決定をsupersedに
      previousDecisionId = prev.id;
      changeReason = '会議での再議論により変更';

      await supabase
        .from('decision_log')
        .update({
          status: 'superseded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', prev.id);

      console.log(`[DecisionLog] 旧決定をsuperseded: "${input.title}" (${prev.id})`);
    }

    // 新規決定を作成
    const { data, error } = await supabase
      .from('decision_log')
      .insert({
        project_id: input.project_id,
        user_id: input.user_id,
        title: input.title,
        decision_content: input.decision_content,
        rationale: input.rationale || null,
        decision_tree_node_id: input.decision_tree_node_id || null,
        previous_decision_id: previousDecisionId,
        change_reason: changeReason,
        status: 'active',
        source_type: input.source_type,
        source_meeting_record_id: input.source_meeting_record_id || null,
        decided_by_contact_id: input.decided_by_contact_id || null,
      })
      .select()
      .single();

    if (error) {
      // UNIQUE制約違反の場合はスキップ
      if (error.code === '23505') {
        console.log(`[DecisionLog] 重複スキップ: "${input.title}"`);
        return null;
      }
      console.error('[DecisionLog] 作成エラー:', error);
      return null;
    }

    console.log(`[DecisionLog] 記録: "${input.title}"${previousDecisionId ? ' (変更チェーン)' : ''}`);
    return data;
  } catch (err) {
    console.error('[DecisionLog] 作成例外:', err);
    return null;
  }
}

/**
 * AI解析結果から決定事項を一括記録
 */
export async function processAIDecisions(
  projectId: string,
  userId: string,
  meetingRecordId: string,
  decisions: AIDetectedDecision[]
): Promise<number> {
  let created = 0;

  for (const decision of decisions) {
    const result = await createDecisionLog({
      project_id: projectId,
      user_id: userId,
      title: decision.title,
      decision_content: decision.decision_content,
      rationale: decision.rationale,
      source_type: 'meeting',
      source_meeting_record_id: meetingRecordId,
    });
    if (result) created++;
  }

  return created;
}

/**
 * 決定ログの変更チェーンを取得（過去の決定履歴をたどる）
 */
export async function getDecisionChain(
  decisionId: string
): Promise<DecisionLog[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  const chain: DecisionLog[] = [];
  let currentId: string | null = decisionId;

  try {
    while (currentId) {
      const { data, error } = await supabase
        .from('decision_log')
        .select('*')
        .eq('id', currentId)
        .single();

      if (error || !data) break;
      chain.push(data);
      currentId = data.previous_decision_id;

      // 無限ループ防止
      if (chain.length > 50) break;
    }

    return chain;
  } catch (err) {
    console.error('[DecisionLog] チェーン取得例外:', err);
    return chain;
  }
}
