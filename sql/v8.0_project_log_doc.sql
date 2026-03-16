-- v8.0: プロジェクトログDoc対応
-- projects テーブルに log_document_id カラム追加

-- Google Docs で作成されるプロジェクトログドキュメントのID
ALTER TABLE projects ADD COLUMN IF NOT EXISTS log_document_id TEXT;
-- ドキュメントのURL（webViewLink）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS log_document_url TEXT;

COMMENT ON COLUMN projects.log_document_id IS 'Google Docs プロジェクトログのドキュメントID';
COMMENT ON COLUMN projects.log_document_url IS 'Google Docs プロジェクトログのURL';
