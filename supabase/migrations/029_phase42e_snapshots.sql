-- Phase 42e: スナップショット（出口想定・着地点）
-- タスク作成時と完了時のノード群＋サマリーを記録し、思考の変遷を可視化する

CREATE TABLE IF NOT EXISTS thought_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,  -- 'initial_goal' | 'final_landing'
  node_ids TEXT[],              -- knowledge_master_entries.id の配列（TEXT型）
  summary TEXT,                 -- AI要約テキスト
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_task_id ON thought_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON thought_snapshots(snapshot_type);
