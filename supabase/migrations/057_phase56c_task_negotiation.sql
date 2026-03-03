-- Phase 56c: タスク修正提案＋秘書AI調整フロー
-- task_negotiations テーブル: メンバーからの修正リクエストとAI調整結果を管理

CREATE TABLE IF NOT EXISTS task_negotiations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requester_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  requester_name TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'deadline', 'priority', 'content', 'reassign', 'other'
  )),
  current_value TEXT,
  proposed_value TEXT NOT NULL,
  reason TEXT,
  ai_resolution JSONB,       -- AI調整結果 { applied: bool, adjustedValue, reasoning }
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_nego_task ON task_negotiations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_nego_status ON task_negotiations(status);
