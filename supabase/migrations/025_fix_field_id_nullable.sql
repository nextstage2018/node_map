-- 025: knowledge_master_entries.field_id を NULL許容に変更
-- AI会話からの自動抽出では分類先のfieldが未定の場合があるため
ALTER TABLE knowledge_master_entries ALTER COLUMN field_id DROP NOT NULL;
