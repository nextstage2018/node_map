-- 032_calendar_task_integration.sql
-- カレンダー×タスク/ジョブ統合: スケジュール時刻 + カレンダーイベントID + タスクメンバー

-- ========================================
-- tasks テーブル: スケジュール時刻 + カレンダーイベントID
-- ========================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_start ON tasks(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_tasks_calendar_event ON tasks(calendar_event_id);

-- ========================================
-- jobs テーブル: スケジュール時刻 + カレンダーイベントID
-- ========================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_start ON jobs(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_jobs_calendar_event ON jobs(calendar_event_id);

-- ========================================
-- task_members テーブル: グループタスクのメンバー管理
-- ========================================
CREATE TABLE IF NOT EXISTS task_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  calendar_event_id TEXT,               -- メンバーごとのカレンダーイベントID
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_members_task ON task_members(task_id);
CREATE INDEX IF NOT EXISTS idx_task_members_user ON task_members(user_id);
