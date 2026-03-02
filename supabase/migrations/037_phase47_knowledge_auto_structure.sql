-- Phase 47: ナレッジ自動構造化
-- AIがキーワードを自動クラスタリングし、領域/分野の構造を提案するための基盤

-- 1. クラスタリング提案テーブル
CREATE TABLE IF NOT EXISTS knowledge_clustering_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- 提案メタデータ
  status TEXT DEFAULT 'pending',  -- pending / approved / rejected / partially_applied

  -- AI クラスタリング結果（JSON）
  proposed_structure JSONB,  -- { domains: [{label, description, fields: [{label, entries: [{id, label}]}]}] }
  clustering_confidence FLOAT,  -- 0.0-1.0
  ai_reasoning TEXT,  -- AI説明テキスト

  -- ソースデータ
  entry_ids TEXT[],  -- 対象キーワードID群
  entry_count INT,

  -- ユーザーインタラクション
  approved_entries TEXT[],
  rejected_entries TEXT[],

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,

  -- 重複防止
  proposal_week TEXT  -- '2026-W10' ISO週番号
);

CREATE INDEX IF NOT EXISTS idx_clustering_proposals_user ON knowledge_clustering_proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_clustering_proposals_status ON knowledge_clustering_proposals(status);
CREATE INDEX IF NOT EXISTS idx_clustering_proposals_week ON knowledge_clustering_proposals(proposal_week);

-- 2. knowledge_master_entries にカラム追加
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS
  created_via TEXT DEFAULT 'manual';  -- 'manual' / 'ai_conversation' / 'message_batch' / 'auto_proposal'
