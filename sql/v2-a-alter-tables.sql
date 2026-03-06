-- ============================================================
-- V2-A: 既存4テーブルの変更（カラム追加）
-- 注意: v2-a-create-tables.sql を先に実行すること
--       （milestones, meeting_records テーブルへのFK参照あり）
-- ============================================================

-- tasks テーブル: milestone_id 追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

-- jobs テーブル: project_id 追加
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- thought_task_nodes テーブル: milestone_id 追加
ALTER TABLE thought_task_nodes ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

-- business_events テーブル: meeting_record_id 追加
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL;
