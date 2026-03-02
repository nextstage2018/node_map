-- Phase 37b: 組織に関係性・詳細情報を追加
-- ============================================================

-- organizations テーブルにカラム追加
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS relationship_type TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS memo TEXT;
