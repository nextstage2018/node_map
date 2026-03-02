-- ============================================================
-- Phase 7-10 追加スキーマ（004）
-- ジョブ・種ボックス・チェックポイント・ナレッジマスタ・コンタクト
-- + 既存テーブルへのカラム追加（エッジのflowType/direction等）
-- ============================================================

-- ===== Phase 7: ジョブテーブル =====
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('email_reply', 'document_update', 'data_entry', 'routine_admin')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('draft', 'proposed', 'executed', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  draft_content TEXT,
  source_message_id TEXT,
  source_channel TEXT CHECK (source_channel IN ('email', 'slack', 'chatwork')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_updated ON jobs(updated_at DESC);

CREATE TRIGGER trigger_update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===== Phase 7: 種ボックステーブル =====
CREATE TABLE IF NOT EXISTS seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source_channel TEXT CHECK (source_channel IN ('email', 'slack', 'chatwork')),
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  structured JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seeds_status ON seeds(status);
CREATE INDEX idx_seeds_created ON seeds(created_at DESC);

-- ===== Phase 8: ナレッジマスタ - 領域テーブル =====
CREATE TABLE IF NOT EXISTS knowledge_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== Phase 8: ナレッジマスタ - 分野テーブル =====
CREATE TABLE IF NOT EXISTS knowledge_fields (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_fields_domain ON knowledge_fields(domain_id);

-- ===== Phase 8: ナレッジマスタ - マスタキーワードテーブル =====
CREATE TABLE IF NOT EXISTS knowledge_master_entries (
  id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL REFERENCES knowledge_fields(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  synonyms TEXT[] DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_entries_field ON knowledge_master_entries(field_id);
CREATE INDEX idx_knowledge_entries_label ON knowledge_master_entries(label);

-- ===== Phase 8: ノード⇔マスタリンクテーブル =====
CREATE TABLE IF NOT EXISTS node_master_links (
  node_id UUID NOT NULL REFERENCES user_nodes(id) ON DELETE CASCADE,
  master_entry_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (node_id, master_entry_id)
);

-- ===== Phase 9: コンタクトテーブル =====
CREATE TABLE IF NOT EXISTS contact_persons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (relationship_type IN ('internal', 'client', 'partner')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  main_channel TEXT CHECK (main_channel IN ('email', 'slack', 'chatwork')),
  associated_node_ids TEXT[] DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_persons_relationship ON contact_persons(relationship_type);

CREATE TRIGGER trigger_update_contact_persons_updated_at
  BEFORE UPDATE ON contact_persons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===== Phase 9: コンタクトチャネルテーブル =====
CREATE TABLE IF NOT EXISTS contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'chatwork')),
  address TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 0,
  UNIQUE (contact_id, channel, address)
);

CREATE INDEX idx_contact_channels_contact ON contact_channels(contact_id);

-- ===== Phase 10: チェックポイントテーブル =====
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  node_ids TEXT[] DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  summary TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_task ON checkpoints(task_id);
CREATE INDEX idx_checkpoints_user ON checkpoints(user_id);

-- ===== Phase 10: 既存テーブルへのカラム追加 =====

-- node_edges に flowType と direction を追加
ALTER TABLE node_edges
  ADD COLUMN IF NOT EXISTS flow_type TEXT DEFAULT 'main'
    CHECK (flow_type IN ('main', 'tributary'));

ALTER TABLE node_edges
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'forward'
    CHECK (direction IN ('forward', 'backward', 'bidirectional'));

ALTER TABLE node_edges
  ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES checkpoints(id) ON DELETE SET NULL;

-- user_nodes に domain_id と field_id のキャッシュを追加
ALTER TABLE user_nodes
  ADD COLUMN IF NOT EXISTS domain_id TEXT;

ALTER TABLE user_nodes
  ADD COLUMN IF NOT EXISTS field_id TEXT;

-- user_nodes に relationship_type と contact_id を追加（人物ノード用）
ALTER TABLE user_nodes
  ADD COLUMN IF NOT EXISTS relationship_type TEXT
    CHECK (relationship_type IN ('internal', 'client', 'partner'));

ALTER TABLE user_nodes
  ADD COLUMN IF NOT EXISTS contact_id TEXT;

-- unified_messages に user_id を追加
ALTER TABLE unified_messages
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- tasks に user_id を追加
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- jobs に user_id を追加（存在しない場合のみ）
-- ※ jobs テーブルは上で新規作成しているので、ALTER で追加
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- seeds に user_id を追加
ALTER TABLE seeds
  ADD COLUMN IF NOT EXISTS user_id TEXT;
