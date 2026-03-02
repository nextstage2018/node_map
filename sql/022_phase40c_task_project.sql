-- Phase 40c: タスクにプロジェクト紐づけ + seed_id
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_seed_id ON tasks(seed_id);
