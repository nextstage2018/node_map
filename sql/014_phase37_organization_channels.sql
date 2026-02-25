-- Phase 37: 組織チャネル紐づけ＋メンバー管理
-- ============================================================

-- 1. organization_channels テーブル
-- 組織とチャネル（Slack/Chatwork/Email）の紐付け
CREATE TABLE IF NOT EXISTS organization_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL CHECK (service_name IN ('slack', 'chatwork', 'email')),
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_type TEXT,
  is_active BOOLEAN DEFAULT true,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, service_name, channel_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_org_channels_org_id ON organization_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_channels_service ON organization_channels(user_id, service_name);
CREATE INDEX IF NOT EXISTS idx_org_channels_channel_id ON organization_channels(service_name, channel_id);

-- RLS
ALTER TABLE organization_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_channels_policy ON organization_channels
  FOR ALL USING (auth.uid()::text = user_id);

-- 2. contact_persons に auto_added_to_org カラム追加
ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS auto_added_to_org BOOLEAN DEFAULT false;

-- 3. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_org_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_channels_updated_at ON organization_channels;
CREATE TRIGGER trigger_org_channels_updated_at
  BEFORE UPDATE ON organization_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_org_channels_updated_at();
