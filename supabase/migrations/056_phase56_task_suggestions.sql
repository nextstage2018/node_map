-- Phase 56: 会議→タスク提案の一時保存テーブル
CREATE TABLE IF NOT EXISTS task_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  business_event_id UUID REFERENCES business_events(id) ON DELETE CASCADE,
  suggestions JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_suggestions_user ON task_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_suggestions_event ON task_suggestions(business_event_id);
