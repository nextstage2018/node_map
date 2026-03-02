-- Phase 16: ノード登録・カウント設計の変更
-- interactionCount カラム追加（能動的インタラクション回数）
-- understanding_level は後方互換で残すが、interactionCount から自動導出

-- 1. user_nodes テーブルに interaction_count カラムを追加
ALTER TABLE user_nodes
  ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0;

-- 2. 既存データの interaction_count を frequency からコピー
UPDATE user_nodes
  SET interaction_count = frequency
  WHERE interaction_count = 0 OR interaction_count IS NULL;

-- 3. node_source_contexts テーブルに trigger カラムを追加
ALTER TABLE node_source_contexts
  ADD COLUMN IF NOT EXISTS trigger TEXT;

-- 4. interaction_count のインデックス（フィルタリング用）
CREATE INDEX IF NOT EXISTS idx_user_nodes_interaction_count
  ON user_nodes (interaction_count DESC);

-- 5. trigger カラムのインデックス
CREATE INDEX IF NOT EXISTS idx_node_source_contexts_trigger
  ON node_source_contexts (trigger);

-- 注意: understanding_level カラムは削除しない（後方互換）
-- 新しいロジックでは interactionCount から自動導出:
--   1-2 → recognition
--   3-7 → understanding
--   8+  → mastery
