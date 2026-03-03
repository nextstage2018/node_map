-- Phase 51a: データ双方向リンク基盤
-- メモ→種のバックリンク
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seeds_memo_id ON seeds(memo_id);
