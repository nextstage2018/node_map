-- v9.0 クリーンアップ: 秘書チャット廃止に伴うテーブル削除
-- 実行日: 2026-03-16
-- 実行前にバックアップを推奨

-- secretary_conversations: v9.0で秘書AIチャットを廃止。
-- コードからの参照ゼロ（grep確認済み）。
DROP TABLE IF EXISTS secretary_conversations;
