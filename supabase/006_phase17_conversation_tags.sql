-- Phase 17: 会話タグ分類 + フェーズ遷移タイムスタンプ
-- 実行: Supabase Dashboard → SQL Editor

-- 1. task_conversations テーブルに conversation_tag カラム追加
ALTER TABLE task_conversations
  ADD COLUMN IF NOT EXISTS conversation_tag TEXT;

-- 2. tasks テーブルにフェーズ遷移タイムスタンプ追加
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS seed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ideation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_at TIMESTAMPTZ;

-- 3. 既存タスクの ideation_at を created_at で埋める（初期フェーズが ideation のため）
UPDATE tasks
SET ideation_at = created_at
WHERE ideation_at IS NULL;

-- 4. インデックス: タグ別の集計用
CREATE INDEX IF NOT EXISTS idx_task_conversations_tag
  ON task_conversations (conversation_tag)
  WHERE conversation_tag IS NOT NULL;

-- 5. インデックス: フェーズ遷移の時系列分析用
CREATE INDEX IF NOT EXISTS idx_tasks_phase_timestamps
  ON tasks (ideation_at, progress_at, result_at);
