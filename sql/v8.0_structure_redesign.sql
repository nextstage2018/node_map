-- v8.0: 構造再設計 — テーマ廃止・MS週次サイクル・定期作業・アジェンダ強化
-- Phase 1: テーマ廃止 + MS自動提案 + 会議サイクル設定

-- ============================================
-- 1. projectsテーブルに会議サイクル設定を追加
-- ============================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS meeting_cycle_day INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS meeting_cycle_enabled BOOLEAN DEFAULT true;

-- meeting_cycle_day: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土（デフォルト1=月曜）
-- meeting_cycle_enabled: 週次サイクル有効/無効

COMMENT ON COLUMN projects.meeting_cycle_day IS '週次会議の曜日（0=日〜6=土、デフォルト1=月曜）';
COMMENT ON COLUMN projects.meeting_cycle_enabled IS '週次サイクルの有効/無効';

-- ============================================
-- 2. milestonesテーブルにソース追跡カラムを追加
-- ============================================
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

COMMENT ON COLUMN milestones.source_meeting_record_id IS '自動提案元の会議録ID';
COMMENT ON COLUMN milestones.auto_generated IS 'AI自動提案から作成されたか';

CREATE INDEX IF NOT EXISTS idx_milestones_source_meeting ON milestones(source_meeting_record_id);

-- ============================================
-- 3. milestone_suggestionsテーブル新設
-- ============================================
CREATE TABLE IF NOT EXISTS milestone_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  success_criteria TEXT,              -- 達成条件
  target_date DATE,                   -- 目標日（通常1週間後）
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  related_task_titles JSONB DEFAULT '[]'::jsonb,  -- 関連タスク名の配列
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  accepted_milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,  -- 承認後に作成されたMS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ms_suggestions_project ON milestone_suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_ms_suggestions_status ON milestone_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ms_suggestions_meeting ON milestone_suggestions(meeting_record_id);
