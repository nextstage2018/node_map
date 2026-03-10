# NodeMap v4.0 引き継ぎ書

作成日: 2026-03-10
最終更新: 2026-03-10（Phase 1〜4 完了時点）

---

## 1. プロジェクト現況

### 完了済みバージョン

| バージョン | 内容 | ステータス |
|---|---|---|
| V2 全9フェーズ | 5階層・3ログ・チェックポイント・自己学習 | 本番稼働中 |
| v3.0 | MeetGeek連携・検討ツリー統合 | 本番稼働中 |
| v3.2 | 秘書チャットUI改善 | 本番稼働中 |
| v3.3 | プロジェクト中心リストラクチャリング | 本番稼働中 |
| v3.4 | 検討ツリー・タイムライン強化（open_issues/decision_log/meeting_agenda） | 本番稼働中 |
| **v4.0 Phase 1** | **Theme → Goal リネーム（テーブル・UI・API）** | **本番稼働中** |
| **v4.0 Phase 2** | **タスク管理ページ新設（/tasks）** | **本番稼働中** |
| **v4.0 Phase 3** | **Slack Bot タスク自動生成** | **本番稼働中** |
| **v4.0 Phase 4** | **Chatwork Bot タスク自動生成** | **本番稼働中** |

### 本番環境

- **URL**: https://node-map-eight.vercel.app
- **ホスティング**: Vercel
- **DB**: Supabase（PostgreSQL）
- **リポジトリ**: https://github.com/nextstage2018/node_map.git
- **ローカルパス**: ~/Desktop/node_map_git

---

## 2. v4.0 Phase 1〜4 完了サマリー

### Phase 1: Theme → Goal リネーム ✅

- テーブル `themes` → `goals` にリネーム完了
- `milestones.theme_id` → `milestones.goal_id` に変更
- `sort_order` → `phase_order` にカラム名変更
- UI全コンポーネント「テーマ」→「ゴール」表記更新
- API: `/api/goals` 新設、`/api/themes` は後方互換として残存（goalsテーブルを参照）
- 秘書AI intent 内の用語も更新

### Phase 2: タスク管理ページ新設 ✅

- `/tasks` ページ新設（リダイレクト解除）
- フィルタータブ: 今日 / 今週 / 期限切れ / すべて
- タスクカード: パンくず（組織 > PJ > ゴール > MS）、期限色分け、ワンタップステータス変更
- API: `GET /api/tasks/my`（横断取得）、`PATCH /api/tasks/[id]/status`（クイック更新）
- サイドメニューに「タスク」追加（秘書とインボックスの間）

### Phase 3: Slack Bot タスク自動生成 ✅

- Slack Events API Webhook: `/api/webhooks/slack/events`
- トリガー: `@NodeMap タスクにして` メンション or ✅ リアクション
- 共通サービス: `taskFromMessage.service.ts`（Slack/Chatwork両用）
- タスク抽出: シンプルキーワード抽出（期限・優先度自動検出）
- プロジェクト自動判定: `resolveProjectFromChannel()` 活用
- 2段階レスポンス: 即レス（軽量fetch）+ 結果通知
- tasks テーブルに `source_type`, `source_message_id`, `source_channel_id`, `assigned_contact_id` カラム追加
- Slack App設定済み（Events API有効化、app_mention/reaction_added登録）

### Phase 4: Chatwork Bot タスク自動生成 ✅

- Chatwork Webhook: `/api/webhooks/chatwork/events`
- Bot専用アカウント（NodeMap AIエージェント）作成済み
- アカウントイベント（mention_to_me）で発火
- `CHATWORK_BOT_API_TOKEN` でBot返信（既存 `CHATWORK_API_TOKEN` と分離）
- Phase 3の `taskFromMessage.service.ts` を共用
- 署名検証は一旦スキップ（`CHATWORK_WEBHOOK_SECRET` 設定で有効化可能）

---

## 3. 残りの実装フェーズ

| Phase | 内容 | ステータス | 依存 |
|---|---|---|---|
| 5 | 会議録からの階層一括生成強化 | **未着手** | Phase 1 |
| 6 | 完了通知・双方向同期 | **未着手** | Phase 3, 4 |

### Phase 5 の概要

- AI解析の出力拡張（`goal_suggestions` 追加）
- ゴール/マイルストーン/タスクの階層構造を一括提案
- 承認UIコンポーネント
- 一括作成API

### Phase 6 の概要

- タスク完了時にSlack/Chatworkへ通知送信
- Slack/Chatworkからの完了操作（リアクションで完了）

---

## 4. 作業前に必ず読むファイル

| ファイル | 内容 |
|---|---|
| **CLAUDE.md** | 設計SSOT。10のルール・テーブル一覧・API パターン・配色 |
| **docs/V4_SPEC.md** | v4.0仕様書（本バージョンの全設計） |
| **docs/ARCHITECTURE_V2.md** | V2設計書（5階層・3ログ・チェックポイント） |
| **docs/TABLE_SPECS.md** | DB現状マスタ（全テーブルのCREATE文） |

---

## 5. 重要な技術的注意事項

### 絶対に守る10のルール（CLAUDE.md より）

1. サービス層で `getServerSupabase()` を使う
2. `contact_persons.id` はTEXT型・手動生成
3. `unified_messages` を使わない（`inbox_messages` を使う）
4. `inbox_messages.user_id` は存在しない（`direction` で区別）
5. 既読更新後にキャッシュ無効化
6. タスクIDは `crypto.randomUUID()`
7. Calendar API前に `isCalendarConnected()` チェック
8. チャネルトークンの存在を仮定しない
9. mutation後のキャッシュ無効化
10. ファイルアップロードには `project_id` 必須

### v4.0 実装で判明した注意事項

| 項目 | 注意 |
|---|---|
| `tasks.phase` | CHECK制約あり。許可値: `'ideation'`/`'progress'`/`'result'` のみ。`'plan'` は不可 |
| `tasks.status` | CHECK制約あり。許可値: `'todo'`/`'in_progress'`/`'done'` のみ。`'not_started'` は不可 |
| `middleware.ts` | `/api/webhooks/` は認証除外パスに追加済み |
| Slack Events API | 3秒以内にレスポンス必須。処理はバックグラウンドで実行 |
| Chatwork Webhook | `mention_to_me` イベントタイプ（アカウントイベント時）。`message_created` はルームイベント |
| Anthropic API on Vercel | Vercel Serverless から Anthropic API への接続が不安定。タイムアウト or ECONNRESET が頻発。現在はシンプルキーワード抽出で回避 |
| Vercel params パターン | `{ params }: { params: Promise<{ id: string }> }` — 必ず Promise で受ける |
| VMディスク制約 | Cowork VMのディスクがフル。ファイル作成はユーザー側ターミナルで `cat > file << 'EOF'` パターンを使用 |

### 環境変数（v4.0 追加分）

| 変数名 | 用途 | 設定先 |
|---|---|---|
| `CHATWORK_BOT_API_TOKEN` | Chatwork Bot専用トークン（返信・自身識別用） | Vercel |
| `CHATWORK_WEBHOOK_SECRET` | Chatwork Webhook署名検証（任意。現在スキップ中） | Vercel（未設定） |

---

## 6. v4.0 で追加・変更したファイル一覧

### Phase 1

| ファイル | 変更 |
|---|---|
| `sql/v4-phase1-theme-to-goal-rename.sql` | DB migration |
| `src/types/v2.ts` | Goal interface追加、Theme deprecated |
| `src/app/api/goals/route.ts` | 新規CRUD |
| `src/app/api/goals/[id]/route.ts` | 新規個別API |
| `src/app/api/themes/route.ts` | 後方互換（goalsテーブル参照） |
| `src/app/api/themes/[id]/route.ts` | 後方互換 |
| `src/components/v2/GoalSection.tsx` | 新規 |
| `src/components/v2/GoalForm.tsx` | 新規 |
| `src/components/v2/TaskHierarchyView.tsx` | 大幅改修 |
| `src/components/v2/MilestoneSection.tsx` | goal_id対応 |
| `src/app/api/milestones/route.ts` | goal_id対応 |
| `src/app/api/milestones/[id]/route.ts` | goal_id対応 |

### Phase 2

| ファイル | 変更 |
|---|---|
| `src/app/tasks/page.tsx` | リダイレクト → 専用ページに置換 |
| `src/app/api/tasks/my/route.ts` | 新規（横断取得API） |
| `src/app/api/tasks/[id]/status/route.ts` | 新規（クイック更新API） |
| `src/components/tasks/MyTaskCard.tsx` | 新規 |
| `src/components/shared/AppSidebar.tsx` | タスクメニュー追加 |

### Phase 3-4

| ファイル | 変更 |
|---|---|
| `sql/v4-phase3-tasks-source-columns.sql` | DB migration |
| `src/services/v4/taskFromMessage.service.ts` | 新規（共通サービス） |
| `src/app/api/webhooks/slack/events/route.ts` | 新規 |
| `src/app/api/webhooks/chatwork/events/route.ts` | 新規 |
| `src/middleware.ts` | `/api/webhooks/` を認証除外に追加 |

---

## 7. 将来の改善案（ゆくゆくリスト）

- **Slack Block Kit**: ボタン付きメッセージで確認UI（作成する/キャンセル/優先度選択）
- **Anthropic API復活**: Vercel環境でのAI抽出を安定化（Edge Runtime or 別サービス経由）
- **マルチユーザータスク**: `ENV_TOKEN_OWNER_ID` 固定ではなく、メッセージ送信者ごとにタスク割当
- **Chatwork Bot UI改善**: Slack同様の即レス + 結果通知の2段階レスポンス

---

## 8. ユーザーの作業スタイル

- **非エンジニア**: ユーザー（sjinji）は非エンジニア
- **SQLは手動実行**: Supabase SQL Editor で実行
- **ビルド・デプロイ**: `npm run build` と `git push origin main`（Vercel自動デプロイ）
- **Git操作**: `git add` / `git commit` / `git push` はユーザーが手動実行
- **VM制約**: Cowork VMのディスクがフル。ファイル作成はターミナルの `cat > file << 'EOF'` パターンで実施
