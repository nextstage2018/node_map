-- Phase 40c: プロジェクトに組織紐づけ
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
