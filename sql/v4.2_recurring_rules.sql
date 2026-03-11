-- v4.2 繰り返しルール
-- 1. project_recurring_rules テーブル新設
-- 2. meeting_records に recurring_rule_id カラム追加

-- ========================================
-- project_recurring_rules: 繰り返しルール
-- ========================================
CREATE TABLE IF NOT EXISTS project_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('meeting', 'task', 'job')),
  title TEXT NOT NULL,
  rrule TEXT NOT NULL,                    -- iCal RRULE形式
  lead_days INTEGER NOT NULL DEFAULT 7,   -- 事前生成日数
  calendar_sync BOOLEAN NOT NULL DEFAULT false,
  auto_create BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',            -- テンプレート情報等
  enabled BOOLEAN NOT NULL DEFAULT true,
  occurrence_count INTEGER NOT NULL DEFAULT 0,  -- 累計実行回数
  last_generated_at TIMESTAMPTZ DEFAULT NULL,   -- 最後に自動生成した日時
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_project ON project_recurring_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_enabled ON project_recurring_rules(enabled) WHERE enabled = true;

COMMENT ON TABLE project_recurring_rules IS 'v4.2: プロジェクト単位の繰り返しルール（会議/タスク/ジョブ）';
COMMENT ON COLUMN project_recurring_rules.rrule IS 'iCal RRULE形式（例: FREQ=WEEKLY;BYDAY=MO）';
COMMENT ON COLUMN project_recurring_rules.lead_days IS '事前生成日数（この日数前にタスク/ジョブを自動生成）';
COMMENT ON COLUMN project_recurring_rules.occurrence_count IS '累計実行回数（「第N回 〇〇」のカウント）';

-- ========================================
-- meeting_records に recurring_rule_id カラム追加
-- ========================================
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS recurring_rule_id UUID REFERENCES project_recurring_rules(id) ON DELETE SET NULL DEFAULT NULL;

COMMENT ON COLUMN meeting_records.recurring_rule_id IS 'v4.2: 定例会ルールとの紐づけ';
