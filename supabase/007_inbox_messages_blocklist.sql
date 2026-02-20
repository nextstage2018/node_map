-- =============================================
-- 007: インボックスメッセージ保存 & ブロックリスト
-- =============================================

-- メッセージ保存テーブル
CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,                    -- UnifiedMessage.id (例: email-xxx, slack-xxx, chatwork-xxx)
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'chatwork')),
  from_name TEXT NOT NULL DEFAULT '',
  from_address TEXT NOT NULL DEFAULT '',
  to_list JSONB DEFAULT '[]',             -- [{name, address}]
  cc_list JSONB DEFAULT '[]',             -- [{name, address}]
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  body_full TEXT,                          -- 引用含む全文
  attachments JSONB DEFAULT '[]',         -- Attachment[]
  timestamp TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unread',
  thread_id TEXT,
  metadata JSONB DEFAULT '{}',
  thread_messages JSONB DEFAULT '[]',     -- ThreadMessage[]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_inbox_messages_channel ON inbox_messages(channel);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_timestamp ON inbox_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_from_address ON inbox_messages(from_address);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_is_read ON inbox_messages(is_read);

-- 同期状態管理テーブル（各チャネルの最終同期時刻）
CREATE TABLE IF NOT EXISTS inbox_sync_state (
  channel TEXT PRIMARY KEY CHECK (channel IN ('email', 'slack', 'chatwork')),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_id TEXT,                   -- 最後に取得したメッセージID
  message_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'error')),
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 初期レコード
INSERT INTO inbox_sync_state (channel) VALUES ('email'), ('slack'), ('chatwork')
ON CONFLICT (channel) DO NOTHING;

-- メールブロックリスト
CREATE TABLE IF NOT EXISTS email_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,                  -- ブロックするメールアドレス（完全一致 or ドメイン）
  match_type TEXT NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact', 'domain')),
  reason TEXT,                            -- ブロック理由（任意）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_blocklist_address ON email_blocklist(address, match_type);

-- RLS（Row Level Security）
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_blocklist ENABLE ROW LEVEL SECURITY;

-- 全ユーザーがアクセス可能（シングルテナントのため）
CREATE POLICY "inbox_messages_all" ON inbox_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inbox_sync_state_all" ON inbox_sync_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_blocklist_all" ON email_blocklist FOR ALL USING (true) WITH CHECK (true);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inbox_messages_updated_at
  BEFORE UPDATE ON inbox_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inbox_sync_state_updated_at
  BEFORE UPDATE ON inbox_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
