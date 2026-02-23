-- ============================================================
-- Phase 22: RLS (Row Level Security) + マルチユーザー対応
-- Supabase SQL Editorで実行してください
-- ============================================================

-- ============================================================
-- 1. ユーザー個人データテーブル — RLS有効化 + ポリシー
-- ============================================================

-- ----- unified_messages -----
ALTER TABLE unified_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON unified_messages FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own messages"
  ON unified_messages FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own messages"
  ON unified_messages FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own messages"
  ON unified_messages FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- tasks -----
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- task_conversations (親テーブル tasks 経由) -----
ALTER TABLE task_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task conversations"
  ON task_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_conversations.task_id
        AND tasks.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own task conversations"
  ON task_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_conversations.task_id
        AND tasks.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own task conversations"
  ON task_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_conversations.task_id
        AND tasks.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own task conversations"
  ON task_conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_conversations.task_id
        AND tasks.user_id = auth.uid()::text
    )
  );

-- ----- user_nodes -----
ALTER TABLE user_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own nodes"
  ON user_nodes FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own nodes"
  ON user_nodes FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own nodes"
  ON user_nodes FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own nodes"
  ON user_nodes FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- node_source_contexts (親テーブル user_nodes 経由) -----
ALTER TABLE node_source_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own node contexts"
  ON node_source_contexts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_nodes
      WHERE user_nodes.id = node_source_contexts.node_id
        AND user_nodes.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own node contexts"
  ON node_source_contexts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_nodes
      WHERE user_nodes.id = node_source_contexts.node_id
        AND user_nodes.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own node contexts"
  ON node_source_contexts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_nodes
      WHERE user_nodes.id = node_source_contexts.node_id
        AND user_nodes.user_id = auth.uid()::text
    )
  );

-- ----- checkpoints -----
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkpoints"
  ON checkpoints FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own checkpoints"
  ON checkpoints FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own checkpoints"
  ON checkpoints FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own checkpoints"
  ON checkpoints FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- node_edges -----
ALTER TABLE node_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own edges"
  ON node_edges FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own edges"
  ON node_edges FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own edges"
  ON node_edges FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own edges"
  ON node_edges FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- edge_tasks (親テーブル node_edges 経由) -----
ALTER TABLE edge_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own edge tasks"
  ON edge_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM node_edges
      WHERE node_edges.id = edge_tasks.edge_id
        AND node_edges.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own edge tasks"
  ON edge_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM node_edges
      WHERE node_edges.id = edge_tasks.edge_id
        AND node_edges.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own edge tasks"
  ON edge_tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM node_edges
      WHERE node_edges.id = edge_tasks.edge_id
        AND node_edges.user_id = auth.uid()::text
    )
  );

-- ----- node_clusters -----
ALTER TABLE node_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clusters"
  ON node_clusters FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own clusters"
  ON node_clusters FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own clusters"
  ON node_clusters FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own clusters"
  ON node_clusters FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- cluster_nodes (親テーブル node_clusters 経由) -----
ALTER TABLE cluster_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cluster nodes"
  ON cluster_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM node_clusters
      WHERE node_clusters.id = cluster_nodes.cluster_id
        AND node_clusters.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own cluster nodes"
  ON cluster_nodes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM node_clusters
      WHERE node_clusters.id = cluster_nodes.cluster_id
        AND node_clusters.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own cluster nodes"
  ON cluster_nodes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM node_clusters
      WHERE node_clusters.id = cluster_nodes.cluster_id
        AND node_clusters.user_id = auth.uid()::text
    )
  );

-- ----- jobs -----
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own jobs"
  ON jobs FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own jobs"
  ON jobs FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- seeds -----
ALTER TABLE seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own seeds"
  ON seeds FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own seeds"
  ON seeds FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own seeds"
  ON seeds FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own seeds"
  ON seeds FOR DELETE
  USING (auth.uid()::text = user_id);

-- ----- contact_persons (user_idカラム未実装、認証済み全員アクセス可) -----
ALTER TABLE contact_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts"
  ON contact_persons FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage contacts"
  ON contact_persons FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ----- contact_channels -----
ALTER TABLE contact_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact channels"
  ON contact_channels FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage contact channels"
  ON contact_channels FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 2. 組織共有テーブル（ナレッジマスタ）— 認証済み全員読み書き可
-- ============================================================

ALTER TABLE knowledge_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read domains" ON knowledge_domains FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write domains" ON knowledge_domains FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update domains" ON knowledge_domains FOR UPDATE USING (auth.role() = 'authenticated');

ALTER TABLE knowledge_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read fields" ON knowledge_fields FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write fields" ON knowledge_fields FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update fields" ON knowledge_fields FOR UPDATE USING (auth.role() = 'authenticated');

ALTER TABLE knowledge_master_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read entries" ON knowledge_master_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write entries" ON knowledge_master_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update entries" ON knowledge_master_entries FOR UPDATE USING (auth.role() = 'authenticated');

-- ----- node_master_links (ノードは個人データ) -----
ALTER TABLE node_master_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own node master links"
  ON node_master_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_nodes WHERE user_nodes.id = node_master_links.node_id AND user_nodes.user_id = auth.uid()::text));

CREATE POLICY "Users can insert own node master links"
  ON node_master_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_nodes WHERE user_nodes.id = node_master_links.node_id AND user_nodes.user_id = auth.uid()::text));

CREATE POLICY "Users can update own node master links"
  ON node_master_links FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_nodes WHERE user_nodes.id = node_master_links.node_id AND user_nodes.user_id = auth.uid()::text));

CREATE POLICY "Users can delete own node master links"
  ON node_master_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM user_nodes WHERE user_nodes.id = node_master_links.node_id AND user_nodes.user_id = auth.uid()::text));

-- ============================================================
-- 3. 追加テーブル（後続Phaseで作成済みのもの、存在時のみ適用）
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_node_selections') THEN
    EXECUTE 'ALTER TABLE weekly_node_selections ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "Users can manage own weekly selections" ON weekly_node_selections FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)$p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reactions') THEN
    EXECUTE 'ALTER TABLE reactions ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "Users can manage own reactions" ON reactions FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)$p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_sync_state') THEN
    EXECUTE 'ALTER TABLE inbox_sync_state ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "Users can manage own sync state" ON inbox_sync_state FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)$p$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_blocklist') THEN
    EXECUTE 'ALTER TABLE inbox_blocklist ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "Users can manage own blocklist" ON inbox_blocklist FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id)$p$;
  END IF;
END $$;

-- ============================================================
-- 完了: Phase 22 RLSポリシー設定
-- ============================================================
