-- Phase 40b: 種にプロジェクト紐づけ
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seeds_project_id ON seeds(project_id);
