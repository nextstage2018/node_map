-- V2-D: business_events に meeting_record_id カラムを追加
-- 会議録との紐づけ用（ARCHITECTURE_V2.md セクション7.2）

ALTER TABLE business_events
  ADD COLUMN IF NOT EXISTS meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_business_events_meeting_record_id
  ON business_events(meeting_record_id)
  WHERE meeting_record_id IS NOT NULL;
