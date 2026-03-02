-- Phase 36: コンタクトAIコンテキスト自動生成
-- contact_persons テーブルにAI分析結果を保存するカラムを追加

ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS ai_context TEXT;
ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
