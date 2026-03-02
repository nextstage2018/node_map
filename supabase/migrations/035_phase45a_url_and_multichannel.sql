-- Phase 45a: URL検出 + Slack/Chatwork マルチチャネル対応
-- drive_documents にリンク管理カラム追加
-- drive_file_staging にソースチャネルカラム追加

-- drive_documents: URLリンク管理
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS link_type TEXT; -- 'sheet' | 'doc' | 'drive' | null
ALTER TABLE drive_documents ADD COLUMN IF NOT EXISTS link_url TEXT;  -- 元URL保持
CREATE INDEX IF NOT EXISTS idx_drive_documents_link_type ON drive_documents(link_type) WHERE link_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_documents_link_url ON drive_documents(link_url) WHERE link_url IS NOT NULL;

-- drive_file_staging: ソースチャネル追跡
ALTER TABLE drive_file_staging ADD COLUMN IF NOT EXISTS source_channel TEXT DEFAULT 'email';
-- CHECK制約
ALTER TABLE drive_file_staging DROP CONSTRAINT IF EXISTS chk_staging_source_channel;
ALTER TABLE drive_file_staging ADD CONSTRAINT chk_staging_source_channel CHECK (source_channel IN ('email', 'slack', 'chatwork'));
