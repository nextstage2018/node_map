-- Phase 30d: ビジネスログ基盤 — プロジェクト・グループ・ビジネスイベント
-- ============================================================

-- 1. projects テーブル
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_policy ON projects
  FOR ALL USING (auth.uid()::text = user_id);

-- 2. groups テーブル
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_groups_user_id ON groups(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_project_id ON groups(project_id);

-- RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_policy ON groups
  FOR ALL USING (auth.uid()::text = user_id);

-- 3. business_events テーブル
CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  event_type TEXT DEFAULT 'note',
  project_id UUID REFERENCES projects(id),
  group_id UUID REFERENCES groups(id),
  contact_id TEXT REFERENCES contact_persons(id),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_business_events_user_id ON business_events(user_id);
CREATE INDEX IF NOT EXISTS idx_business_events_project_id ON business_events(project_id);
CREATE INDEX IF NOT EXISTS idx_business_events_group_id ON business_events(group_id);
CREATE INDEX IF NOT EXISTS idx_business_events_contact_id ON business_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_business_events_event_type ON business_events(event_type);
CREATE INDEX IF NOT EXISTS idx_business_events_created_at ON business_events(created_at DESC);

-- RLS
ALTER TABLE business_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_events_policy ON business_events
  FOR ALL USING (auth.uid()::text = user_id);
