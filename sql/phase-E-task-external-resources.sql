-- Phase E: タスク外部資料テーブル
-- 外部AI成果物（Deep Research等）をタスクに取り込むための保存先

CREATE TABLE IF NOT EXISTS task_external_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('text', 'file', 'url')),
  title TEXT NOT NULL,
  content TEXT,            -- テキスト内容（text型: 直接ペースト / file型: 抽出テキスト / url型: ページ内容）
  source_url TEXT,         -- URL型の場合の元URL
  file_name TEXT,          -- file型の場合の元ファイル名
  file_mime_type TEXT,     -- file型の場合のMIMEタイプ
  content_length INTEGER,  -- 文字数（トークン概算用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_task_external_resources_task_id ON task_external_resources(task_id);
CREATE INDEX IF NOT EXISTS idx_task_external_resources_user_id ON task_external_resources(user_id);

-- RLSポリシー
ALTER TABLE task_external_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own task external resources"
  ON task_external_resources
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- service_role用ポリシー（サーバー側からのアクセス用）
CREATE POLICY "Service role full access on task_external_resources"
  ON task_external_resources
  FOR ALL
  USING (true)
  WITH CHECK (true);
