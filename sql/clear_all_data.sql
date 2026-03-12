-- ============================================
-- NodeMap: 全テーブルデータ削除（開発テスト用）
-- 実行: Supabase SQL Editor にペーストして Run
-- 注意: TRUNCATE CASCADE で全データが完全削除されます
-- ============================================

-- 依存関係を気にせず一括削除（CASCADE）
TRUNCATE TABLE
  -- コンタクト関連
  contact_patterns,
  contact_channels,
  contact_persons,

  -- 組織・プロジェクト
  organization_channels,
  project_channels,
  project_members,
  project_recurring_rules,
  projects,
  organizations,

  -- タスク関連
  task_members,
  task_conversations,
  task_external_resources,
  task_suggestions,
  tasks,

  -- テーマ・マイルストーン
  milestone_evaluations,
  evaluation_learnings,
  milestones,
  themes,

  -- ジョブ・相談・メモ
  jobs,
  consultations,
  memo_conversations,
  idea_memos,

  -- 種（廃止済みだが参照テーブルとして残存）
  seed_conversations,
  seeds,

  -- インボックス
  inbox_messages,
  inbox_sync_state,
  user_channel_subscriptions,

  -- ナレッジ
  knowledge_clustering_proposals,
  thought_edges,
  thought_task_nodes,
  thought_snapshots,
  knowledge_master_entries,
  knowledge_fields,
  knowledge_domains,

  -- Drive
  drive_file_staging,
  drive_documents,
  drive_folders,

  -- 秘書AI
  secretary_conversations,

  -- ビジネスログ・会議録・検討ツリー
  decision_tree_node_history,
  decision_tree_nodes,
  decision_trees,
  meeting_records,
  business_events,

  -- v3.4 新テーブル
  open_issues,
  decision_log,
  meeting_agenda,

  -- ユーザー関連
  user_thinking_tendencies,
  user_service_tokens,
  user_metadata

CASCADE;

-- 確認
SELECT 'All tables truncated successfully.' AS result;
