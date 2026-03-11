-- v4.1 カレンダー連携強化
-- 1. tasksテーブルに工数管理カラム追加
-- 2. meeting_recordsテーブルにcalendar_event_idカラム追加

-- ========================================
-- tasks: 工数管理カラム追加
-- ========================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(6,2) DEFAULT NULL;

COMMENT ON COLUMN tasks.estimated_hours IS 'v4.1: 見積もり工数（時間）';
COMMENT ON COLUMN tasks.actual_hours IS 'v4.1: 実績工数（時間）';

-- ========================================
-- meeting_records: カレンダー連携カラム追加
-- ========================================
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT DEFAULT NULL;

COMMENT ON COLUMN meeting_records.calendar_event_id IS 'v4.1: Googleカレンダーのイベント ID';
