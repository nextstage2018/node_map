-- Phase 25: ユーザーチャネル購読管理テーブル
-- ユーザーが選択した取得対象チャネル/グループを管理する

-- ============================================================
-- 1. user_channel_subscriptions テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS user_channel_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL CHECK (service_name IN ('gmail', 'slack', 'chatwork')),
  channel_id TEXT NOT NULL,          -- ラベルID / チャンネルID / ルームID
  channel_name TEXT NOT NULL,        -- 表示名
  channel_type TEXT,                 -- label / public / private / dm / group / room 等
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_name, channel_id)
);

-- ============================================================
-- 2. RLS ポリシー
-- ============================================================
ALTER TABLE user_channel_subscriptions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のレコードのみ操作可能
CREATE POLICY "user_channel_subscriptions_select" ON user_channel_subscriptions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "user_channel_subscriptions_insert" ON user_channel_subscriptions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "user_channel_subscriptions_update" ON user_channel_subscriptions
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "user_channel_subscriptions_delete" ON user_channel_subscriptions
  FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================================
-- 3. インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_channel_subs_user_service
  ON user_channel_subscriptions (user_id, service_name);

CREATE INDEX IF NOT EXISTS idx_channel_subs_active
  ON user_channel_subscriptions (user_id, service_name, is_active);

-- ============================================================
-- 4. updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION update_channel_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_channel_subscriptions_updated_at
  BEFORE UPDATE ON user_channel_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_channel_subscriptions_updated_at();

-- ============================================================
-- 5. inbox_sync_state にチャネル別同期カラム追加（既存テーブル拡張）
-- ============================================================
-- channel_id を追加して、チャネル/グループ単位で同期状態を管理可能にする
ALTER TABLE inbox_sync_state ADD COLUMN IF NOT EXISTS channel_id TEXT DEFAULT '';
ALTER TABLE inbox_sync_state ADD COLUMN IF NOT EXISTS initial_sync_done BOOLEAN DEFAULT false;

-- 既存のユニーク制約を拡張（channel + channel_id でユニーク）
-- 注: 既存制約がある場合はDROPしてから再作成する
-- DROP INDEX IF EXISTS inbox_sync_state_channel_key;
-- ALTER TABLE inbox_sync_state ADD CONSTRAINT inbox_sync_state_channel_channel_id_key
--   UNIQUE(channel, channel_id);
