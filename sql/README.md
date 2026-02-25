# NodeMap SQL スキーマ

Supabase データベースのスキーマ定義・マイグレーションファイルです。

## ファイル一覧

| ファイル | 説明 |
|----------|------|
| 001_initial_schema.sql | 初期スキーマ（profiles, contacts等） |
| 002_tasks_schema.sql | タスク管理スキーマ |
| 003_nodemap_schema.sql | ノードマップコアスキーマ |
| 004_phase7_10_schema.sql | Phase7-10拡張スキーマ |
| 005_phase16_interaction_count.sql | インタラクションカウント |
| 006_phase17_conversation_tags.sql | 会話タグ機能 |
| 007_inbox_messages_blocklist.sql | インボックス・ブロックリスト |
| 008_message_reactions.sql | メッセージリアクション |
| 009_user_channel_subscriptions.sql | チャネルサブスクリプション |

## migrations/

| ファイル | 説明 |
|----------|------|
| 005_phase22_rls_policies.sql | RLS ポリシー定義 |

## 適用方法

Supabase SQL Editor で番号順に実行してください。
