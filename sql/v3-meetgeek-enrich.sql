-- MeetGeek連携強化: meeting_records テーブル拡張
-- 実行: Supabase SQL Editor で実行してください

-- 1. 参加者情報（メール一覧 + 表示名）
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]'::jsonb;

-- 2. 会議開始・終了時刻（正確な時刻）
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS meeting_start_at TIMESTAMPTZ;
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS meeting_end_at TIMESTAMPTZ;

-- 3. MeetGeekメタデータ（host, source, join_link, language, highlights等）
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4. ハイライト（アクションアイテム・キーポイント等）
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN meeting_records.participants IS 'MeetGeek参加者情報 [{email, name}]';
COMMENT ON COLUMN meeting_records.meeting_start_at IS '会議開始時刻（UTC）';
COMMENT ON COLUMN meeting_records.meeting_end_at IS '会議終了時刻（UTC）';
COMMENT ON COLUMN meeting_records.metadata IS 'MeetGeekメタデータ {host_email, source, join_link, language, template, team_ids, event_id}';
COMMENT ON COLUMN meeting_records.highlights IS 'MeetGeekハイライト [{highlightText, label}]';
