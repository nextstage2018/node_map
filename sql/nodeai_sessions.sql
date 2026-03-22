-- NodeAI Sessions テーブル（会議中のBot情報+会話バッファ管理）
-- 実行先: Supabase SQL Editor

-- nodeai_sessions テーブル
CREATE TABLE IF NOT EXISTS nodeai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id TEXT NOT NULL UNIQUE,
  project_id UUID REFERENCES projects(id),
  meeting_url TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (relationship_type IN ('internal', 'client', 'partner')),
  participants JSONB DEFAULT '[]',
  utterance_buffer JSONB DEFAULT '[]',
  response_history JSONB DEFAULT '[]',
  response_count INTEGER NOT NULL DEFAULT 0,
  last_response_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodeai_sessions_bot ON nodeai_sessions(bot_id);
CREATE INDEX idx_nodeai_sessions_status ON nodeai_sessions(status);
CREATE INDEX idx_nodeai_sessions_project ON nodeai_sessions(project_id);

-- 古いセッションの自動クリーンアップ用（3時間以上前のactiveセッション）
-- Cronジョブで定期実行: UPDATE nodeai_sessions SET status = 'ended', ended_at = now()
-- WHERE status = 'active' AND started_at < now() - interval '3 hours';
