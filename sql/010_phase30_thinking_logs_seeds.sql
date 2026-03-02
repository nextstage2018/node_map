-- ============================================================
-- Phase 30: 思考ログテーブル & 種ボックス拡張
-- ============================================================

-- 思考ログテーブル
CREATE TABLE IF NOT EXISTS thinking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'observation',
  linked_node_id UUID REFERENCES user_nodes(id) ON DELETE SET NULL,
  linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  linked_seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX idx_thinking_logs_user ON thinking_logs(user_id);
CREATE INDEX idx_thinking_logs_created ON thinking_logs(created_at DESC);
CREATE INDEX idx_thinking_logs_type ON thinking_logs(log_type);

-- seedsテーブルにtags追加
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- タグ検索用インデックス（GIN）
CREATE INDEX IF NOT EXISTS idx_seeds_tags ON seeds USING GIN(tags);

-- RLS
ALTER TABLE thinking_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY thinking_logs_user_policy ON thinking_logs
  FOR ALL USING (auth.uid()::text = user_id);
