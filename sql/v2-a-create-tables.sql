-- ============================================================
-- V2-A: 新規8テーブル作成
-- 実行順序: FK依存関係に基づく（上から順に実行）
-- 注意: Supabaseダッシュボードで手動実行すること
-- ============================================================

-- 1. themes（テーマ — 任意の中間レイヤー）
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. milestones（マイルストーン — 1週間チェックポイント）
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_context TEXT,
  target_date DATE,
  achieved_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'achieved', 'missed')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. meeting_records（会議録）
CREATE TABLE IF NOT EXISTS meeting_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT DEFAULT 'text' CHECK (source_type IN ('text', 'file', 'transcription')),
  source_file_id UUID,
  ai_summary TEXT,
  processed BOOLEAN DEFAULT false,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. decision_trees（検討ツリーのルート）
CREATE TABLE IF NOT EXISTS decision_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. decision_tree_nodes（検討ツリーのノード）
CREATE TABLE IF NOT EXISTS decision_tree_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES decision_trees(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('topic', 'option', 'decision', 'action')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'on_hold')),
  description TEXT,
  cancel_reason TEXT,
  cancel_meeting_id UUID REFERENCES meeting_records(id),
  source_meeting_id UUID REFERENCES meeting_records(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. decision_tree_node_history（ノード状態変更履歴）
CREATE TABLE IF NOT EXISTS decision_tree_node_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES decision_tree_nodes(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  meeting_record_id UUID REFERENCES meeting_records(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- 7. milestone_evaluations（チェックポイント評価結果）
CREATE TABLE IF NOT EXISTS milestone_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN ('auto', 'manual')),
  achievement_level TEXT NOT NULL CHECK (achievement_level IN ('achieved', 'partially', 'missed')),
  ai_analysis TEXT,
  deviation_summary TEXT,
  correction_suggestion TEXT,
  presentation_summary TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. evaluation_learnings（評価エージェント学習データ）
CREATE TABLE IF NOT EXISTS evaluation_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ai_judgment TEXT NOT NULL,
  ai_reasoning TEXT,
  human_judgment TEXT,
  human_reasoning TEXT,
  gap_analysis TEXT,
  learning_point TEXT,
  meeting_record_id UUID REFERENCES meeting_records(id),
  applied_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
