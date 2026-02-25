-- Phase 30a: マスターデータ基盤 — 組織・プロジェクトメンバー
-- ============================================================

-- 1. organizations テーブル（組織マスター）
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_organizations_user_id ON organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_policy ON organizations
  FOR ALL USING (auth.uid()::text = user_id);

-- 2. contacts テーブルへのカラム追加
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_team_member BOOLEAN DEFAULT false;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_is_team_member ON contacts(is_team_member);

-- 3. project_members テーブル
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  contact_id UUID REFERENCES contacts(id),
  role TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_contact_id ON project_members(contact_id);

-- RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_members_policy ON project_members
  FOR ALL USING (auth.uid()::text = user_id);
