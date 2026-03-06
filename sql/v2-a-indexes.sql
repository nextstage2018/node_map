-- ============================================================
-- V2-A: インデックス作成
-- 注意: v2-a-create-tables.sql → v2-a-alter-tables.sql の後に実行
-- ============================================================

-- themes
CREATE INDEX IF NOT EXISTS idx_themes_project_id ON themes(project_id);

-- milestones
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_theme_id ON milestones(theme_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);

-- meeting_records
CREATE INDEX IF NOT EXISTS idx_meeting_records_project_id ON meeting_records(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_records_meeting_date ON meeting_records(meeting_date);

-- decision_trees
CREATE INDEX IF NOT EXISTS idx_decision_trees_project_id ON decision_trees(project_id);

-- decision_tree_nodes
CREATE INDEX IF NOT EXISTS idx_decision_tree_nodes_tree_id ON decision_tree_nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_decision_tree_nodes_parent_node_id ON decision_tree_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_decision_tree_nodes_status ON decision_tree_nodes(status);

-- milestone_evaluations
CREATE INDEX IF NOT EXISTS idx_milestone_evaluations_milestone_id ON milestone_evaluations(milestone_id);

-- evaluation_learnings
CREATE INDEX IF NOT EXISTS idx_evaluation_learnings_milestone_id ON evaluation_learnings(milestone_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_learnings_project_id ON evaluation_learnings(project_id);

-- 既存テーブルの新カラムへのインデックス
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
