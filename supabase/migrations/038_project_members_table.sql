-- Phase 48: project_members テーブル新設（コンタクトとプロジェクトの紐づけ）
CREATE TABLE IF NOT EXISTS project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  role TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_contact_id ON project_members(contact_id);
