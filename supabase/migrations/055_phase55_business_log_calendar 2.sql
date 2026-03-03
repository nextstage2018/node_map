-- Phase 55: ビジネスログ×カレンダー連携
-- business_events にカレンダー連携カラム追加

ALTER TABLE business_events ADD COLUMN IF NOT EXISTS source_calendar_event_id TEXT;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS meeting_notes_url TEXT;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS event_start TIMESTAMPTZ;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS event_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_business_events_calendar ON business_events(source_calendar_event_id);
