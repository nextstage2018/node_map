-- v11.0: タスク分析ダッシュボード用マイグレーション
-- 実行日: 2026-03-23

-- タスク完了日時の追跡カラム追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 既存の完了タスクにcompleted_atをバックフィル（updated_atで代用）
UPDATE tasks SET completed_at = updated_at WHERE status = 'done' AND completed_at IS NULL;

-- completed_atのインデックス（期間検索用）
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at) WHERE completed_at IS NOT NULL;

-- created_atのインデックス（期間検索用、存在しなければ）
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
