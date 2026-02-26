-- Phase 40b: 種AI会話ログの永続化
CREATE TABLE IF NOT EXISTS seed_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seed_id UUID NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seed_conversations_seed_id ON seed_conversations(seed_id);
CREATE INDEX IF NOT EXISTS idx_seed_conversations_user_id ON seed_conversations(user_id);
