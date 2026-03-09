// ============================================================
// V2 新規テーブル TypeScript型定義
// ============================================================

/** テーマ（任意の中間レイヤー） */
export interface Theme {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

/** マイルストーン（1週間チェックポイント） */
export interface Milestone {
  id: string;
  project_id: string;
  theme_id: string | null;
  title: string;
  description: string | null;
  start_context: string | null;
  target_date: string | null;
  achieved_date: string | null;
  status: 'pending' | 'in_progress' | 'achieved' | 'missed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 会議録 */
export interface MeetingRecord {
  id: string;
  project_id: string;
  title: string;
  meeting_date: string;
  content: string;
  source_type: 'text' | 'file' | 'transcription';
  source_file_id: string | null;
  ai_summary: string | null;
  processed: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 検討ツリー（ルート） */
export interface DecisionTree {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** 検討ツリーノード */
export interface DecisionTreeNode {
  id: string;
  tree_id: string;
  parent_node_id: string | null;
  title: string;
  node_type: 'topic' | 'option' | 'decision' | 'action';
  status: 'active' | 'completed' | 'cancelled' | 'on_hold';
  description: string | null;
  cancel_reason: string | null;
  cancel_meeting_id: string | null;
  source_meeting_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 検討ツリーノード状態変更履歴 */
export interface DecisionTreeNodeHistory {
  id: string;
  node_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  meeting_record_id: string | null;
  changed_at: string;
}

/** チェックポイント評価結果 */
export interface MilestoneEvaluation {
  id: string;
  milestone_id: string;
  evaluation_type: 'auto' | 'manual';
  achievement_level: 'achieved' | 'partially' | 'missed';
  ai_analysis: string | null;
  deviation_summary: string | null;
  correction_suggestion: string | null;
  presentation_summary: string | null;
  evaluated_at: string;
}

/** 評価エージェント学習データ */
export interface EvaluationLearning {
  id: string;
  milestone_id: string;
  project_id: string;
  ai_judgment: string;
  ai_reasoning: string | null;
  human_judgment: string | null;
  human_reasoning: string | null;
  gap_analysis: string | null;
  learning_point: string | null;
  meeting_record_id: string | null;
  applied_count: number;
  created_at: string;
}
