// V2-G: 評価エージェント自己学習サービス
// 差分記録・議事録からの学習抽出・プロンプト注入を担当
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

// ===== 型定義 =====

interface LearningInsert {
  milestone_id: string;
  project_id: string;
  ai_judgment: string;
  ai_reasoning: string | null;
  human_judgment: string;
  human_reasoning: string;
  gap_analysis: string;
  learning_point: string;
  meeting_record_id?: string;
}

interface GapAnalysisResult {
  analysis: string;
  learning: string;
}

interface MilestoneFeedback {
  milestone_title: string;
  human_judgment: string;
  reasoning: string;
}

// ===== 学習ポイント取得（評価エージェントへの注入用） =====

export async function getLearningPoints(projectId: string, limit = 5): Promise<string[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('evaluation_learnings')
    .select('learning_point, created_at')
    .eq('project_id', projectId)
    .not('learning_point', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((d: { learning_point: string }) => d.learning_point);
}

// ===== 学習ポイントIDを取得（applied_countインクリメント用） =====

export async function getLearningPointsWithIds(
  projectId: string,
  limit = 5
): Promise<{ id: string; learning_point: string }[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('evaluation_learnings')
    .select('id, learning_point')
    .eq('project_id', projectId)
    .not('learning_point', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []) as { id: string; learning_point: string }[];
}

// ===== applied_count をインクリメント =====

export async function incrementAppliedCount(learningIds: string[]): Promise<void> {
  if (learningIds.length === 0) return;

  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return;

  // 1件ずつ UPDATE（RPC不要でシンプル）
  for (const id of learningIds) {
    const { data: current } = await supabase
      .from('evaluation_learnings')
      .select('applied_count')
      .eq('id', id)
      .single();

    if (current) {
      await supabase
        .from('evaluation_learnings')
        .update({ applied_count: (current.applied_count || 0) + 1 })
        .eq('id', id);
    }
  }
}

// ===== 差分分析をAIで生成 =====

export async function analyzeGap(
  aiJudgment: string,
  aiReasoning: string | null,
  humanJudgment: string,
  humanReasoning: string
): Promise<GapAnalysisResult> {
  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: `あなたはAI評価の改善アシスタントです。
AI判定と人間判定の差分を分析し、次回以降に反映すべき学びを1文で要約してください。

必ず以下のJSON形式で返してください（JSONのみ、他のテキストは不要）:
{ "analysis": "差分の分析...", "learning": "次回反映すべき学び..." }`,
      messages: [
        {
          role: 'user',
          content: `AI判定: ${aiJudgment}（理由: ${aiReasoning || '不明'}）\n人間判定: ${humanJudgment}（理由: ${humanReasoning}）`,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AIレスポンスからJSONを解析できませんでした');
    }
    return JSON.parse(jsonMatch[0]) as GapAnalysisResult;
  } catch (error) {
    console.error('[EvaluationLearning] 差分分析エラー:', error);
    // フォールバック
    return {
      analysis: `AI判定(${aiJudgment})と人間判定(${humanJudgment})に乖離あり`,
      learning: `人間の判定理由「${humanReasoning}」の観点を次回評価に反映すること`,
    };
  }
}

// ===== マイルストーンをタイトル部分一致で検索 =====

export async function findMilestoneByTitle(
  projectId: string,
  milestoneTitle: string
): Promise<{ id: string; title: string } | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  // 部分一致検索（議事録の表記揺れ対応）
  const { data } = await supabase
    .from('milestones')
    .select('id, title')
    .eq('project_id', projectId)
    .ilike('title', `%${milestoneTitle}%`)
    .limit(1);

  return data && data.length > 0 ? (data[0] as { id: string; title: string }) : null;
}

// ===== マイルストーンの最新評価を取得 =====

export async function getLatestEvaluation(milestoneId: string): Promise<{
  achievement_level: string;
  ai_analysis: string | null;
} | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from('milestone_evaluations')
    .select('achievement_level, ai_analysis')
    .eq('milestone_id', milestoneId)
    .order('evaluated_at', { ascending: false })
    .limit(1);

  return data && data.length > 0
    ? (data[0] as { achievement_level: string; ai_analysis: string | null })
    : null;
}

// ===== 学習データを記録 =====

export async function insertLearning(learning: LearningInsert): Promise<boolean> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.from('evaluation_learnings').insert({
    milestone_id: learning.milestone_id,
    project_id: learning.project_id,
    ai_judgment: learning.ai_judgment,
    ai_reasoning: learning.ai_reasoning,
    human_judgment: learning.human_judgment,
    human_reasoning: learning.human_reasoning,
    gap_analysis: learning.gap_analysis,
    learning_point: learning.learning_point,
    meeting_record_id: learning.meeting_record_id || null,
  });

  if (error) {
    console.error('[EvaluationLearning] 学習データ記録エラー:', error);
    return false;
  }
  return true;
}

// ===== 会議録のmilestone_feedbackから自動学習を抽出 =====

export async function extractLearningsFromMeetingFeedback(
  projectId: string,
  meetingRecordId: string,
  milestoneFeedback: MilestoneFeedback[]
): Promise<number> {
  let insertedCount = 0;

  for (const feedback of milestoneFeedback) {
    try {
      // 1. マイルストーンをタイトルで検索
      const milestone = await findMilestoneByTitle(projectId, feedback.milestone_title);
      if (!milestone) {
        console.log(`[EvaluationLearning] マイルストーン未発見: ${feedback.milestone_title}`);
        continue;
      }

      // 2. 最新のAI評価を取得
      const latestEval = await getLatestEvaluation(milestone.id);
      if (!latestEval) {
        console.log(`[EvaluationLearning] AI評価未発見: ${milestone.title}`);
        continue;
      }

      // 3. 差分分析をAIで生成
      const gapResult = await analyzeGap(
        latestEval.achievement_level,
        latestEval.ai_analysis,
        feedback.human_judgment,
        feedback.reasoning
      );

      // 4. 学習データを記録
      const success = await insertLearning({
        milestone_id: milestone.id,
        project_id: projectId,
        ai_judgment: latestEval.achievement_level,
        ai_reasoning: latestEval.ai_analysis,
        human_judgment: feedback.human_judgment,
        human_reasoning: feedback.reasoning,
        gap_analysis: gapResult.analysis,
        learning_point: gapResult.learning,
        meeting_record_id: meetingRecordId,
      });

      if (success) insertedCount++;
    } catch (error) {
      console.error(`[EvaluationLearning] フィードバック処理エラー (${feedback.milestone_title}):`, error);
      // 個別のフィードバック処理失敗は他に影響させない
    }
  }

  return insertedCount;
}
