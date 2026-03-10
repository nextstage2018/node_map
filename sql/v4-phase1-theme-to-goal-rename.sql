-- ============================================================
-- v4.0 Phase 1: themes → goals リネーム
-- 実行場所: Supabase SQL Editor
-- 実行順序: 上から順に1ブロックずつ実行してください
-- ============================================================

-- ============================================================
-- STEP 1: テーブル名変更（themes → goals）
-- ============================================================
ALTER TABLE themes RENAME TO goals;

-- ============================================================
-- STEP 2: カラム名変更（sort_order → phase_order）
-- ============================================================
ALTER TABLE goals RENAME COLUMN sort_order TO phase_order;

-- ============================================================
-- STEP 3: milestones の FK カラム名変更（theme_id → goal_id）
-- ============================================================
ALTER TABLE milestones RENAME COLUMN theme_id TO goal_id;

-- ============================================================
-- STEP 4: インデックス再作成（名前をgoal系に変更）
-- ※ 既存のインデックス名はSupabaseが自動命名しているため、
--   IF EXISTS で安全に削除してから再作成
-- ============================================================

-- goals テーブルのインデックス
DROP INDEX IF EXISTS idx_themes_project_id;
CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id);

DROP INDEX IF EXISTS idx_themes_status;
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- milestones テーブルの goal_id インデックス
DROP INDEX IF EXISTS idx_milestones_theme_id;
CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON milestones(goal_id);

-- ============================================================
-- STEP 5: RLS ポリシーの再作成（themes → goals）
-- ※ Supabase の RLS ポリシー名を確認して適宜修正
-- ============================================================

-- 既存ポリシーを削除（名前が異なる場合は適宜修正）
DROP POLICY IF EXISTS "Enable read for authenticated users" ON goals;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON goals;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON goals;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON goals;

-- 新ポリシー作成
CREATE POLICY "Enable read for authenticated users" ON goals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON goals
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON goals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON goals
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- STEP 6: 既存データ確認（実行してデータを確認してください）
-- ============================================================
-- SELECT id, project_id, title, phase_order, status FROM goals ORDER BY created_at;
-- SELECT id, project_id, goal_id, title FROM milestones WHERE goal_id IS NOT NULL ORDER BY created_at;

-- ============================================================
-- 完了！
-- 次のステップ: アプリケーションコードをデプロイ
-- ============================================================
