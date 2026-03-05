-- Phase 61: AI会話パーソナライズ — 思考傾向分析テーブル
CREATE TABLE IF NOT EXISTS user_thinking_tendencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  tendency_summary TEXT,
  thinking_patterns TEXT[],
  decision_style TEXT,
  risk_tolerance TEXT,
  collaboration_style TEXT,
  owner_policy_text TEXT,
  ai_analysis_raw JSONB,
  source_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, analysis_date)
);
CREATE INDEX IF NOT EXISTS idx_user_thinking_user_date
  ON user_thinking_tendencies(user_id, analysis_date DESC);
