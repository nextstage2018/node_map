-- Phase 42d: 思考動線の記録 — thought_edges テーブル
-- AI会話でノードが出現するたびに、前のノードとの間に「思考の流れ」を記録する

CREATE TABLE IF NOT EXISTS thought_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'main',  -- main / detour
  edge_order INT,                           -- 動線の順序
  created_at TIMESTAMPTZ DEFAULT now(),
  -- task_id または seed_id のどちらかは必須
  CONSTRAINT chk_edge_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL)
);

-- UNIQUE制約: 同じタスク/種内で同じfrom→toは1回だけ
CREATE UNIQUE INDEX IF NOT EXISTS idx_te_task_edge
  ON thought_edges(task_id, from_node_id, to_node_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_te_seed_edge
  ON thought_edges(seed_id, from_node_id, to_node_id) WHERE seed_id IS NOT NULL;

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_te_task_id ON thought_edges(task_id);
CREATE INDEX IF NOT EXISTS idx_te_seed_id ON thought_edges(seed_id);
CREATE INDEX IF NOT EXISTS idx_te_user_id ON thought_edges(user_id);

-- RLS（service roleでアクセス）
ALTER TABLE thought_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on thought_edges"
  ON thought_edges FOR ALL
  USING (true)
  WITH CHECK (true);
