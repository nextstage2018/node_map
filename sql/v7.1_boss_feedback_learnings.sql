-- v7.1: ボスフィードバック学習テーブル
-- 会議での上長指摘事項を蓄積し、タスクAI会話の精度を向上させる

CREATE TABLE IF NOT EXISTS boss_feedback_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('correction', 'direction', 'priority', 'perspective')),
  -- correction: 方向性の修正（「そうじゃなくて〜」）
  -- direction: 新たな指示・方針（「こうしてほしい」）
  -- priority: 優先順位の指摘（「まずこっちをやって」）
  -- perspective: 視点の補正（「お客さん目線で考えて」）
  original_approach TEXT,           -- 部下/AIが提案していた内容
  boss_feedback TEXT NOT NULL,      -- 上長の実際の指摘内容
  learning_point TEXT NOT NULL,     -- AIが次回活用すべき学習ポイント
  context TEXT,                     -- 会議での文脈（議題・状況）
  applied_count INTEGER NOT NULL DEFAULT 0,  -- AI会話で参照された回数
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boss_feedback_project ON boss_feedback_learnings(project_id);
CREATE INDEX idx_boss_feedback_created ON boss_feedback_learnings(created_at DESC);
