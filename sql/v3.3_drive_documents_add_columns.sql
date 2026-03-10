-- v3.3: drive_documents に milestone_id, job_id, tags カラムを追加
-- 実行前にバックアップ推奨

-- 1. milestone_id カラム追加
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

-- 2. job_id カラム追加
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- 3. tags カラム追加（TEXT配列）
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 4. インデックス追加
CREATE INDEX IF NOT EXISTS idx_drive_documents_milestone_id ON drive_documents(milestone_id);
CREATE INDEX IF NOT EXISTS idx_drive_documents_job_id ON drive_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_drive_documents_tags ON drive_documents USING GIN(tags);
