-- Phase: Google Drive ドキュメント管理統合
-- drive_folders: 組織/プロジェクトとDriveフォルダのマッピング
-- drive_documents: ドキュメント追跡

-- ========================================
-- drive_folders テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS drive_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  drive_folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  parent_drive_folder_id TEXT,
  hierarchy_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_hierarchy CHECK (
    (hierarchy_level = 1 AND organization_id IS NOT NULL AND project_id IS NULL) OR
    (hierarchy_level = 2 AND organization_id IS NOT NULL AND project_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_drive_folders_user ON drive_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_org ON drive_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_project ON drive_folders(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_drive_id ON drive_folders(drive_folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_org_user ON drive_folders(user_id, organization_id) WHERE hierarchy_level = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_project_user ON drive_folders(user_id, project_id) WHERE hierarchy_level = 2;

-- ========================================
-- drive_documents テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS drive_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  drive_file_id TEXT NOT NULL,
  drive_folder_id TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  drive_url TEXT,
  web_view_link TEXT,
  source_channel TEXT,
  source_message_id TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_shared BOOLEAN DEFAULT false,
  share_link TEXT
);

CREATE INDEX IF NOT EXISTS idx_drive_docs_user ON drive_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_docs_org ON drive_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_drive_docs_project ON drive_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_drive_docs_drive_file ON drive_documents(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_drive_docs_message ON drive_documents(source_message_id);
CREATE INDEX IF NOT EXISTS idx_drive_docs_uploaded ON drive_documents(uploaded_at);

-- ========================================
-- inbox_messages に drive_synced カラム追加
-- ========================================
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS drive_synced BOOLEAN DEFAULT false;
