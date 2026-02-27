-- Phase 42f残り: 会話ジャンプ機能のための turn_id カラム追加
-- seed_conversations / task_conversations に会話ターンIDを追加し、
-- thought_task_nodes の source_conversation_id から辿れるようにする

-- seed_conversations に turn_id を追加
ALTER TABLE seed_conversations ADD COLUMN IF NOT EXISTS turn_id UUID DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_seed_conv_turn_id ON seed_conversations(turn_id);

-- task_conversations に turn_id を追加
ALTER TABLE task_conversations ADD COLUMN IF NOT EXISTS turn_id UUID DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_task_conv_turn_id ON task_conversations(turn_id);
