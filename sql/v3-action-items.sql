-- v3.0: task_suggestions テーブルに meeting_record_id を追加
-- 議事録AI解析から直接タスク提案を生成するため

ALTER TABLE task_suggestions
  ADD COLUMN IF NOT EXISTS meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_task_suggestions_meeting ON task_suggestions(meeting_record_id);
