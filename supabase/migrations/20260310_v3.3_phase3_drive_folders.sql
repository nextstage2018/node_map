-- v3.3 Phase 3: Driveフォルダ再構築
-- drive_folders テーブルに用途別フォルダ管理用のカラムを追加
-- 実行環境: Supabase SQL Editor

-- resource_type は Phase 1 で追加済み（'job' | 'meeting' | 'milestone' | null）
-- 追加: milestone_id, job_id, task_id FK

ALTER TABLE drive_folders
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_drive_folders_milestone ON drive_folders(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_folders_job ON drive_folders(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_folders_task ON drive_folders(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_folders_resource_type ON drive_folders(resource_type) WHERE resource_type IS NOT NULL;

-- 複合インデックス（プロジェクト + resource_type で用途別フォルダ検索）
CREATE INDEX IF NOT EXISTS idx_drive_folders_project_resource ON drive_folders(project_id, resource_type) WHERE project_id IS NOT NULL;
