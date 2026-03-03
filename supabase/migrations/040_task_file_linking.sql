-- Phase 50: タスクとドキュメントの紐づけ
-- drive_documents に task_id を追加（ON DELETE SET NULL: タスク削除してもファイルは残る）

ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drive_docs_task ON drive_documents(task_id);
