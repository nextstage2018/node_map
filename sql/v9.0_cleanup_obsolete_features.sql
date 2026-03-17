-- v9.0 クリーンアップ: 廃止機能のテーブルDROP
-- 実行前にバックアップを推奨

-- ===== Seeds（種ボックス）=====
-- seed_conversations → seeds の順でDROP（FK依存）
DROP TABLE IF EXISTS seed_conversations CASCADE;
DROP TABLE IF EXISTS seeds CASCADE;

-- ===== Thinking Logs（思考ログ）=====
DROP TABLE IF EXISTS thinking_logs CASCADE;

-- ===== Weekly Nodes（週次ノード確認）=====
DROP TABLE IF EXISTS weekly_node_confirmations CASCADE;

-- ===== Themes（テーマ）=====
-- milestones.theme_id は ON DELETE SET NULL なので、themes DROP時に自動NULLになる
DROP TABLE IF EXISTS themes CASCADE;

-- ===== Goals batch-create API用テーブル =====
-- goals/batch-create APIはthemesテーブルを使用していたため、上記DROPで対応済み

-- ===== 確認 =====
-- 以下のテーブル/カラムは残存（既存データ・思考マップとの互換性のため）:
-- - thought_task_nodes.seed_id（NULLable、参照先なし→安全）
-- - thought_edges.seed_id（NULLable、参照先なし→安全）
-- - milestones.theme_id（NULLable、DROP CASCADEでNULLに自動更新）
-- - tasks.seed_id（NULLable、参照先なし→安全）
