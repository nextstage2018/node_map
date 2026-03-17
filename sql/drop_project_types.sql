-- プロジェクト種別機能を廃止
-- 旧仕様: 設定画面でプロジェクト種別を定義し、タスクテンプレートを登録
-- 新仕様: v8.0でAI会議録解析からタスクを自動生成。テンプレートベースの生成は不要

-- projects テーブルから project_type_id カラムを削除（FK参照先がなくなるため）
ALTER TABLE projects DROP COLUMN IF EXISTS project_type_id;

DROP TABLE IF EXISTS task_templates CASCADE;
DROP TABLE IF EXISTS project_types CASCADE;
