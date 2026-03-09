-- v3-topic-integration.sql
-- トピックベース統合：A-1/A-2対称化のためのスキーマ変更
-- 作成日: 2026-03-09
-- 目的: 議事録・チャネルメッセージ両方から検討ツリー・ナレッジを対称的に生成するための基盤

-- ============================================================
-- 1. decision_tree_nodes にソース追跡カラム追加
-- ============================================================

-- source_type: データの出自（meeting=議事録由来、channel=チャネル由来、hybrid=両方）
ALTER TABLE decision_tree_nodes
  ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('meeting', 'channel', 'hybrid'));

-- confidence_score: ソースの信頼度（meeting=0.85、channel=0.6、hybrid=加重平均）
ALTER TABLE decision_tree_nodes
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) DEFAULT 0.5
    CHECK (confidence_score >= 0 AND confidence_score <= 1.0);

-- source_message_ids: チャネル由来の場合、元メッセージIDを追跡
ALTER TABLE decision_tree_nodes
  ADD COLUMN IF NOT EXISTS source_message_ids TEXT[] DEFAULT '{}';

-- 既存ノード（会議録由来）のsource_typeをバックフィル
UPDATE decision_tree_nodes
  SET source_type = 'meeting',
      confidence_score = 0.85
  WHERE source_type IS NULL
    AND source_meeting_id IS NOT NULL;

-- ============================================================
-- 2. knowledge_master_entries に会議録ソース追跡カラム追加
-- ============================================================

-- source_meeting_record_id: 会議録からの抽出時に設定
ALTER TABLE knowledge_master_entries
  ADD COLUMN IF NOT EXISTS source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL;

-- ============================================================
-- 3. インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_decision_nodes_source_type
  ON decision_tree_nodes(source_type);

CREATE INDEX IF NOT EXISTS idx_decision_nodes_confidence
  ON decision_tree_nodes(confidence_score);

CREATE INDEX IF NOT EXISTS idx_knowledge_source_meeting
  ON knowledge_master_entries(source_meeting_record_id)
  WHERE source_meeting_record_id IS NOT NULL;
