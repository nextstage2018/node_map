-- MeetGeek連携用スキーマ更新
-- 実行: Supabase SQL Editor で実行してください

-- 1. meeting_records.source_type に 'meetgeek' を追加
ALTER TABLE meeting_records DROP CONSTRAINT IF EXISTS meeting_records_source_type_check;
ALTER TABLE meeting_records ADD CONSTRAINT meeting_records_source_type_check
  CHECK (source_type IN ('text', 'file', 'transcription', 'meetgeek'));

-- 2. source_file_id を TEXT型に変更（MeetGeekのmeeting_idはUUID文字列）
-- 既存がUUID型の場合のみ実行
ALTER TABLE meeting_records ALTER COLUMN source_file_id TYPE TEXT USING source_file_id::TEXT;

-- 3. MeetGeek重複防止用インデックス
CREATE INDEX IF NOT EXISTS idx_meeting_records_source
  ON meeting_records(source_type, source_file_id)
  WHERE source_file_id IS NOT NULL;
