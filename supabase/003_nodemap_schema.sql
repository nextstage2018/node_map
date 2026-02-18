-- Phase 4: データ収集基盤（点・線・面）スキーマ
-- 設計書セクション3のデータ構造に基づく

-- ===== ノード（点）テーブル =====
-- ユーザーが触れた知識・情報の単位
CREATE TABLE user_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('keyword', 'person', 'project')),
  user_id TEXT NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 1,
  understanding_level TEXT NOT NULL DEFAULT 'recognition'
    CHECK (understanding_level IN ('recognition', 'understanding', 'mastery')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同一ユーザー内で同じラベル・タイプの重複を防ぐ
  UNIQUE (user_id, label, type)
);

-- ===== ノード出現コンテキストテーブル =====
-- ノードがどこで出現したかの記録
CREATE TABLE node_source_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES user_nodes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('message', 'task_conversation', 'task_ideation', 'task_result')),
  source_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('received', 'sent', 'self')),
  phase TEXT CHECK (phase IN ('ideation', 'progress', 'result')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== エッジ（線）テーブル =====
-- ノード間の思考のつながり
CREATE TABLE node_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES user_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES user_nodes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  edge_type TEXT NOT NULL DEFAULT 'co_occurrence'
    CHECK (edge_type IN ('co_occurrence', 'causal', 'sequence')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同一ユーザーの同じノードペアの重複を防ぐ
  UNIQUE (user_id, source_node_id, target_node_id, edge_type)
);

-- エッジに関連するタスクの中間テーブル
CREATE TABLE edge_tasks (
  edge_id UUID NOT NULL REFERENCES node_edges(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (edge_id, task_id)
);

-- ===== クラスター（面）テーブル =====
-- タスクに対する認識範囲
CREATE TABLE node_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  cluster_type TEXT NOT NULL CHECK (cluster_type IN ('ideation', 'result')),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同一タスク・ユーザーの同一タイプは1つ
  UNIQUE (task_id, user_id, cluster_type)
);

-- クラスターに含まれるノードの中間テーブル
CREATE TABLE cluster_nodes (
  cluster_id UUID NOT NULL REFERENCES node_clusters(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES user_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, node_id)
);

-- ===== インデックス =====
CREATE INDEX idx_user_nodes_user ON user_nodes(user_id);
CREATE INDEX idx_user_nodes_type ON user_nodes(type);
CREATE INDEX idx_user_nodes_level ON user_nodes(understanding_level);
CREATE INDEX idx_user_nodes_frequency ON user_nodes(frequency DESC);
CREATE INDEX idx_user_nodes_label ON user_nodes(label);

CREATE INDEX idx_node_contexts_node ON node_source_contexts(node_id);
CREATE INDEX idx_node_contexts_source ON node_source_contexts(source_type, source_id);

CREATE INDEX idx_node_edges_user ON node_edges(user_id);
CREATE INDEX idx_node_edges_source ON node_edges(source_node_id);
CREATE INDEX idx_node_edges_target ON node_edges(target_node_id);

CREATE INDEX idx_node_clusters_task ON node_clusters(task_id);
CREATE INDEX idx_node_clusters_user ON node_clusters(user_id);

-- ===== 自動更新トリガー =====
CREATE TRIGGER trigger_update_user_nodes_updated_at
  BEFORE UPDATE ON user_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_node_edges_updated_at
  BEFORE UPDATE ON node_edges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
