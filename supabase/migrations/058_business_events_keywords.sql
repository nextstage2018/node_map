-- Phase 57: ビジネスイベントのキーワード抽出済みフラグ
-- business_eventsからキーワードを自動抽出する際の再処理防止用
ALTER TABLE business_events
  ADD COLUMN IF NOT EXISTS keywords_extracted BOOLEAN DEFAULT false;
