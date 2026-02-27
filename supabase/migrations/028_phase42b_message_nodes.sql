-- Phase 42b: 送受信メッセージからのノード抽出
-- thought_task_nodes にメッセージIDを追加し、メッセージ由来のノードも統合管理する

-- thought_task_nodes に message_id カラム追加
ALTER TABLE thought_task_nodes ADD COLUMN IF NOT EXISTS message_id TEXT;

-- CHECK制約を更新（task_id / seed_id / message_id のいずれか必須）
ALTER TABLE thought_task_nodes DROP CONSTRAINT IF EXISTS chk_task_or_seed;
ALTER TABLE thought_task_nodes ADD CONSTRAINT chk_task_or_seed_or_message
  CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL OR message_id IS NOT NULL);

-- メッセージ+ノードのUNIQUE制約
ALTER TABLE thought_task_nodes ADD CONSTRAINT uq_thought_message_node
  UNIQUE (message_id, node_id);

-- メッセージIDインデックス
CREATE INDEX IF NOT EXISTS idx_thought_message_id ON thought_task_nodes(message_id);

-- inbox_messages に処理済みフラグ追加
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS keywords_extracted BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_inbox_keywords_extracted ON inbox_messages(keywords_extracted);
