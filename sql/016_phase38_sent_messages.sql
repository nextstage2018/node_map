-- Phase 38: 送信メッセージ保存対応
-- inbox_messages に direction カラムを追加し、送受信を区別可能にする

-- 1. direction カラム追加（received = 受信, sent = 送信）
ALTER TABLE inbox_messages
ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'received';

-- 2. 既存データは全て受信として扱う
UPDATE inbox_messages SET direction = 'received' WHERE direction IS NULL;

-- 3. 送信者のメールアドレスを保存するカラム（返信時に自分のアドレスを記録）
ALTER TABLE inbox_messages
ADD COLUMN IF NOT EXISTS sender_user_id TEXT;

-- 4. インデックス追加（direction でフィルタリング用）
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction
ON inbox_messages(direction);

-- 5. direction + timestamp の複合インデックス（送信済み一覧のソート用）
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction_timestamp
ON inbox_messages(direction, timestamp DESC);
