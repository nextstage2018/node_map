-- Phase 45c: ビジネスイベント自動蓄積 + AI週間要約
-- business_events に自動蓄積用のカラムを追加

-- 1. ソースメッセージID（重複防止キー）
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS source_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_business_events_source_message ON business_events(source_message_id) WHERE source_message_id IS NOT NULL;

-- 2. ソースチャネル（email/slack/chatwork/drive/calendar）
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS source_channel TEXT;

-- 3. AI生成フラグ + サマリー期間
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS summary_period TEXT; -- 例: '2026-W09' (ISO週番号)

-- 4. イベント日時（作成日時とは別に、実際のイベント発生日を記録）
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ DEFAULT now();

-- 5. ソースドキュメントID（ファイル承認時の追跡用）
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS source_document_id TEXT;

-- 6. event_typeの拡張（CHECK制約があれば緩和）
-- 既存: note / meeting / communication / summary
-- 追加: message_sent / message_received / document_received / document_submitted
-- CHECK制約は追加せず、自由なevent_typeを許可する設計
