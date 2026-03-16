-- ============================================
-- NodeMap データクリアSQL（修正版）
-- ============================================
-- 目的: テストデータを全削除し、初期状態に戻す
-- 保持: Supabase auth（ログインユーザー）
--       user_service_tokens（Google OAuth等トークン）
-- 実行: Supabase SQL Editor で実行
-- ============================================

BEGIN;

-- ============================================
-- Step 1: 末端テーブル（FK参照される側ではない）
-- ============================================

-- タスク関連
TRUNCATE TABLE task_conversations CASCADE;
TRUNCATE TABLE task_members CASCADE;
TRUNCATE TABLE task_external_resources CASCADE;
TRUNCATE TABLE task_negotiations CASCADE;
TRUNCATE TABLE task_templates CASCADE;

-- 思考マップ・思考ログ
TRUNCATE TABLE thought_edges CASCADE;
TRUNCATE TABLE thought_task_nodes CASCADE;
TRUNCATE TABLE thought_snapshots CASCADE;
TRUNCATE TABLE thinking_logs CASCADE;

-- 検討ツリー末端
TRUNCATE TABLE decision_tree_node_history CASCADE;

-- 評価・学習
TRUNCATE TABLE milestone_evaluations CASCADE;
TRUNCATE TABLE evaluation_learnings CASCADE;
TRUNCATE TABLE boss_feedback_learnings CASCADE;
TRUNCATE TABLE user_thinking_tendencies CASCADE;

-- 提案
TRUNCATE TABLE task_suggestions CASCADE;
TRUNCATE TABLE milestone_suggestions CASCADE;

-- ナレッジ関連
TRUNCATE TABLE knowledge_master_entries CASCADE;
TRUNCATE TABLE knowledge_clustering_proposals CASCADE;
TRUNCATE TABLE knowledge_domains CASCADE;
TRUNCATE TABLE knowledge_fields CASCADE;

-- ノード関連
TRUNCATE TABLE node_master_links CASCADE;
TRUNCATE TABLE node_source_contexts CASCADE;
TRUNCATE TABLE node_edges CASCADE;
TRUNCATE TABLE node_clusters CASCADE;
TRUNCATE TABLE cluster_nodes CASCADE;
TRUNCATE TABLE user_nodes CASCADE;
TRUNCATE TABLE edge_tasks CASCADE;
TRUNCATE TABLE weekly_node_confirmations CASCADE;

-- Drive関連
TRUNCATE TABLE drive_documents CASCADE;
TRUNCATE TABLE drive_file_staging CASCADE;
TRUNCATE TABLE drive_folders CASCADE;

-- メッセージ関連
TRUNCATE TABLE inbox_messages CASCADE;
TRUNCATE TABLE inbox_sync_state CASCADE;
TRUNCATE TABLE message_reactions CASCADE;
TRUNCATE TABLE unified_messages CASCADE;
TRUNCATE TABLE user_channel_subscriptions CASCADE;

-- v3.4 常設データ
TRUNCATE TABLE open_issues CASCADE;
TRUNCATE TABLE decision_log CASCADE;
TRUNCATE TABLE meeting_agenda CASCADE;

-- ビジネスイベント
TRUNCATE TABLE business_events CASCADE;

-- チェックポイント・ゴール
TRUNCATE TABLE checkpoints CASCADE;
TRUNCATE TABLE goals CASCADE;

-- メモ関連
TRUNCATE TABLE memo_conversations CASCADE;
TRUNCATE TABLE idea_memos CASCADE;

-- 種関連
TRUNCATE TABLE seed_conversations CASCADE;
TRUNCATE TABLE seeds CASCADE;

-- 相談
TRUNCATE TABLE consultations CASCADE;

-- グループ
TRUNCATE TABLE groups CASCADE;

-- メールブロックリスト
TRUNCATE TABLE email_blocklist CASCADE;

-- ============================================
-- Step 2: 中間テーブル
-- ============================================

-- 検討ツリー
TRUNCATE TABLE decision_tree_nodes CASCADE;
TRUNCATE TABLE decision_trees CASCADE;

-- タスク → マイルストーン → テーマ
TRUNCATE TABLE tasks CASCADE;
TRUNCATE TABLE milestones CASCADE;
TRUNCATE TABLE themes CASCADE;

-- 会議録
TRUNCATE TABLE meeting_records CASCADE;

-- 定期イベント
TRUNCATE TABLE jobs CASCADE;
TRUNCATE TABLE project_recurring_rules CASCADE;

-- プロジェクトタイプ
TRUNCATE TABLE project_types CASCADE;

-- ============================================
-- Step 3: プロジェクト・メンバー関連
-- ============================================

TRUNCATE TABLE project_members CASCADE;
TRUNCATE TABLE project_channels CASCADE;
TRUNCATE TABLE projects CASCADE;

-- ============================================
-- Step 4: 組織・コンタクト
-- ============================================

TRUNCATE TABLE organization_channels CASCADE;
TRUNCATE TABLE contact_channels CASCADE;
TRUNCATE TABLE contact_persons CASCADE;
TRUNCATE TABLE organizations CASCADE;

COMMIT;

-- ============================================
-- 保持したテーブル（削除しない）:
--   user_service_tokens（Google OAuth等トークン）
-- ============================================

-- ============================================
-- 確認クエリ（実行後にコメント解除して確認）
-- ============================================
/*
SELECT 'organizations' as tbl, count(*) FROM organizations
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'contact_persons', count(*) FROM contact_persons
UNION ALL SELECT 'tasks', count(*) FROM tasks
UNION ALL SELECT 'milestones', count(*) FROM milestones
UNION ALL SELECT 'inbox_messages', count(*) FROM inbox_messages
UNION ALL SELECT 'meeting_records', count(*) FROM meeting_records
UNION ALL SELECT 'decision_trees', count(*) FROM decision_trees
UNION ALL SELECT 'business_events', count(*) FROM business_events
UNION ALL SELECT 'jobs', count(*) FROM jobs
UNION ALL SELECT 'user_service_tokens (保持)', count(*) FROM user_service_tokens
ORDER BY tbl;
*/
