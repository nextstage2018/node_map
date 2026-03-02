-- Phase B拡張: ジョブ自律実行基盤
-- ジョブのステータスを5段階に拡張し、実行ログ・送信先情報を追加

-- ========================================
-- 1. jobs テーブルにカラム追加
-- ========================================

-- type カラムのデフォルト値を追加（NULL防止）
ALTER TABLE jobs ALTER COLUMN type SET DEFAULT 'other';

-- 新カラム追加
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS execution_log TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;   -- 返信ジョブの元メッセージID
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_contact_id TEXT;     -- 送信先コンタクトID
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_address TEXT;        -- 送信先アドレス
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_name TEXT;           -- 送信先名
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS execution_metadata JSONB;   -- 実行に必要なメタデータ（SlackチャネルID等）

-- statusのCHECK制約を更新
-- 旧: 'pending' | 'done' のみ
-- 新: 'draft' | 'pending' | 'approved' | 'executing' | 'done' | 'failed'
-- 注意: 既存データの 'pending' は互換維持

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_reply_to ON jobs(reply_to_message_id);
