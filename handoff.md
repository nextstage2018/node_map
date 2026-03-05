# NodeMap 引き継ぎ書
## 2026-03-05 セッション完了分 → 次回作業指示

---

## 1. 今回完了した作業

### Phase 35: コンタクトAPI完成
- 重複検出API（`/api/contacts/duplicates`）
- コンタクトマージAPI（`/api/contacts/merge`）
- チャネル追加API（`/api/contacts/[id]/channels`）
- 関連タスク取得API（`/api/contacts/[id]/tasks`）
- プロフィール自動取得API（`/api/contacts/enrich`）
- コンタクトページに🔰機能ガイド追加

### Phase 60: ユーザーデータ分離
- `inbox_messages`に`user_id`カラム追加（既存データをsuzukiさんIDでバックフィル済み）
- `contact_persons`の`owner_user_id`を設定済み
- 11テーブルにRLSポリシー作成済み（Supabase SQL Editor実行済み）
- API側のuser_idフィルタ強化（12ファイル修正）

### Phase 60a: 環境変数トークン制限
- `ENV_TOKEN_OWNER_ID`による環境変数トークン（メール/Slack/Chatwork）のオーナー制限
- Vercel環境変数に`ENV_TOKEN_OWNER_ID`追加済み

### Phase 61: AI会話パーソナライズ
- `user_thinking_tendencies`テーブル新設（Supabase実行済み）
- `personalizedContext.service.ts` — 全AIエンドポイント共通のパーソナライズコンテキスト構築
- `thinkingTendency.service.ts` — 思考傾向分析エンジン（5データソース→Claude分析）
- `/api/cron/analyze-thinking-tendency` — 日次Cron（毎日4:00）
- `/api/settings/thinking-tendency` — 傾向取得/手動分析/方針編集API
- 全AIエンドポイント10箇所に`buildPersonalizedContext()`注入済み
  - aiClient.service.ts（返信下書き・タスクAI会話）
  - agent/chat（秘書チャット）
  - seeds/chat（種AI会話）
  - tasks/chat（タスクAI会話＋社内相談コンテキスト）
  - consultations（社内相談回答AI）
  - ai/structure-job（ジョブ構造化）
  - memos/[id]/convert（メモ→タスク変換）
  - thought-map/replay（思考リプレイ）
- Middlewareに`/api/cron/`パス除外追加（Cronの外部テスト対応）

### データクリーンアップ
- テストユーザー（fukuda, taniguchi）のauth.users削除済み
- yokotaさんに紐づいた不正メッセージ113件を削除済み

---

## 2. 現在のGit状態
```
最新コミット: ae2b30a + middleware修正（main）
状態: clean（未コミット変更なし）
リモート: origin/mainと同期済み
```

---

## 3. 現在のユーザー状況

| ユーザー | メール | ID | メッセージ数 | コンタクト数 |
|---|---|---|---|---|
| suzuki | suzuki@next-stage.biz | 1db0acd8-5e11-41e4-85d3-3441344345da | 49件 | 3件 |
| yokota | yokota@next-stage.biz | 450ce9bd-07aa-4c45-a6ac-6cbeef53aa88 | 0件 | 0件 |

---

## 4. DB変更（Supabase SQL Editor実行済み・マイグレーションファイルなし）

以下はSupabase SQL Editorで直接実行済みだが、マイグレーションファイルには含まれていない：
```sql
-- inbox_messages に user_id 追加（Phase 60）
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_user_id ON inbox_messages(user_id);
UPDATE inbox_messages SET user_id = '1db0acd8-5e11-41e4-85d3-3441344345da' WHERE user_id IS NULL;

-- contact_persons の owner_user_id 設定（Phase 60）
UPDATE contact_persons SET owner_user_id = '1db0acd8-5e11-41e4-85d3-3441344345da' WHERE owner_user_id IS NULL;

-- business_events の user_id 設定（Phase 60）
UPDATE business_events SET user_id = '1db0acd8-5e11-41e4-85d3-3441344345da' WHERE user_id IS NULL;

-- 11テーブルにRLSポリシー作成済み（Phase 60）

-- user_thinking_tendencies テーブル新設（Phase 61）
-- ※ マイグレーションファイル 062_phase61_thinking_tendencies.sql あり
```

### Vercel環境変数（追加分）
- `ENV_TOKEN_OWNER_ID` = `1db0acd8-5e11-41e4-85d3-3441344345da`

### CLAUDE.md 未反映の重要事項
- `inbox_messages`テーブルの備考に「**user_id TEXT カラムあり（Phase 60追加）**」と更新が必要
- Phase 60 / 60a の実装内容セクション追加が必要

---

## 5. 次回の作業: ページレビュー（タスク・ジョブ・アイデアメモ）

### レビュー進捗
| ページ | URL | レビュー状態 |
|---|---|---|
| 設定 | /settings | ✅ 完了 |
| コンタクト | /contacts | ✅ 完了（API 5件実装 + 🔰ガイド） |
| インボックス | /inbox | ⬜ 未着手 |
| **タスク** | **/tasks** | **⬜ 次回優先** |
| **ジョブ** | **/jobs** | **⬜ 次回優先** |
| **アイデアメモ** | **/memos** | **⬜ 次回優先** |
| 組織 | /organizations | ⬜ 未着手 |
| ビジネスログ | /business-log | ⬜ 未着手 |
| ナレッジ | /master | ⬜ 未着手 |
| 思考マップ | /thought-map | ⬜ 未着手 |
| 秘書 | /agent | ⬜ 未着手 |

### レビュー観点
各ページで以下を確認する：

1. **UIの動作確認**: 画面表示・操作が正常か
2. **データ分離**: 他ユーザーのデータが混在しないか
3. **不足API**: UIが呼び出すAPIが全て実装されているか
4. **エラーハンドリング**: エッジケースでクラッシュしないか
5. **🔰機能ガイド**: 初回ユーザー向けの説明が必要か

### タスクページ（/tasks）の確認ポイント
- カンバン表示（todo / in_progress の2カラム）
- タスク作成（個人/グループ）
- AI構想会話（4項目: ゴール/内容/懸念/期限）
- 構想→進行フェーズ移行
- タスク完了→ビジネスログアーカイブ→削除
- ファイル添付（プロジェクト紐づけ時のみ）
- **user_idフィルタ**: `tasks`テーブルのRLS + API `.eq('user_id', userId)` 確認

### ジョブページ（/jobs）の確認ポイント
- 進行中 / 完了 の2タブ構成
- ジョブ種別（reply/schedule/check/consult/todo/other）
- AI下書き表示・編集
- 承認→自動実行フロー
- 社内相談（consult）のフロー
- 完了アーカイブ（検索・フィルタ・詳細展開）
- **user_idフィルタ**: `jobs`テーブルの `.eq('user_id', userId)` 確認

### アイデアメモページ（/memos）の確認ポイント
- メモ作成・編集・削除
- AI会話（memo_conversations）
- メモ→タスク直接変換（Claude AIによるタイトル・説明・優先度自動生成）
- タグ管理
- **user_idフィルタ**: `idea_memos`テーブルの `.eq('user_id', userId)` 確認

---

## 6. 保護の3層構造（確認用）
```
┌─────────────────────────────────┐
│  Layer 1: RLS（DB層）           │
│  11テーブルにauth.uid()制限     │
├─────────────────────────────────┤
│  Layer 2: API user_idフィルタ   │
│  全クエリに.eq('user_id')付与   │
├─────────────────────────────────┤
│  Layer 3: ENV_TOKEN_OWNER_ID    │
│  環境変数トークンはオーナー専用  │
└─────────────────────────────────┘
```

---

## 7. 重要な注意事項

- **CLAUDE.md を必ず最初に読むこと**（プロジェクト全体の仕様書）
- **inbox_messages テーブルの user_id**: CLAUDE.mdにはまだ「user_id カラムは存在しない」と記載があるが、**Phase 60で追加済み**。次回セッションでCLAUDE.md更新が必要
- **Supabase クライアント**: サービス層は `getServerSupabase()` を使用（service roleでRLSバイパス）→ API側のuser_idフィルタが必須
- **contact_persons.id は TEXT型**: 必ず手動でID生成して渡す
- **tasks.id は UUID型**: `crypto.randomUUID()` を使用
- **Phase 61 パーソナライズ**: `buildPersonalizedContext(userId)` が全AIエンドポイントに注入済み。エラー時はcatchして続行（AIの品質には影響するが機能は止まらない）
