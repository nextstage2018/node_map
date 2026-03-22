-- Multi-Assignee: task_assignees テーブル作成
-- 1タスクに複数の担当者を紐づけるジョインテーブル

CREATE TABLE IF NOT EXISTS task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, contact_id)
);

CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_contact ON task_assignees(contact_id);

-- 既存の assigned_contact_id をマイグレーション（既存データの移行）
INSERT INTO task_assignees (task_id, contact_id)
SELECT id, assigned_contact_id
FROM tasks
WHERE assigned_contact_id IS NOT NULL
ON CONFLICT (task_id, contact_id) DO NOTHING;
