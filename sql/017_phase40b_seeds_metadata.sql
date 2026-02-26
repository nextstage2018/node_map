-- Phase 40b: 種（Seed）メタデータ拡張
-- インボックスからの種化時に、発信者・日付・タグを保存

ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_from TEXT;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- インデックス: チャネル別の種検索用
CREATE INDEX IF NOT EXISTS idx_seeds_source_channel ON seeds(source_channel);
CREATE INDEX IF NOT EXISTS idx_seeds_user_id ON seeds(user_id);
