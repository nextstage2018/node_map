-- Phase 58 fix: jobs テーブルに ai_draft カラム追加
-- structure-job API や consultations POST で AI生成の下書きを保存
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_draft TEXT;
