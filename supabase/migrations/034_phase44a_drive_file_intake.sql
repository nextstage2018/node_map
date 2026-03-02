-- Phase 44a: Google Drive ファイル取り込み管理強化
-- ステージング（一時保管）+ 4階層フォルダ + AI分類

-- ========================================
-- drive_folders テーブル拡張（方向 + 年月レベル追加）
-- ========================================
ALTER TABLE drive_folders ADD COLUMN IF NOT EXISTS direction TEXT;     -- 'received' | 'submitted'
ALTER TABLE drive_folders ADD COLUMN IF NOT EXISTS year_month TEXT;    -- 'YYYY-MM'

-- 既存の CHECK 制約を削除して拡張版に置き換え
ALTER TABLE drive_folders DROP CONSTRAINT IF EXISTS check_hierarchy;
ALTER TABLE drive_folders ADD CONSTRAINT check_hierarchy CHECK (
  -- Level 1: 組織フォルダ
  (hierarchy_level = 1 AND organization_id IS NOT NULL AND project_id IS NULL AND direction IS NULL AND year_month IS NULL) OR
  -- Level 2: プロジェクトフォルダ
  (hierarchy_level = 2 AND organization_id IS NOT NULL AND project_id IS NOT NULL AND direction IS NULL AND year_month IS NULL) OR
  -- Level 3: 方向フォルダ（受領/提出）
  (hierarchy_level = 3 AND organization_id IS NOT NULL AND project_id IS NOT NULL AND direction IS NOT NULL AND year_month IS NULL) OR
  -- Level 4: 年月フォルダ
  (hierarchy_level = 4 AND organization_id IS NOT NULL AND project_id IS NOT NULL AND direction IS NOT NULL AND year_month IS NOT NULL)
);

-- Level 3/4 の UNIQUE インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_direction_user
  ON drive_folders(user_id, project_id, direction) WHERE hierarchy_level = 3;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_month_user
  ON drive_folders(user_id, project_id, direction, year_month) WHERE hierarchy_level = 4;

-- ========================================
-- drive_documents テーブル拡張（方向 + 書類種別）
-- ========================================
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'received';  -- 'received' | 'submitted'
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS document_type TEXT;                  -- '見積書' | '契約書' | '請求書' 等
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS year_month TEXT;                     -- 'YYYY-MM'
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS original_file_name TEXT;             -- リネーム前の元ファイル名

-- ========================================
-- drive_file_staging テーブル（一時保管エリア）
-- ========================================
CREATE TABLE IF NOT EXISTS drive_file_staging (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- ソース情報
  source_message_id TEXT,                    -- inbox_messages.id
  source_type TEXT NOT NULL DEFAULT 'received_email',
    -- 'received_email' | 'received_slack' | 'received_chatwork' | 'submitted_email'
  source_from_name TEXT,                     -- 送信者名
  source_from_address TEXT,                  -- 送信者アドレス
  source_subject TEXT,                       -- メール件名（分類の手がかり）

  -- ファイル情報
  file_name TEXT NOT NULL,                   -- 元のファイル名
  mime_type TEXT,
  file_size_bytes BIGINT,
  temp_drive_file_id TEXT,                   -- [NodeMap] 一時保管フォルダ内のDriveファイルID

  -- 自動推定された組織/プロジェクト
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  organization_name TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT,

  -- AI分類結果
  ai_document_type TEXT,                     -- '見積書' | '契約書' | '請求書' | '仕様書' | '議事録' | '報告書' | 'その他'
  ai_direction TEXT DEFAULT 'received',      -- 'received' | 'submitted'
  ai_year_month TEXT,                        -- 'YYYY-MM'
  ai_suggested_name TEXT,                    -- リネーム候補（例: 2026-03-02_見積書_v1.pdf）
  ai_confidence NUMERIC(3,2) DEFAULT 0.00,  -- 0.00〜1.00
  ai_reasoning TEXT,                         -- AI判定の理由

  -- ステータス管理
  status TEXT NOT NULL DEFAULT 'pending_review',
    -- 'pending_review'  = AI分類完了、ユーザー確認待ち
    -- 'approved'        = ユーザー承認済み、アップロード処理中
    -- 'uploaded'        = 最終フォルダにアップロード完了
    -- 'rejected'        = ユーザーが却下
    -- 'expired'         = 期限切れで自動削除

  -- ユーザー確定値（承認時にセット）
  confirmed_document_type TEXT,
  confirmed_direction TEXT,
  confirmed_year_month TEXT,
  confirmed_file_name TEXT,                  -- ユーザーが編集したファイル名

  -- 最終アップロード結果
  final_drive_file_id TEXT,
  final_drive_folder_id TEXT,
  final_drive_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staging_user ON drive_file_staging(user_id);
CREATE INDEX IF NOT EXISTS idx_staging_status ON drive_file_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_pending ON drive_file_staging(user_id, status) WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS idx_staging_message ON drive_file_staging(source_message_id);
CREATE INDEX IF NOT EXISTS idx_staging_created ON drive_file_staging(created_at);
