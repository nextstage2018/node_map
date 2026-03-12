-- v6.0: Gemini会議メモ連携用マイグレーション
-- meeting_records.source_type に 'gemini' を追加

-- 1. 既存のCHECK制約を削除
ALTER TABLE meeting_records DROP CONSTRAINT IF EXISTS meeting_records_source_type_check;

-- 2. 新しいCHECK制約を追加（'gemini' を含む）
ALTER TABLE meeting_records ADD CONSTRAINT meeting_records_source_type_check
  CHECK (source_type IN ('text', 'file', 'transcription', 'meetgeek', 'gemini'));

-- 確認用
SELECT conname, consrc FROM pg_constraint WHERE conrelid = 'meeting_records'::regclass AND contype = 'c';
