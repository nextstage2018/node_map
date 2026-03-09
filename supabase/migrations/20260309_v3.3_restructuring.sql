-- ============================================
-- NodeMap v3.3: プロジェクト中心リストラクチャリング
-- Phase 1: DBスキーマ拡張
-- 実行前に必ずバックアップを取ること
-- ============================================

-- ─── 1. project_members テーブル新規作成 ───
-- プロジェクト単位のメンバー管理（組織メンバーから引っ越し）
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project
  ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_contact
  ON project_members(contact_id);

-- RLS有効化
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_members_user_policy" ON project_members
  FOR ALL USING (user_id = auth.uid()::text);

-- ─── 2. drive_documents 拡張 ───
-- マイルストーン・ジョブでタグ検索するためのカラム追加
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_drive_documents_milestone
  ON drive_documents(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_documents_job
  ON drive_documents(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_documents_tags
  ON drive_documents USING GIN(tags);

-- ─── 3. drive_folders 拡張 ───
-- L3フォルダの用途区分（ジョブ/会議議事録/マイルストーン）
ALTER TABLE drive_folders
  ADD COLUMN IF NOT EXISTS resource_type TEXT;

COMMENT ON COLUMN drive_folders.resource_type IS 'v3.3: L3フォルダの用途。job/meeting/milestone。L1-L2はNULL';

-- ─── 4. organization_channels ソフト廃止 ───
-- 既存データは保持しつつ、新規はproject_channelsで管理
ALTER TABLE organization_channels
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS migrated_to_project_id UUID REFERENCES projects(id);

COMMENT ON COLUMN organization_channels.deprecated_at IS 'v3.3: project_channelsに移行した日時';
COMMENT ON COLUMN organization_channels.migrated_to_project_id IS 'v3.3: 移行先のプロジェクトID';

-- ─── 5. project_channelsにメディア数制約用のインデックス ───
-- 1プロジェクト=1チャネル/メディアを効率的にチェック
CREATE INDEX IF NOT EXISTS idx_project_channels_service_count
  ON project_channels(project_id, service_name);
