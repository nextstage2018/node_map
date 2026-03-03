-- Phase 53a: 秘書チャット会話永続化
-- ページリロードしても会話履歴が保持されるようにする

CREATE TABLE IF NOT EXISTS secretary_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  cards JSONB,                     -- カードデータ（assistant のみ）
  session_id TEXT,                 -- セッション識別子（任意）
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secretary_conv_user ON secretary_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_secretary_conv_session ON secretary_conversations(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_secretary_conv_created ON secretary_conversations(user_id, created_at DESC);

-- 古い会話の自動クリーンアップ用（30日以上前）
-- Cronジョブで定期削除する想定
