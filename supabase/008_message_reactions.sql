-- =============================================
-- 008: メッセージリアクション（ツール内独自機能）
-- =============================================
-- Chatwork APIにはリアクション機能がないため、
-- NodeMapツール内で独自のリアクション機能を提供する。
-- Slackメッセージの場合は、Slack APIにもリアクションを送信する。

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,              -- UnifiedMessage.id (例: chatwork-123-456)
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'chatwork')),
  emoji TEXT NOT NULL,                   -- 絵文字（例: 👍, ❤️, 😂）
  emoji_name TEXT,                       -- Slack用の名前（例: thumbsup, heart）
  user_name TEXT NOT NULL DEFAULT 'あなた',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一ユーザー・同一メッセージ・同一絵文字の重複を防ぐ
  UNIQUE (message_id, emoji, user_name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_channel ON message_reactions(channel);

-- RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_reactions_all" ON message_reactions FOR ALL USING (true) WITH CHECK (true);
