-- Phase 42a: 思考マップ基盤 — ナレッジマスタ拡張 + thought_task_nodes テーブル
-- AI会話からのキーワード自動抽出 → ナレッジマスタへのノード登録 → タスク/種との紐づけ

-- ==============================
-- 1. knowledge_master_entries にカラム追加（思考ノードとしての拡張）
-- ==============================
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS category TEXT;
  -- analytics / tool / comm / tech / concept etc.
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_type TEXT;
  -- seed / message / task / manual
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_id TEXT;
  -- 供給元のID（seed_id / message_id / task_id）
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_conversation_id UUID;
  -- どの会話ターンで生まれたか
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;
  -- 抽出日時
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
  -- 本人が承認したか
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
  -- 承認日時

-- インデックス
CREATE INDEX IF NOT EXISTS idx_kme_source_type ON knowledge_master_entries(source_type);
CREATE INDEX IF NOT EXISTS idx_kme_is_confirmed ON knowledge_master_entries(is_confirmed);

-- ==============================
-- 2. thought_task_nodes テーブル新設（タスク/種とナレッジノードの紐づけ）
-- ==============================
CREATE TABLE IF NOT EXISTS thought_task_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  appear_order INT,                   -- そのタスク/種内で何番目に出てきたか
  is_main_route BOOLEAN,              -- メインルートか飛地か（完了時に確定）
  appear_phase TEXT,                   -- seed / ideation / progress / result
  source_conversation_id UUID,         -- どの会話ターンで生まれたか
  created_at TIMESTAMPTZ DEFAULT now(),
  -- task_id または seed_id のどちらかは必須（CHECK制約）
  CONSTRAINT chk_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL)
);

-- UNIQUE制約: 同じタスク/種に同じノードは1回だけ
CREATE UNIQUE INDEX IF NOT EXISTS idx_ttn_task_node ON thought_task_nodes(task_id, node_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ttn_seed_node ON thought_task_nodes(seed_id, node_id) WHERE seed_id IS NOT NULL;

-- 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_ttn_task_id ON thought_task_nodes(task_id);
CREATE INDEX IF NOT EXISTS idx_ttn_seed_id ON thought_task_nodes(seed_id);
CREATE INDEX IF NOT EXISTS idx_ttn_node_id ON thought_task_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_ttn_user_id ON thought_task_nodes(user_id);

-- RLS無効化（service roleでアクセス）
ALTER TABLE thought_task_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on thought_task_nodes"
  ON thought_task_nodes FOR ALL
  USING (true)
  WITH CHECK (true);
