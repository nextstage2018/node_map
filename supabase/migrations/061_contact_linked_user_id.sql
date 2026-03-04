-- Phase 58b: contact_persons に linked_user_id カラム追加
-- NodeMapのログインユーザー（Supabase auth UID）との紐づけ
-- 社内相談で相手の秘書画面に相談を表示するために必要
ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS linked_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_contact_persons_linked_user_id ON contact_persons(linked_user_id);
