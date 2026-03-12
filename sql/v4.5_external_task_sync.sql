-- v4.5: 外部タスク同期用カラム追加
-- Slack Block Kit カード + Chatwork ネイティブタスクとの双方向同期

-- tasks テーブルに外部タスク連携用カラムを追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_task_id TEXT;        -- Chatwork task_id
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS slack_message_ts TEXT;        -- Slack Block Kit カードの message ts（chat.update用）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_sync_status TEXT DEFAULT 'none' CHECK (external_sync_status IN ('none', 'synced', 'failed'));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_external_task_id ON tasks(external_task_id) WHERE external_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_slack_message_ts ON tasks(slack_message_ts) WHERE slack_message_ts IS NOT NULL;

COMMENT ON COLUMN tasks.external_task_id IS 'Chatwork タスクID（双方向同期用）';
COMMENT ON COLUMN tasks.slack_message_ts IS 'Slack Block Kit カードの message_ts（chat.update で完了表示に更新する際に使用）';
COMMENT ON COLUMN tasks.external_sync_status IS '外部サービスへの同期状態: none=未同期, synced=同期済み, failed=同期失敗';
