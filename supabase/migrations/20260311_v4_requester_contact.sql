-- v4.0: タスクに依頼者（requester_contact_id）を追加
-- 依頼者 = メッセージ送信者、担当者 = TO先（assigned_contact_id は既存）

-- 1. requester_contact_id カラム追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requester_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL;

-- 2. インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_requester ON tasks(requester_contact_id);

-- 3. source_message_id がなければ追加（提案元メッセージ追跡用）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_message_id TEXT;

-- 4. source_type がなければ追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type TEXT;
