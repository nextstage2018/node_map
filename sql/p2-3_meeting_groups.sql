-- P2-3 Phase 1: meeting_groups テーブル作成 + 既存テーブルへのカラム追加
-- 実行先: Supabase SQL Editor
-- 日付: 2026-03-19

-- =============================================
-- 1. meeting_groups テーブル作成
-- =============================================
CREATE TABLE IF NOT EXISTS meeting_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- グループ名（例: 「戦略MTG」「制作進行MTG」）
  description TEXT,                       -- グループの説明
  color TEXT DEFAULT 'blue',              -- UI表示色（blue/green/purple/amber/rose）
  sort_order INTEGER NOT NULL DEFAULT 0,  -- 表示順
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_groups_project ON meeting_groups(project_id);

-- =============================================
-- 2. project_recurring_rules に meeting_group_id を追加
-- =============================================
ALTER TABLE project_recurring_rules
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- =============================================
-- 3. meeting_records に meeting_group_id を追加
-- =============================================
ALTER TABLE meeting_records
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- =============================================
-- 4. decision_trees に meeting_group_id を追加
-- =============================================
ALTER TABLE decision_trees
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- =============================================
-- 5. meeting_agenda に meeting_group_id を追加 + UNIQUE制約変更
-- =============================================
ALTER TABLE meeting_agenda
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- 既存のUNIQUE制約を削除（存在する場合）
ALTER TABLE meeting_agenda DROP CONSTRAINT IF EXISTS meeting_agenda_project_id_meeting_date_key;

-- 新しいUNIQUE制約: (project_id, meeting_date, meeting_group_id)
-- NULLS NOT DISTINCT: meeting_group_id が NULL の場合も1日1アジェンダ制約を維持
ALTER TABLE meeting_agenda
  ADD CONSTRAINT meeting_agenda_project_date_group_key
  UNIQUE NULLS NOT DISTINCT (project_id, meeting_date, meeting_group_id);
