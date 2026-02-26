-- Phase 40c: プロジェクト ↔ チャネル紐づけ
-- 1つのプロジェクトに複数チャネル、1つのチャネルに複数プロジェクトも可能
CREATE TABLE IF NOT EXISTS project_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- organization_channels の参照（Slack/Chatwork）
  organization_channel_id UUID REFERENCES organization_channels(id) ON DELETE CASCADE,
  -- 直接指定（organization_channelsに無いチャネルも対応可能）
  service_name TEXT NOT NULL,       -- slack / chatwork / email
  channel_identifier TEXT NOT NULL, -- slackChannel ID / chatworkRoomId / email address
  channel_label TEXT,               -- 表示用名前
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, service_name, channel_identifier)
);

CREATE INDEX IF NOT EXISTS idx_project_channels_project_id ON project_channels(project_id);
CREATE INDEX IF NOT EXISTS idx_project_channels_identifier ON project_channels(service_name, channel_identifier);

ALTER TABLE project_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_channels_user_policy" ON project_channels
  FOR ALL USING (auth.uid()::text = user_id);
