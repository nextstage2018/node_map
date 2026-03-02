-- Phase 50a: タスクカテゴリ拡張 + プロジェクト種別マスタ
-- 実行: Supabase SQL Editor で手動実行

-- ===== 新テーブル: プロジェクト種別マスタ =====
CREATE TABLE IF NOT EXISTS project_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,              -- 「広告運用」「Web制作」等
  description TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_types_user_id ON project_types(user_id);

-- ===== 新テーブル: 種別ごとの定型タスクテンプレート =====
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_type_id UUID NOT NULL REFERENCES project_types(id) ON DELETE CASCADE,
  title TEXT NOT NULL,             -- 「レポート提出」等
  description TEXT,
  estimated_hours NUMERIC(5,1),    -- 作業見積時間（例: 2.0）
  recurrence_type TEXT,            -- null / 'weekly' / 'biweekly' / 'monthly'
  recurrence_day INT,              -- 曜日(0=日-6=土) or 日(1-31)
  sort_order INT DEFAULT 0,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_project_type_id ON task_templates(project_type_id);

-- ===== tasksテーブル拡張 =====
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_category TEXT DEFAULT 'individual';
  -- 'routine'(定型) / 'individual'(個別) / 'team'(チーム)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,1);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_type TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_day INT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_contact_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_task_category ON tasks(task_category);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_template_id ON tasks(template_id);

-- ===== projectsテーブル拡張 =====
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type_id UUID REFERENCES project_types(id) ON DELETE SET NULL;
