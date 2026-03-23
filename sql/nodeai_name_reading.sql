-- NodeAI: contact_personsにname_reading（読み仮名）カラムを追加
-- TTS読み上げ時の正しい読み方をAIに渡すため
-- 実行: Supabase SQL Editor で実行

ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS name_reading TEXT;

COMMENT ON COLUMN contact_persons.name_reading IS '読み仮名（TTS用）。例: すずき しんじ';
