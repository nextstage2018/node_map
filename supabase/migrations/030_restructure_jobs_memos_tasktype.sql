-- Phase Restructure: ジョブ・アイデアメモ・タスク種類の再設計
-- 設計書: DESIGN_RESTRUCTURE.md

-- ========================================
-- 1. jobs テーブル（日常の簡易作業リスト）
-- ========================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done'
  source_message_id TEXT,                  -- インボックスから作成時
  source_channel TEXT,                     -- 'email' | 'slack' | 'chatwork'
  ai_draft TEXT,                           -- AIが生成した下書き/提案
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- ========================================
-- 2. idea_memos テーブル（断片的なアイデアメモ）
-- ========================================
CREATE TABLE IF NOT EXISTS idea_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idea_memos_user_id ON idea_memos(user_id);

-- メモのAI会話用
CREATE TABLE IF NOT EXISTS memo_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id UUID NOT NULL REFERENCES idea_memos(id) ON DELETE CASCADE,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  turn_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memo_conversations_memo_id ON memo_conversations(memo_id);

-- ========================================
-- 3. tasks テーブルに task_type カラム追加
-- ========================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'personal';
-- 'personal' | 'group'

-- ========================================
-- 4. thought_task_nodes にメモ紐づけ用カラム追加
-- ========================================
ALTER TABLE thought_task_nodes ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE CASCADE;

-- 既存のCHECK制約を更新（task_id OR seed_id OR memo_id のいずれかが必須）
ALTER TABLE thought_task_nodes DROP CONSTRAINT IF EXISTS chk_task_or_seed;
ALTER TABLE thought_task_nodes ADD CONSTRAINT chk_task_or_seed_or_memo
  CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL OR memo_id IS NOT NULL);

-- UNIQUE制約追加
ALTER TABLE thought_task_nodes ADD CONSTRAINT uq_thought_memo_node UNIQUE (memo_id, node_id);

-- ========================================
-- 5. thought_edges にメモ紐づけ用カラム追加
-- ========================================
ALTER TABLE thought_edges ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE CASCADE;

ALTER TABLE thought_edges DROP CONSTRAINT IF EXISTS chk_edge_task_or_seed;
ALTER TABLE thought_edges ADD CONSTRAINT chk_edge_task_or_seed_or_memo
  CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL OR memo_id IS NOT NULL);
