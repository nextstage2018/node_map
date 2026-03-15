// v7.1: ボスフィードバック学習サービス
// 会議録のAI解析結果からフィードバック（指摘事項）を抽出・蓄積し、
// タスクAI会話に注入してAIと上長の判断基準の差を縮める

import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface BossFeedback {
  feedback_type: 'correction' | 'direction' | 'priority' | 'perspective';
  original_approach: string;
  boss_feedback: string;
  learning_point: string;
  context: string;
  task_title?: string;
}

/**
 * AI解析プロンプトに追加するフィードバック抽出指示
 */
export function getBossFeedbackPromptSection(): string {
  return `
"boss_feedbacks": [
  {
    "feedback_type": "correction | direction | priority | perspective",
    "original_approach": "部下やチームが提案していた元の方向性（なければ空文字）",
    "boss_feedback": "上長・意思決定者の指摘・修正内容",
    "learning_point": "次回同様の場面でAIが活かすべき判断基準（1文で簡潔に）",
    "context": "どの議題・状況でのフィードバックか",
    "task_title": "関連するタスク名（あれば）"
  }
]
// feedback_type の使い分け:
//   correction: 方向性の修正（「そうじゃなくて」「違う」）
//   direction: 新たな指示・方針（「こうしてほしい」「次はこうやって」）
//   priority: 優先順位の指摘（「まずこっちを」「これは後回し」）
//   perspective: 視点の補正（「お客さん目線で」「経営視点で考えて」）
// ※ 上長・責任者の発言で、指摘・修正・方針転換を含むものだけ抽出
// ※ 単なる報告や質問は含めない`;
}

/**
 * 会議録AI解析結果からフィードバックをDBに保存
 */
export async function saveBossFeedbacks(
  projectId: string,
  meetingRecordId: string,
  feedbacks: BossFeedback[]
): Promise<number> {
  if (!feedbacks || feedbacks.length === 0) return 0;

  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return 0;

  let savedCount = 0;
  for (const fb of feedbacks) {
    if (!fb.boss_feedback || !fb.learning_point) continue;

    const { error } = await supabase
      .from('boss_feedback_learnings')
      .insert({
        project_id: projectId,
        meeting_record_id: meetingRecordId,
        feedback_type: fb.feedback_type || 'direction',
        original_approach: fb.original_approach || '',
        boss_feedback: fb.boss_feedback,
        learning_point: fb.learning_point,
        context: fb.context || '',
      });

    if (!error) savedCount++;
  }

  return savedCount;
}

/**
 * タスクAI会話に注入するフィードバック学習コンテキストを取得
 * プロジェクトの直近フィードバックを取得し、AIプロンプトに注入する文字列を返す
 */
export async function getBossFeedbackContext(projectId: string): Promise<string> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return '';

  const { data: feedbacks, error } = await supabase
    .from('boss_feedback_learnings')
    .select('feedback_type, boss_feedback, learning_point, context, applied_count')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(15);

  if (error || !feedbacks || feedbacks.length === 0) return '';

  // applied_countをインクリメント（参照回数を記録）
  const ids = feedbacks.map((f: any) => f.id).filter(Boolean);
  if (ids.length > 0) {
    // バックグラウンドで更新（失敗してもブロックしない）
    supabase
      .rpc('increment_boss_feedback_applied_count', { feedback_ids: ids })
      .then(() => {})
      .catch(() => {});
  }

  const typeLabels: Record<string, string> = {
    correction: '方向修正',
    direction: '指示・方針',
    priority: '優先順位',
    perspective: '視点',
  };

  const lines = feedbacks.map((f: any, i: number) => {
    const typeLabel = typeLabels[f.feedback_type] || f.feedback_type;
    return `${i + 1}. 【${typeLabel}】${f.learning_point}${f.context ? `（背景: ${f.context}）` : ''}`;
  }).join('\n');

  return `\n\n## 上長フィードバック学習（重要: これらの判断基準を応答に反映すること）
以下は過去の会議で上長が部下に指摘した内容から抽出した学習ポイントです。
AIはこれらの判断基準・視点を内面化し、上長と同じ目線でアドバイスしてください。
${lines}`;
}
