-- =============================================================
-- NodeMap v3.4 Phase 1: 検討ツリー・タイムライン強化 テーブル設計
-- 3つの常設データ: open_issues / decision_log / meeting_agenda
-- 実行日: 2026-03-10
-- =============================================================

-- =============================================================
-- ① open_issues（未確定事項トラッカー）
-- 会議やメッセージで話題に出たが結論が出なかった事項を追跡
-- =============================================================

CREATE TABLE open_issues (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Core Content
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'stale')),

  -- Source Tracking
  source_type TEXT NOT NULL DEFAULT 'meeting'
    CHECK (source_type IN ('meeting', 'channel', 'manual')),
  source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  source_message_ids TEXT[] DEFAULT '{}',

  -- Decision Linking
  related_decision_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,

  -- Assignment & Priority
  assigned_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  priority_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
  priority_score NUMERIC(5,2) DEFAULT 0 CHECK (priority_score >= 0),

  -- Stagnation Tracking
  days_stagnant INT DEFAULT 0,
  last_mention_at TIMESTAMPTZ,

  -- Resolution Tracking
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  resolved_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  resolved_by_decision_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(project_id, title, source_type)
);

-- open_issues indexes
CREATE INDEX idx_open_issues_project_user ON open_issues(project_id, user_id);
CREATE INDEX idx_open_issues_status ON open_issues(status) WHERE status IN ('open', 'stale');
CREATE INDEX idx_open_issues_priority ON open_issues(priority_score DESC) WHERE status != 'resolved';
CREATE INDEX idx_open_issues_days_stagnant ON open_issues(days_stagnant DESC) WHERE status IN ('open', 'stale');
CREATE INDEX idx_open_issues_decision_node ON open_issues(related_decision_node_id) WHERE related_decision_node_id IS NOT NULL;
CREATE INDEX idx_open_issues_source_meeting ON open_issues(source_meeting_record_id) WHERE source_meeting_record_id IS NOT NULL;


-- =============================================================
-- ② decision_log（意思決定ログ）
-- 「決まったこと」の変遷を不変ログとして記録
-- 変更時は新レコード作成＋旧レコードを superseded に更新
-- =============================================================

CREATE TABLE decision_log (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Decision Content
  title TEXT NOT NULL,
  decision_content TEXT NOT NULL,
  rationale TEXT,

  -- Decision Tree Linking
  decision_tree_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,

  -- Change History Chain (self-referential)
  previous_decision_id UUID REFERENCES decision_log(id) ON DELETE SET NULL,
  change_reason TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'reverted', 'on_hold')),

  -- Source Tracking
  source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  source_type TEXT DEFAULT 'meeting'
    CHECK (source_type IN ('meeting', 'channel', 'manual')),

  -- Decision Maker
  decided_by_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,

  -- Implementation Status
  implementation_status TEXT DEFAULT 'pending'
    CHECK (implementation_status IN ('pending', 'in_progress', 'completed', 'blocked')),
  implementation_notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(project_id, title, created_at)
);

-- decision_log indexes
CREATE INDEX idx_decision_log_project_status ON decision_log(project_id, user_id, status) WHERE status = 'active';
CREATE INDEX idx_decision_log_project_date ON decision_log(project_id, created_at DESC);
CREATE INDEX idx_decision_log_previous ON decision_log(previous_decision_id) WHERE previous_decision_id IS NOT NULL;
CREATE INDEX idx_decision_log_tree_node ON decision_log(decision_tree_node_id) WHERE decision_tree_node_id IS NOT NULL;
CREATE INDEX idx_decision_log_source_meeting ON decision_log(source_meeting_record_id) WHERE source_meeting_record_id IS NOT NULL;
CREATE INDEX idx_decision_log_implementation ON decision_log(implementation_status) WHERE status = 'active';


-- =============================================================
-- ③ meeting_agenda（会議アジェンダ）
-- 次回会議で話すべきことを自動生成
-- open_issues + decision_log + タスク進捗から構成
-- =============================================================

CREATE TABLE meeting_agenda (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Agenda Metadata
  meeting_date DATE NOT NULL,
  title TEXT DEFAULT 'Agenda',

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'completed')),

  -- Linked Meeting Record (after meeting is held)
  linked_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,

  -- Agenda Items (JSONB array)
  -- Structure per item:
  -- {
  --   "id": "uuid string",
  --   "type": "open_issue" | "decision_review" | "task_progress" | "custom",
  --   "reference_id": "UUID of source record (open_issues/decision_log/tasks)",
  --   "title": "Item title",
  --   "description": "Supplementary description",
  --   "priority": "low" | "medium" | "high" | "critical",
  --   "assigned_contact_id": "contact_persons.id or null",
  --   "discussed": false,
  --   "resolution_note": null,
  --   "estimated_minutes": 15
  -- }
  items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Generation & Lifecycle
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Notes
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints: 1 project, 1 date = 1 agenda
  UNIQUE(project_id, meeting_date)
);

-- meeting_agenda indexes
CREATE INDEX idx_meeting_agenda_project_date ON meeting_agenda(project_id, meeting_date DESC);
CREATE INDEX idx_meeting_agenda_project_status ON meeting_agenda(project_id, status) WHERE status IN ('draft', 'confirmed');
CREATE INDEX idx_meeting_agenda_linked_meeting ON meeting_agenda(linked_meeting_record_id) WHERE linked_meeting_record_id IS NOT NULL;
CREATE INDEX idx_meeting_agenda_user_upcoming ON meeting_agenda(user_id, meeting_date) WHERE status IN ('draft', 'confirmed');
