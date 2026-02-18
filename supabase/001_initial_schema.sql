-- NodeMap Phase 1: 統合インボックス用 初期スキーマ
-- メッセージのキャッシュ・既読管理用

-- メッセージキャッシュテーブル
CREATE TABLE IF NOT EXISTS unified_messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'chatwork')),
  from_name TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  thread_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_messages_channel ON unified_messages(channel);
CREATE INDEX idx_messages_timestamp ON unified_messages(timestamp DESC);
CREATE INDEX idx_messages_is_read ON unified_messages(is_read);
CREATE INDEX idx_messages_thread_id ON unified_messages(thread_id);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_updated_at
  BEFORE UPDATE ON unified_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
