# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-17

> **ドキュメント構成**: このファイルが唯一の設計書（SSOT）。
> V2全9フェーズ + v3.0〜v3.4 + v4.0〜v4.5 + v5.0 + v6.0 + v7.0 + v7.1 + v8.0(Phase1-3) + v9.0 実装済み。作業開始前に必ず読んでください。

| ファイル | 内容 | 必読 |
|---|---|---|
| **CLAUDE.md（本ファイル）** | 設計・ルール・テーブル・API・配色の全情報 | ★ |
| **docs/ARCHITECTURE_V2.md** | V2設計書 — 4階層・3ログ・チェックポイント・自己学習・Gemini連携 | ★ |
| **docs/TABLE_SPECS.md** | DB現状マスタ — 全テーブルのCREATE文・制約・インデックス | ★ |

---

## プロジェクト概要

**NodeMap** は「情報を受け取り → 整理し → 活用する」個人・チーム向けコミュニケーション＆ビジネスログツール。

- **フレームワーク**: Next.js 14 / TypeScript / Tailwind CSS
- **DB**: Supabase（PostgreSQL）
- **AI**: Claude API（claude-sonnet-4-5-20250929）
- **デプロイ**: Vercel（本番: https://node-map-eight.vercel.app）
- **リポジトリ**: https://github.com/nextstage2018/node_map.git
- **ローカル**: ~/Desktop/node_map_git
- **MCPサーバー**: `mcp-server/` ディレクトリ（Claude Code連携用）

---

## ⚠️ 絶対に守る10のルール

| # | ルール | 症状（違反時） | 正しい書き方 |
|---|---|---|---|
| 1 | サービス層で `getServerSupabase()` を使う | RLS違反エラー | `const supabase = getServerSupabase() \|\| getSupabase();` |
| 2 | `contact_persons.id` はTEXT型・手動生成 | NOT NULL制約違反 | `team_${Date.now()}_${random}` |
| 3 | `unified_messages` を使わない | 結果が常に空 | `inbox_messages` を使う |
| 4 | `inbox_messages` クエリには必ず `.eq('user_id', userId)` を付ける | 他ユーザーのメッセージが漏洩 | ユーザー向けAPIでは必須。Cronジョブ（横断処理）は除く |
| 5 | 既読更新後にキャッシュ無効化 | 既読→未読に戻る | `cache.invalidateByPrefix('messages:')` |
| 6 | タスクIDは `crypto.randomUUID()` | 挿入が静かに失敗 | UUID型。`task-${Date.now()}` は禁止 |
| 7 | Calendar API前に `isCalendarConnected()` | 403エラー | 古いトークンはスコープなし |
| 8 | チャネルトークンの存在を仮定しない | 取得失敗 | `hasChannelToken()` で確認 |
| 9 | mutation後のキャッシュ無効化 | 削除したデータが再表示 | UPDATE/DELETE/INSERT直後に実行 |
| 10 | ファイルアップロードには `project_id` 必須 | アップロード失敗 | Driveフォルダ構造がプロジェクト基盤 |

### 追加の注意

- **⚠️ tasks.assigned_contact_id の自動セット**: タスク作成時、`assigned_contact_id` 未指定なら `user_id` → `contact_persons.linked_user_id` 逆引きで作成者自身を自動セット。tasks/my APIでも同様のフォールバック名前解決あり
- **⚠️ drive_documents.direction の明示**: 手動アップロード・URL登録時は必ず `direction: 'submitted'` を明示。未指定だとDBデフォルト `'received'` になり受領資料タブに誤表示される
- **⚠️ ファイルステージング廃止（v10.0）**: チャネル添付ファイルは `drive_file_staging` を経由せず `drive_documents` に直接保存。受領フォルダ（PJ配下「受領」）に自動格納
- **⚠️ contact_persons.owner_user_id**: カラム名は `owner_user_id`（UUID型）。`user_id` ではない。`email`/`phone` カラムも存在しない（`contact_channels` に格納）
- **⚠️ contact_persons.relationship_type の制約**: CHECK制約あり。許可値は `'internal'`, `'client'`, `'partner'` の3つのみ。`'unknown'` は不可
- **⚠️ contact_persons.main_channel の制約**: CHECK制約あり。許可値は `'email'`, `'slack'`, `'chatwork'` の3つのみ
- **⚠️ business_events.content**: カラム名は `content`。`description` ではない
- **Vercel互換params**: `{ params }: { params: Promise<{ id: string }> }` — Promiseで受ける
- **zshブラケット**: `git add "src/app/api/tasks/[id]/route.ts"` — 引用符で囲む
- **knowledge_master_entries.id**: TEXT型、`me_auto_${Date.now()}_${random}` で手動生成
- **milestones.status の制約**: CHECK制約あり。許可値は `'pending'`, `'in_progress'`, `'achieved'`, `'missed'` の4つのみ
- **intent分類の優先順位**: `classifyIntent()` はキーワード一致で**先にマッチしたものが勝つ**。V2 intent（#40〜44）は `create_project`（#29）より**前**に評価すること
- **会議録AI解析のレスポンス構造**: `analyzeData.data.analysis.topics`（× `analyzeData.data.topics` ではない）
- **検討ツリーのデータフロー**: 会議録登録 → AI解析 → 検討ツリー自動生成 → ビジネスイベント自動追加
- **タイムラインは読み取り専用**: 手動イベント登録は廃止。すべて会議録・チャネルメッセージ・Cronから自動生成
- **⚠️ open_issues.status の制約**: CHECK制約あり。許可値は `'open'`, `'resolved'`, `'stale'` の3つのみ
- **⚠️ decision_log.status の制約**: CHECK制約あり。許可値は `'active'`, `'superseded'`, `'reverted'`, `'on_hold'` の4つのみ
- **⚠️ decision_log の変更チェーン**: 決定変更時は新レコード作成＋旧レコードを `superseded` に。previous_decision_id で辿る
- **⚠️ meeting_agenda**: 1PJ1日1アジェンダ（UNIQUE制約）。items は JSONB 配列
- **⚠️ Webhook処理はawait必須**: Vercelはreturn後にバックグラウンド処理を打ち切る。`processTaskCreation().catch(...)` のようなfire-and-forgetは禁止。全処理を`await`してからreturnすること
- **⚠️ Vercel内部fetchは禁止**: サーバーレス関数から自分自身のAPIルートへのfetchは認証・タイムアウト問題が起きる。同一プロセス内で直接ロジックを呼ぶこと。検討ツリー生成（analyze API → generate API）で発生した実例あり
- **⚠️ Slackリトライ対策**: `X-Slack-Retry-Num` ヘッダーがある場合は即座に200を返す（重複処理防止）
- **⚠️ Chatwork BOTトークン**: `CHATWORK_BOT_API_TOKEN` を優先使用。`CHATWORK_API_TOKEN` はフォールバック。BOTアカウントから送信するため
- **⚠️ resolveProjectFromChannel() の戻り値**: `{ projectId, projectName, organizationId }` オブジェクトを返す（文字列IDではない）
- **⚠️ inbox_messages.user_id は存在する**: TEXT NOT NULL。ユーザー向けAPIでは必ず `.eq('user_id', userId)` でフィルタすること。Cronジョブ（プロジェクト横断処理）では不要
- **⚠️ inbox_messages のチャネル制限**: `EMAIL_ENABLED=false` 時、バッジ・メッセージ一覧では `.in('channel', ['slack', 'chatwork'])` でメール除外。`excludeEmail` オプション対応済み
- **⚠️ インボックスポーリング間隔**: メッセージ取得 30秒（`INBOX_POLL_INTERVAL`）、バッジ更新 30秒（AppSidebar）
- **⚠️ Supabase JSクライアントのキャッシュ問題**: `createServerClient()` 経由の `.update()` / `.select()` がVercelサーバーレス環境で古いデータを返す・書き込みが静かに失敗する場合がある。**トークン管理など確実性が必要な処理はSupabase REST API直接（`fetch` + `cache: 'no-store'`）を使うこと**。`getGoogleToken()` / `saveRefreshedToken()` / OAuth コールバックは全てREST API直接に移行済み
- **⚠️ Google OAuthトークンリフレッシュ時のスコープ保持**: リフレッシュ後のDB保存では `{...token, access_token: newToken}` のスプレッドは禁止。OAuthコールバックで保存したスコープ（`drive.readonly`等）が消える。必ず `saveRefreshedToken()` を使い、DBから最新データを読み取ってから `access_token` と `expiry` だけを更新すること
- **⚠️ Google Docs API**: Cloud Consoleで有効化が必要（OAuth スコープだけでは不十分）。プロジェクト番号: 849962099484。URL: `https://console.developers.google.com/apis/api/docs.googleapis.com/overview?project=849962099484`
- **⚠️ OAuth コールバック（`/api/auth/gmail/callback`）**: 現在HTML結果ページを表示する実装。デバッグ完了後もこのまま維持（保存成功/失敗が一目でわかるため有用）
- **⚠️ task_conversations.user_id**: DBに `user_id TEXT NOT NULL DEFAULT 'system'` カラムが必要。TABLE_SPECS.mdには記載済みだがマイグレーション未実行だった。`addConversation()` は必ず `userId` を第3引数で渡すこと
- **⚠️ task_conversations のINSERT**: `id` は省略（UUID自動生成）。`conversation_tag` カラムは存在しない。`user_id` は NOT NULL
- **⚠️ TaskChatView.tsx の入力**: Enter送信は無効（IME誤送信防止）。送信はボタンクリックのみ。テキストエリアは `scrollHeight` ベースで自動伸長（最大120px）
- **⚠️ タスクチェックポイント評価**: AIとの会話が2ターン以上ある場合にヘッダーの「チェック」ボタンが有効化。5観点×20点=100点で評価。85点以上でタスク完了可能。評価観点: ゴール明確度/思考の深度（伸二メソッド）/先回り・視座（BOSS）/リスク認識/練度・精度。API: `POST /api/tasks/[id]/checkpoint`
- **⚠️ タスク完了制限**: チェックポイント未実施 or 85点未満の場合、ステータスを「完了」に変更しようとすると確認ダイアログ表示（スキップ可能）。TaskDetailPanel.tsx の `handleStatusChange` で制御
- **⚠️ TaskDetailPanel.tsx の関連資料**: URL入力に加えファイルアップロード対応（Base64変換 → `/api/drive/documents`）。組織情報（organization_id/organization_name）をdetail APIから取得して送信
- **⚠️ tasks/chat AI会話にdecision_log注入**: プロジェクトの直近10件のactive/on_hold決定事項をAIプロンプトに自動注入
- **⚠️ チェックポイント結果の保存と差分**: 採点結果は `task_conversations`（phase='checkpoint', role='assistant'）にJSON保存。次回採点時に前回結果を取得し、スコア差分（+/-）を5観点それぞれに表示
- **⚠️ チェックポイント後の会話注入**: 採点実行後、結果をAIに送信して改善アドバイスを自動取得。会話履歴にも記録される
- **⚠️ AI会話開始時のステータス自動変更**: タスクが「着手前（todo）」の状態でAI会話を開始すると、自動的に「進行中（in_progress）」に変更
- **⚠️ チャット画面のフェーズ表示廃止**: ヘッダーの「着想/進行/結果フェーズ」バッジは削除。内部的にはphaseは維持（API互換）
- **⚠️ タスク完了通知の強化（3段階経路）**: ①source_type=slack/chatwork → 元スレッドに返信。②会議録起点 → meeting_records.metadata.slack_thread_tsで会議サマリースレッドに返信。③上記いずれも失敗 → project_channels経由でPJチャネルに新規投稿。全経路で完了通知テキスト＋関連資料（drive_documents）リンクを含む
- **⚠️ 会議サマリー投稿時のthread_ts保存**: `meetingSummaryNotifier`がSlackサマリー投稿後、`meeting_records.metadata`に`slack_thread_ts`と`slack_channel_id`を保存。タスク完了通知の経路②で使用
- **⚠️ 会議アジェンダの自動生成強化**: `meetingAgenda.service.ts` の各セクションに詳細情報を追加。①未確定事項: 背景説明(description)+経過日数+関連決定事項の参照。②決定事項: 既存通り。③進行中タスク: AI会話の最新要約(200文字)+関連資料リンク(drive_documents)+チェックポイントスコア。④完了タスク: タスク本体から取り組み内容のAI要約+成果物リンク+最終品質スコア。business_eventsではなくtasksテーブルから直接取得に変更

---

## 設計原則（v3.0 + v3.2 + v3.4）

### 議事録ファースト

すべてのプロジェクトデータは**会議録またはチャネルメッセージ**から自動生成される。手動の「登録」は原則排除。

```
データの流入経路（2つ）:
  1. Gemini会議メモ → Google Calendar添付 or Drive検索 → Cron自動取り込み（v6.0）
     ＋ 手動登録 → 検討ツリータブでテキスト入力
  2. チャネルメッセージ → Slack/Chatwork同期（Cron）
  ※ MeetGeekはv7.0で廃止（Geminiに一本化）

パイプライン完了後の自動共有（v7.0）:
  → プロジェクトのSlack/Chatworkチャネルに自動投稿
  → サマリー + 決定事項 + 未確定事項 + タスク提案
  → Slack: Block Kitカード（承認/編集/却下ボタン付き）
  → Chatwork: ネイティブタスクAPI で自動作成
```

### v3.4: 検討ツリー・タイムライン強化（3つの常設データ）

AI解析に過去の文脈を注入するため、プロジェクト単位で3つの常設データを新設。

```
① open_issues（未確定事項トラッカー）
  - 結論が出なかった事項を追跡。滞留日数で優先度自動算出
  - AI解析で解決検知 → 自動クローズ
  - 3週間以上放置 → stale に自動変更

② decision_log（意思決定ログ）
  - 「決まったこと」の不変ログ。previous_decision_id で変更チェーン
  - decision_tree_nodes と連動
  - implementation_status で実行状況を別管理

③ meeting_agenda（会議アジェンダ）
  - ①未確定事項 + ②決定確認 + タスク進捗 から自動生成
  - items は JSONB 配列（type: open_issue/decision_review/task_progress/custom）
  - 1PJ1日1アジェンダ
```

```
AI解析の改修イメージ:
  【現在】AI入力 = 会議テキストのみ
  【v3.4】AI入力 = 会議テキスト
                 ＋ 未確定事項リスト（①から最大20件）
                 ＋ 直近の決定事項（②から最大10件）
                 ＋ 進行中タスク一覧（既存tasksから）
```

### ~~秘書コンテキスト自動注入~~（v9.0で廃止）

> v9.0でAIチャット秘書を廃止。URLパラメータによるコンテキスト注入、秘書選択UI、v3.2チャットUI改善は全てレガシー。

### v9.0: ダッシュボード（3カード構成）

ホーム画面（`/`）を3カード型ダッシュボードに完全置き換え。

| カード | コンポーネント | 主な機能 |
|---|---|---|
| インボックス返信 | `InboxReplyCard.tsx` | 未読一覧 → 詳細 → AI返信生成 → 確認 → 返信送信 |
| カレンダー | `CalendarWidget.tsx` | 月カレンダー + 予定一覧 + 予定新規作成 |
| タスクリマインダー | `TaskReminderCard.tsx` | 超過/今日/今週フィルタ。担当者別グルーピング |

```
使用API（新規バックエンド不要、既存を活用）:
  インボックス: GET /api/messages, POST /api/messages/read, POST /api/ai/draft-reply, POST /api/messages/reply
  カレンダー: GET /api/calendar?mode=range, POST /api/calendar
  タスク: GET /api/tasks/my?limit=50
```

---

## 画面・ルート一覧

### サイドメニュー（5項目）

| 画面 | URL | 主なテーブル |
|---|---|---|
| ホーム（ダッシュボード） | / | inbox_messages, tasks, calendar（3カード: インボックス返信 / カレンダー / タスクリマインダー） |
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks（統合カンバン: PJ選択+担当者フィルタ+日付フィルタ） |
| 組織・プロジェクト | /organizations | organizations, projects, business_events |
| 設定 | /settings | 個人設定 |
| ガイド | /guide | 操作ガイド（5タブ構成） |

### 組織レベル（/organizations/[id]）

組織には「設定」タブのみ。名前・ドメイン・関係性等の基本情報管理。配下にプロジェクト一覧。

### プロジェクト詳細（/organizations/[id]）タブ構成（v3.3: 7タブ）

| タブ | 内容 | 主なテーブル |
|---|---|---|
| タイムライン | ビジネスログ（**読み取り専用**） | business_events |
| 検討ツリー | 会議録からAI生成 + タスク提案パネル（v5.0） | decision_trees, decision_tree_nodes, meeting_records, task_suggestions |
| 思考マップ | Canvas2D思考可視化（縦: 抽象↔具体、横: 会話ターン時間軸）。再生バー・メンバーフィルタ・チェックポイント表示 | thought_task_nodes, thought_edges, task_conversations |
| タスク | MS→タスク階層（2タブ: タスク一覧カンバン / マイルストーン一覧） | milestones, tasks |
| 定期イベント | MTG / 定期作業。カレンダー連携・議事録自動取得 | project_recurring_rules, jobs |
| メンバー | チャネル登録＋メンバー管理を統合。チャネルからメンバー自動取り込み対応 | project_channels, project_members, contact_persons, contact_channels |
| 関連資料 | ドキュメント・スプレッドシートURL一覧。タグ検索対応 | drive_documents |

### リダイレクトページ（v9.0クリーンアップで全削除済み）

旧URL（/thought-map, /jobs, /memos, /master, /contacts, /business-log, /agent, /seeds, /nodemap）のリダイレクトページは削除済み。直アクセス時は404になる。

---

## 配色ルール（3色）

| 役割 | 色 | 用途 |
|---|---|---|
| **メイン** | Slate（slate-50〜900） | 背景・テキスト・ボーダー全般 |
| **アクセント** | Blue（blue-500/600） | CTA・アクティブ状態・リンク・重要アクション |
| **セマンティック** | 状況に応じた色 | 緑=完了、赤=緊急/エラー、黄=注意（最小限に使用） |

### nm-* カスタムカラー（tailwind.config.ts）

| トークン | 値 | 用途 |
|---|---|---|
| `nm-bg` | #F8FAFC (slate-50) | ページ背景 |
| `nm-surface` | #FFFFFF | カード背景 |
| `nm-border` | #E2E8F0 (slate-200) | ボーダー |
| `nm-border-hover` | #CBD5E1 (slate-300) | ホバーボーダー |
| `nm-text` | #1E293B (slate-800) | メインテキスト |
| `nm-text-secondary` | #64748B (slate-500) | 副テキスト |
| `nm-text-muted` | #94A3B8 (slate-400) | ミュートテキスト |
| `nm-primary` | #2563EB (blue-600) | プライマリーアクション |
| `nm-primary-hover` | #1D4ED8 (blue-700) | ホバー時 |
| `nm-primary-light` | #EFF6FF (blue-50) | 薄い背景 |
| `nm-primary-border` | #BFDBFE (blue-200) | 薄いボーダー |
| `nm-dark` | #1E293B (slate-800) | ダーク背景 |
| `nm-dark-surface` | #334155 (slate-700) | ダークサーフェス |

### 統一コンポーネントバリエーション

- **Card**: default / interactive（hover時shadow-md）/ accent（左border付き）
- **Badge**: status用（dot付き）/ label用（背景色付き）
- **Button**: primary(blue) / secondary(slate) / ghost(transparent)

---

## テーブル一覧（CREATE文 → docs/TABLE_SPECS.md）

| テーブル | 用途 | ID型 | 注意 |
|---|---|---|---|
| `contact_persons` | コンタクト本体 | TEXT | 手動生成。linked_user_id でアカウント紐づけ |
| `contact_channels` | 連絡先 | UUID | UNIQUE(contact_id, channel, address) |
| `inbox_messages` | メッセージ（受信+送信） | TEXT | user_id TEXT NOT NULL。directionで区別 |
| `organizations` | 組織 | UUID | domain重複チェック |
| `organization_channels` | 組織チャネル | UUID | UNIQUE(org_id, service_name, channel_id) |
| `projects` | プロジェクト | UUID | organization_id で組織に紐づく |
| `project_channels` | プロジェクトチャネル | UUID | UNIQUE(project_id, service_name, identifier) |
| `project_members` | プロジェクトメンバー | UUID | UNIQUE(project_id, contact_id)。チャネルから自動取り込み or 手動追加 |
| `tasks` | タスク | UUID | milestone_id / project_id / due_date / scheduled_start/end |
| `task_members` | グループタスクメンバー | UUID | UNIQUE(task_id, user_id) |
| `task_external_resources` | 外部AI資料 | UUID | task_id FK CASCADE |
| `jobs` | ジョブ | UUID | project_id nullable。type / status / ai_draft |
| `consultations` | 社内相談 | UUID | requester→responder→AI返信生成 |
| `idea_memos` | アイデアメモ | UUID | tags TEXT[] |
| `thought_task_nodes` | ノード紐づけ | UUID | UNIQUE(task_id, node_id)。milestone_id nullable |
| `thought_edges` | 思考動線 | UUID | UNIQUE(task_id, from_node_id, to_node_id) |
| `knowledge_master_entries` | ナレッジ | TEXT | 手動生成。field_id NULLable。v3.0: source_meeting_record_id 追加 |
| `drive_file_staging` | ファイルステージング | UUID | **v10.0で廃止（自動承認化）**。レガシーデータのみ残存 |
| `drive_folders` | Driveフォルダ | UUID | v10.0: シンプル3フォルダ構造（組織/PJ/提出\|受領）。L1=組織, L2=PJ, L3=方向 |
| `drive_documents` | Driveドキュメント | UUID | task_id ON DELETE SET NULL。milestone_id, job_id 追加済み。タグ検索対応。direction='submitted'/'received'でカテゴリ分類 |
| `thought_snapshots` | スナップショット | UUID | initial_goal / final_landing |
| ~~`secretary_conversations`~~ | ~~秘書会話~~ **DROP済み（v9.0）** | - | - |
| `contact_patterns` | パターン分析 | UUID | 日次Cron自動計算 |
| `user_thinking_tendencies` | 思考傾向 | UUID | 日次Cron AI分析 |
| `business_events` | ビジネスイベント | UUID | ai_generated / meeting_record_id nullable |
| ~~`themes`~~ | ~~テーマ~~ **DROP済み（v9.0）** | - | milestones.theme_id は NULLable残存 |
| `milestones` | マイルストーン | UUID | project_id 必須。**status CHECK: pending/in_progress/achieved/missed のみ** |
| `meeting_records` | 会議録 | UUID | project_id 必須。**source_type CHECK: text/file/transcription/meetgeek/gemini**。source_file_id TEXT型。v3.0: participants/meeting_start_at/meeting_end_at/metadata/highlights 追加。v6.0: 'gemini'追加（カレンダーイベントIDをsource_file_idに格納） |
| `decision_trees` | 検討ツリーのルート | UUID | project_id 必須 |
| `decision_tree_nodes` | 検討ツリーのノード | UUID | parent_node_id で階層構造。v3.0: source_type/confidence_score/source_message_ids 追加 |
| `decision_tree_node_history` | ノード状態変更履歴 | UUID | node_id FK CASCADE |
| `milestone_evaluations` | チェックポイント評価結果 | UUID | milestone_id FK CASCADE |
| `evaluation_learnings` | 評価エージェント学習データ | UUID | AI判定 vs 人間判定の差分 |
| ~~`seeds`~~ | ~~種ボックス~~ **DROP済み（v9.0）** | - | seed_conversations も DROP済み。tasks.seed_id 等は NULLable残存 |
| `open_issues` | 未確定事項トラッカー | UUID | project_id必須。**status CHECK: open/resolved/stale**。priority_score自動算出。days_stagnant Cron更新。UNIQUE(project_id, title, source_type) |
| `decision_log` | 意思決定ログ | UUID | project_id必須。previous_decision_idで変更チェーン。**status CHECK: active/superseded/reverted/on_hold**。implementation_status別管理 |
| `meeting_agenda` | 会議アジェンダ | UUID | project_id必須。items JSONB配列。**status CHECK: draft/confirmed/completed**。UNIQUE(project_id, meeting_date)。自動生成→確認→完了のライフサイクル |
| `boss_feedback_learnings` | 上長フィードバック学習 | UUID | project_id必須。会議録AI解析で上長の指摘事項を自動抽出。タスクAI会話に注入して判断基準の差を縮める |
| `milestone_suggestions` | MS提案 | UUID | v8.0: 会議録AI解析から自動抽出→自動承認→milestones即登録。検討ツリータブで編集/削除のみ |

---

## ~~秘書AI — 44 Intent~~（v9.0で廃止）

> **v9.0でAIチャット秘書を廃止し、3カード型ダッシュボードに置き換え。**
> v9.0クリーンアップで以下を全削除済み: `SecretaryChat.tsx`・`WelcomeDashboard.tsx`・`ChatCards.tsx`・`QuickActions.tsx`・`/api/agent/chat`・`/api/agent/conversations`・`secretary_conversations`テーブル（DROP済み）。
> さらに v9.0 廃止機能クリーンアップで以下もDROP・削除済み: `seeds`・`seed_conversations`・`themes`・`thinking_logs`・`weekly_node_confirmations` テーブル（DROP済み）、関連API・コンポーネント・サービス・型定義すべて削除。

---

## 共通ビジネスルール

### 営業時間

- **営業日**: 平日のみ（土日・日本の祝日は除外）
- **営業時間**: 10:00〜19:00（`BUSINESS_HOURS` 定数 — `src/lib/constants.ts`）
- **祝日判定**: `isJapaneseHoliday(date)` — 固定祝日・ハッピーマンデー・春分/秋分・振替休日・国民の休日（2000〜2099年対応）

### カレンダー命名

- **タスク予定**: `[NM-Task] タスク名`（`CALENDAR_PREFIX.task`）
- **ジョブ予定**: `[NM-Job] ジョブ名`（`CALENDAR_PREFIX.job`）
- **空き検索時**: 上記プレフィックス付き予定はスキップ（空きとみなす）
- **判定関数**: `isNodeMapEvent(summary)`（`src/lib/constants.ts`）

### 1チャンネル＝1プロジェクト（1Ch=1PJ）

- **原則**: 1つのSlack/Chatworkグループチャンネル = 1つのプロジェクト
- **推奨構成**: Slack 1チャネル、Chatwork 1ルーム、メール 任意（現在休眠中）
- **実装**: `resolveProjectFromChannel()` で `project_channels` テーブルを検索
- **管理場所**: v3.3よりプロジェクト配下「メンバー」タブ上部で管理（チャネル＋メンバー統合）
- **例外**: メール・LINEなど1:1のやり取りは手動紐づけ

### メール休眠フラグ

- **フラグ**: `NEXT_PUBLIC_EMAIL_ENABLED=false` でメール機能をUI非表示（デフォルト: true）
- **定数**: `EMAIL_ENABLED`（`src/lib/constants.ts`）
- **影響**: メール取得スキップ、フィルタ非表示、ブリーフィングから除外、インボックスバッジ・メッセージ一覧からemail除外（`.in('channel', ['slack', 'chatwork'])`）
- **復帰**: 環境変数を `true` に設定するだけ（ソースコード削除なし）

### 伸二メソッド思考プリセット

- **関数**: `getShinjiMethodPrompt()`
- **適用**: タスクAI会話（全フェーズ）、秘書チャット（ビジネス相談系intentのみ）
- **非適用**: 事務的intent（日程調整・インボックス要約等）
- **フレームワーク**: 階層思考（Why×5層）→ 飛び地（横方向連想）→ ストーリー化
- **対話スタイル**: 壁打ち型。「そもそも」「構造で見ると」等の表現

### ビジネスログ タイムラインUI（読み取り専用）

組織詳細ページのプロジェクト配下に、時間軸で変遷を辿れるタイムラインUIを実装。**手動イベント追加は廃止**。すべて自動生成。

| 種別 | アイコン | 左ボーダー色 | 生成元 |
|---|---|---|---|
| 会議 | Calendar | blue | 会議録登録時に自動追加 / MeetGeek Webhook |
| メッセージ | MessageSquare | slate | Cron（CW/Slack同期） |
| タスク完了 | CheckCircle | green | タスクステータス変更時 |
| ファイル共有 | FileText | amber | Drive同期 |
| マイルストーン | Flag | red | マイルストーン達成時 |
| サマリー | BarChart | indigo | 週次Cronサマリー |

---

## APIパターン

```typescript
// 認証（全APIルートの先頭で実行）
import { getServerUserId } from '@/lib/serverAuth';
const userId = await getServerUserId();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// レスポンス
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ error: 'message' }, { status: 400 });
```

### Supabase クライアントの使い分け

| 関数 | キー | 用途 |
|---|---|---|
| `getServerSupabase()` | service role（キャッシュ付き） | **サービス層の標準** |
| `getSupabase()` | anon key | クライアント/フォールバック |
| `createServerClient()` | service role（毎回新規） | 特殊ケースのみ |

```typescript
// ★ サービス層では必ずこのパターン
const supabase = getServerSupabase() || getSupabase();
```

### 送信サービス関数（位置引数）

```typescript
sendEmail(to, subject, body, inReplyTo?, cc?)         // → Promise<boolean>
sendSlackMessage(channelId, text, threadTs?, userId?)  // → Promise<boolean>
sendChatworkMessage(roomId, body)                      // → Promise<boolean>
```

- 返信チャネルID: Slack → `metadata.slackChannel`、Chatwork → `metadata.chatworkRoomId`
- Chatwork To形式: `[To:数値account_id]`（名前ではない）

---

## AIエンドポイント一覧

デフォルトモデル: `claude-sonnet-4-5-20250929`（例外: タスク完了サマリーのみ `claude-opus-4-5-20251101`）

| # | エンドポイント | 用途 | 主なデータソース | Max Tokens |
|---|---|---|---|---|
| ~~1~~ | ~~`/api/agent/chat`~~ | ~~秘書チャット~~ **削除済み（v9.0）** | - | - |
| 2 | `/api/tasks/chat` | タスクAI会話 | tasks, task_conversations, projects, decision_log, boss_feedback_learnings, task_external_resources | 1500 |
| 3 | `/api/ai/draft-reply` | 返信下書き | contact_persons, inbox_messages, calendar | 1000 |
| 4 | `/api/ai/structure-job` | ジョブ構造化 | calendar, user_metadata, inbox_messages | 256-1024 |
| 5 | `/api/consultations` | 相談回答生成 | consultations, jobs, user_metadata | 1024 |
| 6 | `/api/memos/[id]/convert` | メモ→タスク変換 | idea_memos, memo_conversations | 600 |
| 7 | keywordExtractor.service | キーワード抽出 | 入力テキストのみ | 800 |
| 8 | knowledgeClustering.service | 週次クラスタリング | knowledge_master_entries, domains, fields | 2000 |
| 9 | fileClassification.service | ファイル分類 | メタデータのみ（内容は読まない） | 500 |
| 10 | `/api/thought-map/replay` | 思考リプレイ | tasks, task_conversations, snapshots | 1500 |
| 11 | `/api/cron/summarize-business-log` | 週次サマリー | business_events, projects | 800 |
| 12 | aiClient.service | タスク完了サマリー | tasks, task_conversations | 1000 |
| 13 | `/api/meeting-records/[id]/analyze` | 会議録AI解析 | meeting_records | 分析型 |
| 14 | `/api/decision-trees/generate` | 検討ツリー生成 | meeting_records, decision_trees | 構造化型 |
| 15 | `/api/milestones/evaluate` | チェックポイント評価 | milestones, tasks, thought_logs | **評価エージェント**（厳格） |
| 16 | `/api/milestones/learn` | 評価自己学習 | evaluation_learnings, meeting_records | 学習型 |
| 17 | `/api/tasks/[id]/checkpoint` | タスクチェックポイント評価 | tasks, task_conversations, projects, decision_log, boss_feedback_learnings | 1500 |

### Webhook エンドポイント

| エンドポイント | 用途 | トリガー |
|---|---|---|
| ~~`/api/webhooks/meetgeek`~~ | **削除済み（v7.0→v9.0クリーンアップ）** | - |
| `/api/webhooks/slack/events` | Slack メンション応答 + タスク作成 + リアクション | Slack Events API（app_mention, message, reaction_added） |
| `/api/webhooks/chatwork/events` | Chatwork メンション応答 + タスク作成 + タスク完了 | Chatwork Webhook（mention_to_me, message_created） |

**MeetGeek Webhook処理**: 全処理を`await`で完了してからHTTPレスポンスを返す。AI解析 → 検討ツリー生成まで一気通貫。日本語トランスクリプトのスペース除去前処理付き。

**MeetGeek Webhook取得データ**: 会議完了通知受信時、以下の全データをAPIから取得:
- 会議詳細（タイトル・参加者メール・ホスト・開始/終了時刻・タイムゾーン）
- サマリー + AIインサイト
- 全文トランスクリプト（発言者・タイムスタンプ付き）
- ハイライト（アクションアイテム等）
- **録画リンクは保存しない**（4時間期限付き → `GET /api/meeting-records/[id]/recording` でオンデマンド取得）

**プロジェクト自動判定**: Cron/Webhook受信時、以下の優先順位でプロジェクトを自動判定:
0. カレンダーイベントのdescriptionから `project_id:` を抽出（定期イベント作成時に埋め込み済み。最も確実）
1. 参加者メール → `contact_channels` → `contact_persons` → 所属`organization` → `projects`
2. 参加者名 → `contact_persons` → 所属`organization` → `projects`
3. 同日の`business_events`（会議）とサマリー照合
4. フォールバック: 最新プロジェクト

**AIの2つの性格**:
- **壁打ちパートナー**（#2 タスクAI）: Shinji Method、協力的、発散も許容
- **評価エージェント**（#15 チェックポイント）: 構造的、客観的、ズレを正直に指摘

**共通コンテキスト**: getUserWritingStyle()（過去送信10件） / メール署名（メールのみ） / buildPersonalizedContext()（性格・思考傾向）

**フォールバック**: AI失敗時はテンプレート生成 or メッセージそのまま使用。メイン処理をブロックしない。

---

## MCPサーバー（Claude Code連携）

`mcp-server/` ディレクトリに実装。Claude CodeからNodeMapのデータにアクセスするための3ツール。

| ツール | 用途 |
|---|---|
| `get_project_context` | プロジェクトの全コンテキスト取得（タスク・MS・検討ツリー等） |
| `create_meeting_record` | 会議録の作成（AI解析パイプライン起動） |
| `get_decision_tree` | 検討ツリーの取得 |

設定: `.mcp.json`（プロジェクトルート、gitignore対象）

---

## Cronジョブ一覧

すべて `vercel.json` で設定。`CRON_SECRET` 環境変数が必要。時刻はUTC。

| エンドポイント | スケジュール | 用途 |
|---|---|---|
| `/api/cron/enrich-contacts` | 毎日 21:00 | コンタクトプロフィール自動取得 |
| `/api/cron/analyze-contacts` | 毎日 22:00 | コンタクトコミュニケーション分析 |
| `/api/cron/extract-message-nodes` | 毎日 22:30 | メッセージからキーワード抽出 |
| `/api/cron/sync-drive-documents` | 毎日 23:00 | 全チャネル添付ファイル→受領フォルダに直接保存（v10.0: ステージング廃止） |
| `/api/cron/clean-drive-staging` | 毎日 00:30 | 期限切れステージングファイル削除（レガシー） |
| `/api/cron/sync-business-events` | 毎日 01:00 | メッセージからビジネスイベント生成 |
| `/api/cron/sync-channel-topics` | 毎日 01:30 | チャネルメッセージ→検討ツリー統合（v3.0） |
| `/api/cron/extract-knowledge-from-meetings` | 毎日 02:00 | 会議録→ナレッジ抽出（v3.0） |
| `/api/cron/summarize-business-log` | **月曜 02:00** | 週次プロジェクトサマリー |
| `/api/cron/cluster-knowledge-weekly` | **月曜 02:30** | 週次ナレッジクラスタリング |
| `/api/cron/compute-patterns` | 毎日 03:00 | コンタクトパターン計算 |
| `/api/cron/analyze-thinking-tendency` | 毎日 04:00 | 思考傾向AI分析 |
| `/api/cron/update-open-issues` | 毎日 04:30 | 未確定事項の滞留日数・優先度・stale更新（v3.4） |
| `/api/cron/generate-meeting-agendas` | 毎日 05:00 | 翌営業日アジェンダ自動生成（v3.4） |
| `/api/cron/sync-calendar-events` | 毎日 06:00 | Googleカレンダー同期 |
| `/api/cron/sync-meeting-notes` | **毎時 00分** | Gemini会議メモ自動取り込み（3時間スキャン。取込済みはスキップ） |

---

## 環境変数

```bash
# 必須
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # サーバー専用・秘密
ANTHROPIC_API_KEY=               # サーバー専用・秘密
CRON_SECRET=

# オプション
ENV_TOKEN_OWNER_ID=              # パーソナライズ対象ユーザー
NEXT_PUBLIC_EMAIL_ENABLED=       # false でメール休眠（デフォルト: true）
EMAIL_USER=                      # メール取得用
SLACK_BOT_TOKEN=                 # Slack連携（チームレベル）
SLACK_CLIENT_ID=                 # Slack OAuth App ID
SLACK_CLIENT_SECRET=             # Slack OAuth Secret
SLACK_REDIRECT_URI=              # Slack OAuth コールバックURL
CHATWORK_API_TOKEN=              # Chatwork連携（ユーザートークン）
CHATWORK_BOT_API_TOKEN=          # Chatwork BOT連携（BOTトークン。優先使用）
GMAIL_CLIENT_ID=                 # OAuth
GMAIL_CLIENT_SECRET=             # OAuth
GMAIL_REDIRECT_URI=              # OAuth

# MeetGeek連携
MEETGEEK_API_KEY=                # MeetGeek APIトークン
MEETGEEK_WEBHOOK_SECRET=         # Webhook署名検証用シークレット
```

---

## 外部サービス

| サービス | スコープ | 用途 |
|---|---|---|
| Google Calendar | calendar.readonly, calendar.events | 予定同期 |
| Google Drive | drive.file | ファイル保存 |
| Gmail | gmail.readonly | メール同期・OAuth |
| Slack | OAuth Bot（Bot Token + authed_user_id） | メッセージ同期・ボット応答 |
| Chatwork | API Token | メッセージ同期 |
| MeetGeek | API + Webhook | 会議録自動取り込み |

---

## 既知の仕様

- コンタクト集約キー: `from_address`（email=メアド / chatwork=account_id / slack=UXXXXX）
- 組織重複防止: domain でチェック（SetupWizard実装済み）
- コンタクトは1組織のみ所属（横断ガード: 409エラー）
- メンバー追加時に `company_name` と `relationship_type` を自動設定
- メール署名: メールのみ自動付与（Slack/CWは付与しない）
- AI文体学習: `getUserWritingStyle()` で過去送信10件を参照
- パーソナライズ: `buildPersonalizedContext()` で性格タイプ・思考傾向・オーナー方針を注入
- **v9.0 ダッシュボード**: ホーム画面は3カード構成（InboxReplyCard / CalendarWidget / TaskReminderCard）。旧秘書AIチャットは廃止
- **v9.0 サイドバー**: アイコンは `LayoutDashboard`、ラベルは「ホーム」（旧: Bot / 秘書）
- **思考マップ（v9.2）**: Canvas2Dベースの思考可視化。縦軸=抽象↔具体（フェーズ: seed/ideation/progress/result）、横軸=会話ターン（時間軸）。再生バー（play/pause/step/seek）で思考の変遷を追体験。ノード=知識キーワード（`thought_task_nodes`）、エッジ=思考の動線（`thought_edges`）、会話=`task_conversations`。チェックポイント（赤ダイヤモンド）・START/ENDマーカー・メンバーフィルタ・凡例付き。白背景（nm-*カラー準拠）。コンポーネント: `ThoughtMapTab.tsx`。API: `/api/nodes/thought-map`（qualified-tasksモードで担当者名付き）
- **4階層（v8.0）**: Organization > Project > Milestone（任意） > Task（テーマは廃止）
- **タスク vs 定期イベント（旧ジョブ）**: タスク＝思考を伴う作業（MS配下任意）、定期イベント＝定期MTG or 定期作業（PJ配下。カレンダー連携・議事録自動取得対応）
- **3つのログ**: ビジネスログ（事実）/ 検討ツリー（意思決定）/ 思考ログ（個人の思考経路）
- **1週間サイクル**: マイルストーンは1週間単位で設計、週末に到達判定
- **評価エージェントの自己学習**: AI判定 vs 人間判定の差分を記録、次回プロンプトに注入
- **ナレッジはバックエンド基盤**: 専用UIなし。会議録・メッセージから自動抽出され、AIが内部で自動参照
- **対称データパイプライン**: 会議録(A-1)とチャネルメッセージ(A-2)から business_events / decision_trees / knowledge が対称的に自動生成
- **タスク提案（v5.0改善済み）**: 会議録AI解析でaction_items抽出（担当者ごとに集約+文脈付き） → task_suggestions → 検討ツリータブで直接承認（秘書経由は廃止）
- **MS提案（v8.0自動承認）**: 会議録AI解析でmilestone_suggestions抽出→自動承認→milestones即登録（auto_generated=true）。MilestoneProposalPanelは編集/削除のみ
- **MeetGeek廃止（v7.0）**: Webhookは即時200返却。Gemini会議メモに完全移行済み
- **Gemini会議メモ自動取り込み（v6.0→v7.0改善→v10.1マルチユーザー化）**: Cron（`sync-meeting-notes`）が毎時間、Google連携済み全ユーザーのカレンダーから過去3時間のGoogle Meetイベントをスキャン（取込済みはsource_file_idでスキップ。他ユーザー経由で取込済みでもスキップ） → 添付 or Drive検索でGemini Docs検出 → Docs APIでテキスト取得 → **Claude AI解析**（v7.0で全source_type統一） → meeting_records + パイプライン実行（検討ツリー生成＋チャネル通知含む）
- **カレンダー**: `getAllCalendarEvents` はprimaryカレンダーのみ取得
- **タスクカード**: TaskProgressCard / TaskResumeCard は安全化済み。`/tasks`ページは統合カンバンボード（v5.0）
- **タスク削除**: 3箇所（TaskReminderCard / TeamTaskCard+TeamTaskBoard / organizations/[id]タスクタブ）にホバー表示のゴミ箱アイコン＋確認UIを実装。API: `DELETE /api/tasks?id=xxx`
- **~~秘書チャットUI~~**: v9.0で廃止。`formatAssistantMessage()`・`suggestions` はレガシーコード
- **メンバーフォールバック廃止**: project_membersが空でも組織メンバーを返さない。チャネル自動取り込みが正規フロー
- **メンバー検出2経路**: Slackチャネルは `conversations.members` APIで直接取得（メッセージ不要）。Chatwork/Emailは `inbox_messages` から送信者検出。`getChannelMembers()` in `slackClient.service.ts`
- **⚠️ メンバー重複防止（3重チェック）**: detect APIは①既存メンバーのcontact_channels逆引き→アドレス一致で除外、②組織内の名前一致でコンタクト再利用、③project_members.contact_id一致で除外。`getServerSupabase()`使用（キャッシュ問題対策）
- **v3.4 未確定事項**: open_issues テーブルで管理。AI解析で自動検出→自動クローズ。21日以上放置で `stale`
- **v3.4 決定ログ**: decision_log テーブル。不変ログ＋変更チェーン。decision_tree_nodes と連動
- **v3.4 アジェンダ**: meeting_agenda テーブル。open_issues + decision_log + tasks から自動生成。JSONB items
- **Slack OAuth token_data構造**: `access_token`, `token_type`, `team_id`, `team_name`, `bot_user_id`（ボットID共通: `U0AFUJV6HAA`）, `scope`, `authed_user_id`（認証ユーザー個人のSlack ID）, `authed_user_scope`。`authed_user_id` はメッセージのユーザー紐づけに必須
- **チームメンバー（確定）**: suzuki（owner）, yokota, taniguchi, fukuda — 全員 `@next-stage.biz` ドメイン。Slack workspace: 株式会社NextStage
- **インボックス ユーザー分離**: 全ユーザー向けAPIの `inbox_messages` クエリに `.eq('user_id', userId)` 適用済み（14箇所）。Cronジョブはプロジェクト横断処理のため user_id フィルタなし（意図的）
- **インボックス メール除外**: `EMAIL_ENABLED=false` 時、バッジAPI・メッセージ一覧・秘書チャットで email チャネルを除外。`inboxStorage.service.ts` の `loadMessages` に `excludeEmail` オプションあり
- **インボックス ポーリング**: メッセージ取得 `INBOX_POLL_INTERVAL=30秒`（`src/lib/constants.ts`）、バッジ更新 30秒（`AppSidebar.tsx`）
- **日本語スペース除去**: `cleanJapaneseSpaces()` でCJK文字間のスペースを自動除去。AI解析入力時（`analyze/route.ts`）で適用
- **AI解析 JSON修復**: `max_tokens: 12000`。AIレスポンスのJSONが途切れた場合、未閉じの括弧を自動補完して修復を試行
- **business_events重複防止**: `meeting_record_id` で既存チェック（`.limit(1)` + 配列長チェック。`.single()` は0件でエラーになるため禁止）。既にあれば更新（upsert）、なければ新規挿入
- **タイムライン削除ボタン**: BusinessTimeline.tsxにホバー表示のゴミ箱アイコン＋確認UI。API: `DELETE /api/business-events?id=xxx`
- **会議録 再解析ボタン**: `MeetingRecordList.tsx` にRefreshCwアイコンで実装。AI解析＋検討ツリー生成＋チャネル通知を一括トリガー（v7.0統一パイプライン）。再解析時は既存ノード自動削除→再生成。未解析時は黄色バナーで通知
- **検討ツリーAI最適化（v7.0）**: Claude AIが会議録から検討ツリーに最適な3-7テーマ（各2-7子ノード）を構造化。汎用的テーマ（「会議の目的」等）は除外。Geminiパーサーはフォールバック専用

### 検討ツリー データフロー（v7.0: 統一パイプライン）

```
データ流入（2経路）:
  経路1: 検討ツリータブで会議録登録（手動テキスト入力）
  経路2: Gemini会議メモ自動取り込み（Cron: sync-meeting-notes）

統一パイプライン（analyze API内で一体化）:
  → POST /api/meeting-records（meeting_records に保存）
  → POST /api/meeting-records/{id}/analyze（AI解析 + ツリー生成 + 通知を一括実行）
    Step 1-4: Claude AI解析（全source_type共通）
      → topics（3-7テーマ、各2-7子ノード、均等配分）
      → action_items（担当者ごとに集約、Slack最適化済みタイトル+context）
      → summary / decisions / open_issues
      ※ Geminiパーサーはフォールバック専用（AI失敗時のみ）
    Step 5: meeting_records.ai_summary 更新
    Step 6: business_events に自動追加
    Step 7: knowledge_master_entries にキーワード自動抽出
    Step 8: task_suggestions に保存（v5.0: 担当者ごとに集約、context付き）
    Step 9: evaluation_learnings にフィードバック保存
    Step 10: チャネル自動通知（Slack Block Kit / Chatworkタスク）
    Step 11: 検討ツリー生成（直接DB操作。内部fetch廃止）
      → decision_trees 作成 or 既存取得
      → 再解析: source_meeting_id一致ノード＋子ノードを削除
      → topicMatcher.service で既存ノードと類似度判定
      → decision_tree_nodes 新規作成 or マージ（直接INSERT）
      → decision_tree_node_history に履歴記録
```

---

## v3.3 プロジェクト中心リストラクチャリング（全Phase完了）

### 概要
組織レベルの「メンバー」「チャネル」をプロジェクト配下に移動。チャネルとメンバーを1タブに統合。Driveフォルダ構造はv10.0でシンプル化（組織/PJ/提出|受領）。

### 現在の構成
- **組織レベル**: 「設定」タブのみ（メンバー・チャネルUI削除済み）
- **プロジェクト配下**: 7タブ（タイムライン/検討ツリー/思考マップ/タスク/ジョブ/メンバー/関連資料）
- **メンバータブ**: チャネル管理 + メンバー管理を統合。チャネル登録→自動取り込み→展開式カードで編集/削除
- **フォールバックなし**: 新PJはメンバー0人で開始。チャネルからの自動取り込みが正規フロー
- **コンポーネント**: `ProjectMembers.tsx`（チャネル＋メンバー統合）、`ProjectResources.tsx`

### メンバータブのフロー
```
1. チャネル登録（Slack/Chatwork/Email）
2. 「チャネルからメンバーを自動取り込み」ボタン
   → POST /api/projects/[id]/members/detect
   → 2経路で検出:
     経路1（Slack API直接）: conversations.members → users.info → ボット・自分除外
       → メッセージ不要。チャネルに参加していれば即検出
     経路2（inbox_messagesフォールバック）: Chatwork/Email、またはSlack API失敗時
       → inbox_messagesから送信者検出
   → contact_persons自動作成 → project_members追加
3. メンバーカード展開 → 基本情報編集 + 連絡先チャネル管理
   → PUT /api/contacts（name/company/department/relationship_type/notes）
   → GET/POST/DELETE /api/contacts/[id]/channels（email/slack/chatwork）
4. 不要メンバーは削除（外す）ボタンで除外
```

### 関連資料タブ
- ドキュメント・スプレッドシートURL・外部リンクを一覧管理
- MS/タスク/ジョブをプルダウンで指定して格納先を明確化
- カード内にフォルダパス表示

### Driveフォルダ構造（v10.0: シンプル化）
```
[NodeMap] 組織名/
└── プロジェクト名/
    ├── 提出/       ← ユーザー手動アップロード・URL登録（direction='submitted'）
    └── 受領/       ← チャネル（Slack/CW/Email）からの自動取り込み（direction='received'）
```
- 細かい分類はDriveフォルダではなく、DBの `document_type` / `tags` / `task_id` で管理
- タスクカードからのアップロードは `task_id` が自動紐づけされ「提出」フォルダに格納
- v3.3以前の旧フォルダ（定期イベント/会議議事録/マイルストーン/タスク）は既存データ参照用に残存

---

## 作業フロー

```
【作業開始前】
1. このCLAUDE.mdの「10のルール」を確認
2. テーブル操作がある場合 docs/TABLE_SPECS.md を確認
3. 設計の全体像は docs/ARCHITECTURE_V2.md を参照

【タスク実行】
1. git checkout -b feature/phase-XX-name
2. SQLファイル作成（実行はしない）→ TABLE_SPECS.md も更新
3. API作成（上記APIパターンに従う）
4. UI作成
5. npm run build でビルド確認
6. git commit してコミットハッシュを報告

【ビルドエラー対処】
rm -rf .next && npm run build              # キャッシュエラー
rm -rf .next node_modules package-lock.json && npm install && npm run build  # 依存関係エラー
```

---

## v4.0 タスク管理カンバン（実装済み）

### 概要
サイドメニューに「タスク」画面を新設。カンバンボード（個人/チーム切替）+ タスク詳細パネル + AI提案カード。

### 実装済み機能
- **カンバンボード**: 4列（todo/in_progress/review/done）、ドラッグ&ドロップ対応
- **個人/チーム切替**: 個人タスク（自分のみ）とチームタスク（project_members経由）
- **タスク詳細パネル**: タイトルインライン編集、期限日付ピッカー、依頼者・担当者表示、AI要約、ステータスドロップダウン
- **AI提案カード**: task_suggestions からの承認/却下UI、学習機能（却下パターン記録）
- **依頼者・担当者自動判定**: メッセージ送信者→依頼者、TO先（Slack `<@U...>` / CW `[To:N]`）→担当候補
- **AIに相談ボタン**: タスク単位でAI壁打ち
- **タスク削除ボタン**: 3箇所に実装（ホーム>タスクリマインダー / タスク>カンバンカード / 組織>PJ>タスクタブ）。ホバーでゴミ箱アイコン表示→確認ステップ→`DELETE /api/tasks?id=xxx`

### 主要コンポーネント
- `src/components/v4/KanbanBoard.tsx` — カンバンボード本体
- `src/components/v4/TaskDetailPanel.tsx` — 詳細パネル（インライン編集）
- `src/components/v4/TaskSuggestionCards.tsx` — AI提案カード
- `src/app/v4-tasks/page.tsx` — タスク画面ページ

### 追加カラム（tasksテーブル）
- `requester_contact_id` TEXT — 依頼者（contact_persons FK）。チャネルメッセージ送信者から自動解決
- `assigned_contact_id` TEXT — 担当者（contact_persons FK）。Slack `<@U...>` / CW `[To:N]` から候補判定
- `source_message_id` TEXT — 元メッセージID（形式: `slack-{channelId}-{ts}` / `chatwork-{roomId}-{msgId}`）
- `source_type` TEXT — 作成元（slack/chatwork/meeting_record）。タスク詳細APIで表示ラベルを分岐
- `source_channel_id` TEXT — チャネルID（Slack channel_id / Chatwork room_id）

---

## v4.1 カレンダー連携強化（テーブル準備済み・API未実装）

### カレンダー命名ルール体系

| プレフィックス | 用途 | 空き判定 |
|---|---|---|
| `[NM-Task]` | タスクの作業予定 | **除外**（空きとみなす） |
| `[NM-Meeting]` | 会議の予定 | **含む**（実拘束時間） |
| `[NM-Job]` | ジョブの予定 | **除外**（空きとみなす） |

### 空き時間判定ロジック

```
空きなし = 個人で入れた予定 + [NM-Meeting]
空きあり = [NM-Task] + [NM-Job] は無視
→ 「本当に拘束される時間」だけで空き判定

isNodeMapEvent() を拡張:
  現行: [NM-Task] [NM-Job] → 除外
  追加: [NM-Meeting] → 除外しない（実拘束）
```

### タスク → カレンダー登録

```
イベント種別: 時間枠（終日ではない）
タイトル: [NM-Task] タスク名
開始/終了: tasks.scheduled_start / tasks.scheduled_end
目的: 工数管理 + 期限遵守

工数管理フロー:
  タスク作成時 → 見積もり工数（時間）を設定
  → 空き時間にカレンダーブロック自動配置
  → 完了時 → 実績時間を記録
  → 見積もり vs 実績 → 精度改善データとして蓄積
```

### 会議 → カレンダー登録

```
タイトル: [NM-Meeting] 会議タイトル
開始/終了: 会議時間
備考(description): アジェンダ自動注入（2段階更新）

アジェンダ備考の更新タイミング:
  05:00 → 初回生成（generate-meeting-agendas Cron）
  21:00 → 最終更新（当日の進捗・新規決定を反映してカレンダー備考を上書き）
```

### 実装タスク

```
1. CALENDAR_PREFIX に 'meeting' 追加（src/lib/constants.ts）
2. isNodeMapEvent() を拡張 — [NM-Meeting] は除外しない分岐追加
3. タスク→カレンダー登録API（POST /api/tasks/[id]/calendar-sync）
4. 会議→カレンダー登録API（POST /api/meeting-records/[id]/calendar-sync）
5. アジェンダ備考注入 — generate-meeting-agendas Cron に備考更新ロジック追加
6. 21:00 最終更新Cron 新設（/api/cron/update-meeting-agenda-descriptions）
7. 工数管理カラム追加（tasks: estimated_hours, actual_hours）
```

---

## v4.2 繰り返しルール（テーブル準備済み・Cron/UI未実装）

### 新テーブル: project_recurring_rules

```sql
CREATE TABLE project_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('meeting', 'task', 'job')),
  title TEXT NOT NULL,
  rrule TEXT NOT NULL,                    -- iCal RRULE形式
  lead_days INTEGER NOT NULL DEFAULT 7,   -- 事前生成日数
  calendar_sync BOOLEAN NOT NULL DEFAULT false,
  auto_create BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',            -- テンプレート情報等
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_recurring_rules_project ON project_recurring_rules(project_id);
```

### 動作仕様

```
type=meeting + calendar_sync=true:
  → [NM-Meeting]でカレンダーイベント登録
  → 備考にアジェンダ自動セット（v4.1の仕組みを利用）
  → MeetGeek Webhook受信時に照合（同日 + タイトル類似度 > 閾値）
  → 回数自動カウント「第N回 〇〇」

type=task + auto_create=true:
  → lead_days前にタスクを自動生成（Cron）
  → 最新マイルストーンに自動配置
  → 前回完了が遅れても次の期限は固定スケジュール
  → 例: 月末レポート（毎月末締め）→ lead_days=7 → 毎月23日頃にタスク生成

type=job:
  → ジョブを自動生成（lead_days前）
```

### MeetGeek照合ロジック強化

```
MeetGeek Webhook受信時:
  1. 現行: 参加者メール → コンタクト → 組織 → PJ
  2. 追加: PJ確定後、recurring_rules(type=meeting) と照合
     → 同日 + タイトル類似度 > 閾値 → 紐づけ
     → meeting_records.recurring_rule_id に記録
     → 「第N回 〇〇」のカウント自動付与
```

### 実装タスク

```
1. SQLマイグレーション（project_recurring_rules テーブル作成）
2. 設定UI（プロジェクト設定内に繰り返しルール管理セクション）
3. Cron: /api/cron/process-recurring-rules（毎日06:30）
   → 各ルールの次回実行日を算出
   → lead_days前に該当するものをタスク/ジョブ/会議として自動生成
4. MeetGeek照合ロジック更新（webhooks/meetgeek/route.ts）
5. meeting_records に recurring_rule_id カラム追加
6. TABLE_SPECS.md 更新
```

---

## v4.3 チャネルボット — メンション応答（実装済み）

### 概要

Slack・Chatworkのチャネル内で @NodeMap にメンションすると、プロジェクト情報を返答するボット。タスク作成にも対応。

### ボット Intent（7種 + タスク作成）

| Intent | トリガー例 | データソース |
|---|---|---|
| `bot_issues` | 「課題は？」「未確定事項を教えて」 | open_issues |
| `bot_decisions` | 「決定事項は？」「先週何が決まった？」 | decision_log |
| `bot_tasks` | 「タスク状況は？」「佐藤さんの進捗は？」 | tasks |
| `bot_agenda` | 「次の会議のアジェンダは？」 | meeting_agenda |
| `bot_summary` | 「今週のまとめは？」 | tasks + decision_log |
| `bot_menu` | 「メニュー」「一覧」 | Slack: Block Kitボタンカード / CW: テキストメニュー |
| `bot_help` | 「何ができる？」 | 静的テキスト |

### メニューカード

- `@NodeMap メニュー` でSlackではBlock Kitボタン付きカード表示。ボタン押下で各intent応答を取得
- Chatworkでは番号選択式テキストメニュー表示（`@NodeMap 1` で選択）
- 社外チャネルではメニュー項目から「未確定事項」が自動除外される
- 番号→intent変換: `resolveNumberIntent()` が internal/external で異なるマッピングを持つ

### 番号選択（Chatwork + Slack共通）

```
internal: 1=issues, 2=decisions, 3=tasks, 4=agenda, 5=summary
external: 1=decisions, 2=tasks, 3=agenda, 4=summary（issuesが除外）
```

### トーン統一

- 全応答で当たり障りない表現に統一（丁寧すぎず、カジュアルすぎず）
- 社内/社外でトーンの差をつけない。公開範囲のみで制御

### 応答フォーマット

- **プロジェクト名表示**: 全応答の冒頭にプロジェクト名を表示（データが実際に読み込まれたことを確認可能）
- **担当者別グルーピング**: bot_tasks応答ではタスクを担当者ごとにグループ化して表示（`contact_persons:assigned_contact_id(name)` でJOIN）

### 公開レベル（organizations.relationship_type で分岐）

```
internal（自社チャネル）:
  ✅ open_issues（未確定事項）
  ✅ decision_log（意思決定）
  ✅ タスク進捗
  ❌ 思考ログ（thought_task_nodes / thought_edges）

client / partner（社外チャネル）:
  ❌ open_issues（社内の迷いは非公開）
  ✅ decision_log（意思決定 = 共有すべき）
  ✅ タスク進捗（進捗報告として有用）
  ❌ 思考ログ

判定フロー:
  チャネル → project_channels → project → organization → relationship_type
```

### 原則: 参照OK、変更NG

```
変更操作リクエスト時:
  「タスク作成して」→ 「NodeMapの秘書画面から作成できます: [リンク]」
  「この課題をクローズして」→ 「NodeMapから操作してください: [リンク]」
```

### 検知方法

```
Slack: Events API — app_mention イベント
  → POST /api/webhooks/slack/mention
  → チャネルID → project_channels → PJ特定
  → intent分類 → データ取得 → 公開レベルフィルタ → Slack API で返信

Chatwork: Webhook — メンション検知
  → POST /api/webhooks/chatwork/mention
  → ルームID → project_channels → PJ特定
  → intent分類 → データ取得 → 公開レベルフィルタ → Chatwork API で返信
```

### 実装タスク

```
1. Slack Events API 設定（app_mention スコープ追加） ✅
2. Chatwork Webhook 設定 ✅
3. POST /api/webhooks/slack/events — Slack Events Webhook（メンション+リアクション+メッセージ） ✅
4. POST /api/webhooks/chatwork/events — Chatwork Webhook（メンション+タスク作成+完了） ✅
5. botIntentClassifier.service.ts — ボット用intent分類（7種 + 番号選択） ✅
6. botAiClassifier.service.ts — Claude HaikuによるAI intent分類（フォールバック: キーワード） ✅
7. botResponseGenerator.service.ts — 公開レベルフィルタ付きレスポンス生成 ✅
8. taskFromMessage.service.ts — メッセージからタスク自動生成（プロジェクト自動紐付け+依頼者解決） ✅
```

### 実装上の重要な注意事項

- **全処理をawaitで完了してからHTTPレスポンスを返す**: Vercelはreturn後にバックグラウンド処理を打ち切る。fire-and-forget（`.catch()`のみ）は禁止
- **Slackリトライ対策**: `X-Slack-Retry-Num` ヘッダーを検知して重複処理を回避
- **即レスなし**: 「確認中です...」の初回応答は廃止（高速レスポンスのため不要）。AI分類→タスク作成→結果返信を直接`await`で実行
- **Chatwork BOTトークン優先**: `CHATWORK_BOT_API_TOKEN || CHATWORK_API_TOKEN` の順で使用。BOTアカウントから送信
- **プロジェクト自動紐付け**: `resolveProjectFromChannel()` がチャネルID → `project_channels` → プロジェクトを解決
- **依頼者自動解決**: Slack user_id / Chatwork account_id → `contact_channels` → `contact_persons` で依頼者を特定

### 主要コンポーネント

- `src/app/api/webhooks/slack/events/route.ts` — Slack Webhookエントリポイント（Block Kit返信+番号入力対応）
- `src/app/api/webhooks/slack/interactions/route.ts` — Slackボタン押下受信（メニュー+完了+編集）
- `src/app/api/webhooks/chatwork/events/route.ts` — Chatwork Webhookエントリポイント（番号入力対応）
- `src/services/v43/botIntentClassifier.service.ts` — キーワードベースintent分類 + resolveNumberIntent()
- `src/services/v43/botAiClassifier.service.ts` — AI intent分類（Claude Haiku）
- `src/services/v43/botResponseGenerator.service.ts` — レスポンス生成（公開レベルフィルタ・プロジェクト名・担当者グルーピング）
- `src/services/v4/taskFromMessage.service.ts` — メッセージ→タスク自動生成

---

## v4.4 チャネルボット — 定期配信（実装済み）

### 定期配信スケジュール

| タイミング | 内容 | 配信先 |
|---|---|---|
| **月曜 09:00** | 今週のアジェンダサマリー（open_issues件数 + 今週のタスク + 予定会議） | 全PJチャネル |
| **金曜 17:00** | 今週の成果レポート（完了タスク + 新規決定事項 + 新たな未確定事項） | 全PJチャネル |
| **随時（Cron検知）** | アラート（stale未確定事項 / タスク期限超過 / MS期限接近） | 該当PJチャネル |

### 配信内容のrelationship_type分岐

```
internal（自社チャネル）:
  月曜: open_issues + タスク一覧 + 会議予定
  金曜: 完了タスク + 決定事項 + 新規未確定事項
  アラート: stale + 期限超過 + MS接近

client / partner（社外チャネル）:
  月曜: タスク一覧 + 会議予定（open_issuesなし）
  金曜: 完了タスク + 決定事項（未確定事項なし）
  アラート: タスク期限超過 + MS接近（staleなし）
```

### 実装タスク

```
1. Cron: /api/cron/bot-weekly-briefing（月曜 09:00 = UTC 00:00）
   → 全PJの project_channels を取得
   → relationship_type で配信内容分岐
   → Slack/Chatwork API で投稿
2. Cron: /api/cron/bot-weekly-report（金曜 17:00 = UTC 08:00）
   → 同上
3. Cron: /api/cron/bot-alerts（毎日 09:30 = UTC 00:30）
   → stale検知（open_issues.status = 'stale'）
   → タスク期限超過（tasks.due_date < today, status != 'done'）
   → MS期限接近（milestones.due_date - today <= 2）
   → 該当PJチャネルにアラート投稿
4. botMessageFormatter.service.ts — Slack/CW用メッセージフォーマット ✅
5. vercel.json にCronスケジュール追加 ✅
```

### 主要コンポーネント

- `src/app/api/cron/bot-weekly-briefing/route.ts` — 月曜ブリーフィング配信
- `src/app/api/cron/bot-weekly-report/route.ts` — 金曜レポート配信
- `src/app/api/cron/bot-alerts/route.ts` — アラート配信
- `src/services/v44/botMessageFormatter.service.ts` — メッセージフォーマッタ
- `src/services/v44/botScheduledDelivery.service.ts` — 配信ロジック

---

## 開発フェーズ順序

```
v4.0 タスク管理カンバン           ← 実装済み
v4.1 カレンダー連携強化           ← 実装済み（テーブルカラム追加のみ）
v4.2 繰り返しルール               ← 実装済み（テーブル作成のみ）
v4.3 チャネルボット（メンション応答）← 実装済み
v4.4 チャネルボット（定期配信）     ← 実装済み
v4.5 外部タスク双方向同期          ← 実装済み
v5.0 タスク提案フロー刷新          ← 実装済み
v6.0 Gemini会議メモ連携           ← 実装済み
v7.0 会議録チャネル自動共有 + MeetGeek廃止 ← 実装済み
v7.1 タスクAI強化（画像認識・フィードバック学習・ディープリサーチ提案）← 実装済み
v8.0 構造再設計（テーマ廃止・MS週次サイクル・定期イベント・プロジェクトログDoc）← Phase 1-3 実装済み
v9.0 秘書ダッシュボード化（AIチャット廃止→3カード: インボックス/カレンダー/タスクリマインダー）← 実装済み
v10.0 バグ修正・構造改善（タスク担当者自動セット・関連資料direction修正・Driveフォルダシンプル化・ステージング廃止）← 実装済み
```

---

## v4.5 外部タスク双方向同期（実装済み）

### 概要

NodeMapのタスク作成時に、Slack Block Kitリッチカード / Chatworkネイティブタスクを同時作成。
完了時の双方向同期（NodeMap↔Slack/Chatwork）も対応。

### Slack側: Block Kit リッチカード

```
タスク作成時:
  NodeMap DB → externalTaskSync → Slack chat.postMessage（blocks付き）
  → チャネルにリッチカード表示（タスク名・期限・PJ・MS・依頼者）
  → 「完了 ✨」ボタン + 「NodeMapで開く」ボタン
  → slack_message_ts を tasks テーブルに保存

「完了」ボタン押下（Slack画面内）:
  → POST /api/webhooks/slack/interactions（block_actions）
  → handleSlackTaskComplete() でNodeMap tasks.status='done'
  → chat.update でカードを完了表示に差し替え（取り消し線 + 完了日時）

NodeMapで完了（カンバン等）:
  → notifyTaskCompletion() → syncTaskCompletionToExternal()
  → chat.update でSlackカードを完了表示に更新
```

### Chatwork側: ネイティブタスクAPI

```
タスク作成時:
  NodeMap DB → externalTaskSync → POST /rooms/{room_id}/tasks
  → Chatwork画面のタスクパネルに表示（担当者・期限付き）
  → external_task_id を tasks テーブルに保存

Chatworkで「完了しました」メッセージ:
  → 既存の processTaskCompletion() → NodeMap tasks.status='done'
  → syncTaskCompletionToExternal() → PUT /rooms/{room_id}/tasks/{id}/status

NodeMapで完了:
  → notifyTaskCompletion() → syncTaskCompletionToExternal()
  → Chatwork API でタスクステータスを done に変更
```

### 追加カラム（tasksテーブル）

- `external_task_id` TEXT — Chatwork タスクID
- `slack_message_ts` TEXT — Slack Block Kit カードのts（chat.update用）
- `external_sync_status` TEXT — 外部同期状態: none/synced/failed

### Slack App設定（要手動設定）

```
Interactivity & Shortcuts:
  Request URL: https://node-map-eight.vercel.app/api/webhooks/slack/interactions
```

### 主要コンポーネント

- `src/services/v45/externalTaskSync.service.ts` — 外部タスク同期メインロジック
- `src/app/api/webhooks/slack/interactions/route.ts` — Slackボタン押下受信
- `src/services/v4/taskFromMessage.service.ts` — タスク作成後にsyncTaskToExternal()を呼び出し
- `src/services/v4/taskCompletionNotify.service.ts` — 完了時にsyncTaskCompletionToExternal()を呼び出し

### AI機能

- **タスク説明のAI要約**: スレッド文脈をClaude Haiku（`summarizeThreadContext()`）で要約し、descriptionに格納。スレッドなしの場合は空文字
- **期限日キーワード検出**: `extractTaskFromMessage()` で以下のパターンを検出:
  - 今日/本日、明後日/あさって、明日、今週/週末、来週
  - N日後/N日以内（例: 3日後）
  - 具体日付: 3/15, 3月15日, 2026/3/15（過去日は翌年扱い）
- **編集モーダル**: Slack「編集 ✏️」ボタンでモーダルフォーム起動（タイトル・期限・詳細を編集可能）
- **完了時の重複防止**: Block Kitカード or Chatworkタスクが存在する場合、テキスト通知をスキップ

### ⚠️ 注意事項

- **外部同期失敗はNodeMapタスク作成をブロックしない**: try-catchで囲み、失敗しても続行
- **Slack Interactivity URLの設定が必須**: Slack App管理画面で手動設定が必要
- **Chatwork BOTトークン**: `CHATWORK_BOT_API_TOKEN` を優先使用（v4.3と同じ）
- **Slackカード更新にはslack_message_tsが必要**: 保存に失敗した場合はカード更新不可（テキスト通知にフォールバック）
- **即レスは廃止**: 「確認中です...」の初回応答は削除済み。高速レスポンスのため不要

---

## v5.0 タスク提案フロー刷新（実装済み）

### 概要

タスク管理を大幅にシンプル化。個人/チームの区別を廃止し統合カンバンに。会議録→タスク提案を秘書経由から検討ツリータブ直接に変更。AIが担当者ごとにタスクを集約し文脈付きで提案。

### 設計思想

```
【旧フロー（v4.0）】
  会議録 → AI解析 → action_items（細かいTODO 8件）
  → task_suggestions → 秘書画面で承認 → 個人/チームタスク別管理

【新フロー（v5.0）】
  会議録 → AI解析 → action_items（担当者ごとに集約、文脈付き 2-3件）
  → task_suggestions → 検討ツリータブで直接承認（インライン編集可）
  → 統合カンバンで全タスクを管理（PJ選択+担当者フィルタ）
```

### 3つの変更点

**1. タスク画面統合（個人/チーム → 統合カンバン）**

- `/tasks` ページを完全書き換え。個人/チームタブを廃止
- プロジェクト選択 → そのPJの全タスクを表示（user_idフィルタなし）
- 担当者フィルタ + 日付フィルタ（全件/今日/今週/期限超過）
- `TeamTaskCard` で全カードに担当者バッジ表示
- `/api/tasks/my` に `project_id` パラメータ追加: 指定時は全タスク返却+担当者名

**2. 検討ツリータブにタスク提案パネル配置**

- `TaskProposalPanel.tsx` を検討ツリータブ（MeetingRecordList直下）に配置
- 会議録アップロード/再解析後に自動リフレッシュ（onAnalyzedコールバック）
- インラインで以下を編集可能:
  - タイトル（テキスト編集）
  - 担当者（プロジェクトメンバー + 自分のドロップダウン）
  - 優先度（高/中/低セレクト）
  - 期限（日付ピッカー）
- 複製ボタン: 同じタスクを別の担当者にも割り当て可能
- 削除ボタン: 不要な提案を個別削除
- コンテキスト: 展開/折りたたみ式で背景情報を表示
- 承認するとdescriptionにcontextが保存され、AI相談時の文脈情報として活用

**3. AI解析プロンプト改善（担当者ごとに集約+文脈付き）**

- action_itemsを「担当者ごとに1タスクに集約」する原則に変更
- `context` フィールド追加: 会議での議論の流れ・背景・判断根拠を200-400文字で整理
- `related_topics` を配列化: 複数議題にまたがるタスクに対応
- 担当者を会議録の発言者から自動推定
- 無理に全参加者にタスクを割り当てない

### 新規APIエンドポイント

| エンドポイント | 用途 |
|---|---|
| `GET /api/task-suggestions/pending` | プロジェクト別pending提案取得 |
| `PATCH /api/task-suggestions/[id]` | 承認・却下のステータス更新 |
| `GET /api/contacts/me` | ログインユーザー自身のcontact取得（linked_user_id） |

### 主要コンポーネント

- `src/app/tasks/page.tsx` — 統合カンバン（PJ選択+担当者フィルタ+日付フィルタ）
- `src/components/v2/TaskProposalPanel.tsx` — 検討ツリータブのタスク提案パネル
- `src/components/v2/MeetingRecordList.tsx` — onAnalyzedコールバック追加
- `src/app/api/meeting-records/[id]/analyze/route.ts` — max_tokens: 12000、context付きaction_items

### ⚠️ 注意事項

- **max_tokens: 12000**: context付きでJSONが大きくなるため6000→12000に増加。不足するとJSON切れでフォールバック（空結果）になる
- **担当者ドロップダウンに「自分」**: `/api/contacts/me` でlinked_user_id → contact_personsを取得。project_membersに含まれなくても選択可能
- **タスクタイプの扱い**: assigneeContactIdが設定されていれば `group`、なければ `personal`。UIでの区別はなし
- **task_suggestionsのステータス**: pending → accepted（承認）/ dismissed（却下）。検討ツリータブではpendingのみ表示
- **期限(dueDate)の引き継ぎ**: TaskProposalPanel → POST /api/tasks → `CreateTaskRequest.dueDate` → `tasks.due_date` に保存。`CreateTaskRequest` と `TaskService.createTask()` の両方にマッピングが必要
- **作成元(source_type)**: TaskProposalPanelから `sourceType: 'meeting_record'` を送信。タスク詳細API（`/api/tasks/[id]/detail`）で `meeting_record` or `meeting` → 「会議議事録」、`slack`/`chatwork` → チャネル名表示、それ以外 → 「手動作成」

---

## v6.0 Gemini会議メモ連携（実装済み）

### 概要

Google Meet「メモを取る」機能（Gemini）が生成する構造化テキストを、会議録データの主要入力ソースとして利用。Claude AIによるテキスト理解をコードベースのテキストパースに置き換え、APIコスト・トークン制限・JSON切れリスクを排除。

### 設計思想

```
【旧フロー（v5.0以前）】
  MeetGeek Webhook → 生テキスト → Claude AI（¥コスト） → AnalysisResult JSON
  課題: APIコスト、max_tokens制限、JSON切れ、レイテンシ

【新フロー（v6.0→v7.0改善）】
  Google Calendar → Gemini会議メモ（Google Docs添付） → Claude AI解析（v7.0で統一） → AnalysisResult
  利点: Geminiの構造化テキスト + Claude AIの最適な検討ツリー構造化 + タスク内容最適化
```

### アーキテクチャ

```
データフロー:
  1. Google Meet で会議 → Gemini「メモを取る」ON
  2. 会議終了 → Gemini が Google Docs を自動生成しカレンダーイベントに添付
  3. Cron（sync-meeting-notes、毎時間実行）がGoogle連携済み全ユーザーのカレンダーから過去3時間のイベントをスキャン
     ※ 同一会議が複数ユーザーのカレンダーにあっても、source_file_idで重複チェックし1回だけ取込
  4. 会議メモ検出（2段階）:
     4a. カレンダーイベントの添付ファイル（Google Docs）から検出
     4b. 添付がない場合 → Drive APIでイベントタイトルからGemini Docsを検索（フォールバック）
  5. Google Docs API でテキスト取得（Drive API exportはフォールバック）
  6. meeting_records に保存
  7. analyze API 呼び出し → Claude AI解析（全source_type共通、v7.0）
     → 検討ツリー最適化済みtopics + Slack最適化済みaction_items
     → 検討ツリー生成 + チャネル自動通知まで一括実行
     ※ Geminiパーサーはフォールバック専用（AI失敗時のみ）

手動再解析:
  検討ツリータブの再解析ボタン → analyze API（統一パイプライン）
  → 全source_typeでClaude AI解析（v7.0で統一）
  → 既存ノード自動削除 → 再生成 → チャネル通知
```

### Geminiパーサーの仕様（v7.0でフォールバック専用に変更）

Gemini会議メモの構造化テキスト（3セクション）をパースする（Claude AI失敗時のみ使用）:

```
まとめ（Summary）    → result.summary
詳細（Details）      → result.topics + decisions + open_issues
推奨される次のステップ → result.action_items（担当者ごとに集約）
```

キーワードベースの検出:
- 決定事項: 「決定」「合意」「方針」「確定」等 → decisions + topics.status='completed'
- 未確定事項: 「検討」「未定」「課題」「要確認」等 → open_issues
- 期限: M月D日、曜日まで、N日後、来週等 → due_date
- 優先度: 「急」「至急」「最優先」等 → priority='high'
- 担当者: `[名前]` or `名前:` 形式 → assignee

### 新規ファイル

| ファイル | 用途 |
|---|---|
| `src/services/gemini/geminiParser.service.ts` | Gemini会議メモのテキストパーサー（v7.0でフォールバック専用） |
| `src/services/gemini/meetingNoteFetcher.service.ts` | カレンダーイベント添付 or Drive検索からGoogle Docs取得。Docs API優先+Drive exportフォールバック |
| `src/app/api/cron/sync-meeting-notes/route.ts` | Cronジョブ: 会議メモ自動取り込み（毎時間・3時間スキャン） |
| `src/app/api/cron/debug-docs/route.ts` | Docs API / Drive API アクセス診断（トークン・スコープ検証用） |
| `sql/v6.0_gemini_migration.sql` | meeting_records.source_type に 'gemini' 追加 |

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/services/calendar/calendarClient.service.ts` | CalendarEvent に attachments/conferenceData 追加、supportsAttachments=true、`getGoogleToken()` REST API直接読み取り化、`saveRefreshedToken()` 追加（スコープ保持） |
| `src/app/api/meeting-records/[id]/analyze/route.ts` | v7.0: 全source_typeでClaude AI統一 + 検討ツリー生成統合 + チャネル通知統合。Geminiパーサーはフォールバック |
| `src/app/api/auth/gmail/callback/route.ts` | REST API直接DB保存 + HTML結果表示ページ |
| `src/app/api/auth/gmail/route.ts` | `drive.readonly` スコープ追加 |

### meeting_records.source_type CHECK制約

```
旧: ('text', 'file', 'transcription', 'meetgeek')
新: ('text', 'file', 'transcription', 'meetgeek', 'gemini')
```

### Cronスケジュール

| エンドポイント | スケジュール | 用途 |
|---|---|---|
| `/api/cron/sync-meeting-notes` | 毎時 00分 | Gemini会議メモ自動取り込み（3時間スキャン。取込済みスキップ） |

### ⚠️ 注意事項

- **SQLマイグレーション必須**: `sql/v6.0_gemini_migration.sql` を Supabase で実行してからデプロイ
- **source_file_id にカレンダーイベントID**: 重複取り込み防止のキーとして使用
- **metadata に Gemini Docs 情報**: gemini_doc_id, gemini_doc_url, gemini_doc_title を格納
- **v7.0: 全source_typeでClaude AI解析に統一**: Gemini含む全ソースタイプでClaude AIが検討ツリー最適化＋タスク内容最適化を実行
- **MeetGeek連携は廃止（v7.0）**: Webhookは即時200返却。コードは将来復帰用に保持。Gemini一本化
- **Google OAuth スコープ**: `drive.readonly` が必須（他ユーザー所有のGemini Docsを読むため）。`drive.file` だけでは不足。認証URL: `/api/auth/gmail`
- **Google Docs API 有効化必須**: Cloud Console で Google Docs API を手動で有効にする必要がある（OAuthスコープとは別）
- **Geminiパーサーはフォールバック安全**: パース失敗時は空の AnalysisResult を返し、メイン処理をブロックしない
- **トークン管理はREST API直接**: `getGoogleToken()` / `saveRefreshedToken()` / OAuth コールバックは全てSupabase REST API直接。Supabase JSクライアント（`createServerClient()`）はVercel環境でキャッシュ問題を起こすため使用しない
- **会議メモ検出の2段階フォールバック**: (1) カレンダー添付ファイル → (2) Drive APIでタイトル検索。一部のイベントではGemini DocsがカレンダーAPIの添付として返されないため、Drive検索が必須
- **Cronスキャン範囲は3時間（毎時間実行・マルチユーザー）**: 毎時間実行のため3時間で十分（Gemini Docs添付タイムラグをカバー）。Google連携済み全ユーザー（`user_service_tokens` service_name='gmail', is_active=true, scopeにcalendar含む）のカレンダーを順番にスキャン。取込済みイベントはsource_file_idで重複スキップ（他ユーザー経由の取込済みも含む）。手動で広範囲取得したい場合は `?hours=48` パラメータで上書き可能
- **テキスト取得はDocs API優先**: `fetchDocContent()` は Google Docs API（構造化JSON → プレーンテキスト変換）を優先し、Drive API export をフォールバックとして使用。他ユーザー所有ファイルでの互換性が高い
- **診断エンドポイント**: `/api/cron/debug-docs` でトークン状態・API疎通を一括確認可能。トラブル時に活用

---

## v7.0 統一AIパイプライン + チャネル自動共有 + MeetGeek廃止（実装済み）

### 概要

会議録の解析を全source_typeでClaude AIに統一。検討ツリー生成をanalyze APIに統合し、再解析時の自動削除→再生成を実装。パイプライン完了後にSlack/Chatworkへ自動投稿。MeetGeekは廃止しGemini一本化。

### 設計思想

```
【旧フロー（v6.0）】
  会議終了 → Gemini会議メモ取込 → コードパーサー（Gemini用）or Claude AI（その他）
  → フロントエンドで2段階操作（AI解析ボタン → 検討ツリー生成ボタン）
  → 手動で関係者に共有

【新フロー（v7.0）】
  会議終了 → Gemini会議メモ自動取込 → Claude AI解析（全source_type統一）
  → 検討ツリー最適化（3-7テーマ×2-7子ノード、均等配分）
  → Slack最適化タスク提案（具体的タイトル+補足context）
  → analyze API内で一括実行（AI解析→ツリー生成→チャネル通知）
  → 再解析時は既存ノード自動削除→再生成
  → Slackならボタンでタスク承認/編集
  → Chatworkならネイティブタスクとして自動作成
```

### 会議録の入口（2つのみ）

```
経路1: Gemini会議メモ（自動）
  Google Meetの「メモを取る」→ Cron自動取り込み → パイプライン

経路2: 手動登録
  検討ツリータブからテキスト入力 → パイプライン
```

**MeetGeekは廃止**: Webhookエンドポイントは即時200返却に変更。コードは将来復帰用に保持。

### チャネル自動投稿の内容

パイプライン完了後（analyze/route.ts ステップ10）に自動実行:

```
投稿内容:
  ① 要約（サマリー）
  ② 決定事項
  ③ 未確定事項（internalチャネルのみ）
  ④ タスク提案（Slack: Block Kitカード / Chatwork: ネイティブタスク）

公開レベル分岐（organizations.relationship_type）:
  internal → ①②③④全て表示
  client/partner → ③未確定事項を除外
```

### Slack: Block Kit タスク提案カード

```
投稿構造:
  メインメッセージ: サマリー + 決定事項 + 未確定事項
  └── スレッド内: タスク提案カード（1件ずつ）
       各カードに3ボタン:
       [✅ 承認] → NodeMapにタスク即登録 + カード更新
       [✏️ 編集して承認] → モーダルで担当者/期限/優先度を編集 → タスク登録
       [❌ 却下] → カード打ち消し表示

モーダルのフォーム:
  - タスク名（テキスト入力、初期値あり）
  - 担当者（プロジェクトメンバーのドロップダウン + 自分）
  - 期限（日付ピッカー）
  - 優先度（高/中/低セレクト）
```

### Chatwork: ネイティブタスク自動作成

```
投稿構造:
  [info]タグ付きサマリーテキスト（要約+決定事項+未確定事項）
  ＋ ネイティブタスクAPI でタスクを自動作成
    → 担当者はcontact_channels(chatwork)から解決
    → 期限はdue_dateから設定
    → Chatworkのタスクパネルに表示される
    → 完了時はv4.5の既存同期で双方向対応
```

### 新規ファイル

| ファイル | 用途 |
|---|---|
| `src/services/v70/meetingSummaryNotifier.service.ts` | チャネル自動投稿サービス本体 |

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/app/api/meeting-records/[id]/analyze/route.ts` | 全source_typeでClaude AI統一 + ステップ10: チャネル通知 + ステップ11: 検討ツリー生成統合（再解析時ノード自動削除） |
| `src/services/gemini/geminiParser.service.ts` | フォールバック専用に変更。IDF重み付きキーワードマッチング + 汎用テーマフィルタ + autoSubGroup追加 |
| `src/components/v2/MeetingRecordList.tsx` | 2段階フロー廃止 → analyze API単一呼び出しに簡素化 |
| `src/components/v2/MeetingRecordUpload.tsx` | 検討ツリー生成の別途呼び出し廃止 → analyzeレスポンスからツリー結果取得 |
| `src/app/api/webhooks/slack/interactions/route.ts` | nm_proposal_approve/edit/dismiss ハンドラ追加 |
| `src/app/api/webhooks/meetgeek/route.ts` | 即時200返却に変更（無効化） |

### Slack Interactions 対応アクション（v7.0追加分）

| action_id パターン | 処理 |
|---|---|
| `nm_proposal_approve_*` | タスク提案承認 → tasks INSERT + カード更新 |
| `nm_proposal_edit_*` | 編集モーダル表示（担当者/期限/優先度） |
| `nm_proposal_dismiss_*` | 却下 → カード打ち消し表示 |
| callback_id: `nm_proposal_edit_submit` | モーダル送信 → 編集内容でタスク作成 |

### ⚠️ 注意事項

- **チャネル通知失敗はパイプラインをブロックしない**: try-catchで囲み、失敗しても続行
- **Slack Block Kit の value サイズ制限**: 提案情報をJSON文字列で格納（2000文字以内に収まるようtruncate）
- **Chatwork担当者解決**: `contact_channels`(channel='chatwork') の `address`（account_id）を使用
- **MeetGeek Webhookは削除していない**: 将来復帰時は `_POST_disabled` を `POST` に戻すだけ
- **matchContactByName の重複実行**: analyze/route.ts ステップ8（task_suggestions保存）とステップ10（チャネル通知）で2回実行される。ステップ8の結果を再利用する最適化は今後の課題
- **統一パイプライン（v7.0）**: analyze API内でAI解析→ツリー生成→チャネル通知を一括実行。フロントエンドは単一API呼び出しのみ
- **⚠️ 検討ツリー生成は直接DB操作**: analyze API内で `decision_trees` / `decision_tree_nodes` に直接INSERT（内部fetchは廃止）。Vercelサーバーレス環境で自分自身への内部fetchは認証・タイムアウト問題が起きるため、`/api/decision-trees/generate` への内部呼び出しをやめて同一プロセス内で `topicMatcher.service` を使い直接DB操作に変更
- **再解析時ノード削除**: `source_meeting_id` 一致のノード＋その子ノードを削除してから再生成。他の会議録由来のノードは影響なし
- **AIプロンプト最適化**: topicsは3-7テーマ（各2-7子ノード、均等配分）。action_itemsはSlack表示を想定した具体的タイトル+補足context
- **Geminiパーサーはフォールバック専用**: Claude AI失敗時のみ使用。正常時は全source_typeでClaude AIが解析

---

## v7.1 タスクAI強化（実装済み）

### 概要

タスクAI会話の3つの強化: ①画像認識、②ボスフィードバック学習、③ディープリサーチ提案。

### ① 画像認識（マルチモーダル対応）

TaskChatViewに画像添付ボタンを追加。Base64変換してClaude APIにマルチモーダルコンテンツとして送信。10MB制限。

### ② ボスフィードバック学習

```
学習フロー:
  会議（部下が報告） → 上長が指摘・修正
  → 会議録AI解析で boss_feedbacks を自動抽出
  → boss_feedback_learnings テーブルに蓄積
  → タスクAI会話のプロンプトに学習ポイントを注入
  → AIが上長と同じ判断基準でアドバイス

feedback_type:
  correction: 方向修正（「そうじゃなくて」）
  direction: 指示・方針（「こうしてほしい」）
  priority: 優先順位（「まずこっちを」）
  perspective: 視点補正（「お客さん目線で」）
```

### ③ ディープリサーチ提案

タスクAI会話で深い調査が必要と判断した場合、外部AI（Claude Deep Research / Gemini等）の利用を提案し、コピペ用のリサーチプロンプト案を生成。結果をチャットに貼り付けてもらい、一緒に分析する方式。

### 新規テーブル

| テーブル | 用途 |
|---|---|
| `boss_feedback_learnings` | 上長フィードバック学習。会議録解析で自動抽出。applied_countで参照回数を追跡 |

### SQLマイグレーション

`sql/v7.1_boss_feedback_learnings.sql` を Supabase で実行すること。

### 新規・修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/services/v71/bossFeedbackLearning.service.ts` | フィードバック保存・取得・プロンプト注入 |
| `src/components/v4/TaskChatView.tsx` | 画像添付UI（ImagePlusボタン + プレビュー + Base64変換） |
| `src/app/api/tasks/chat/route.ts` | imageData受付 + フィードバック学習コンテキスト注入 |
| `src/services/ai/aiClient.service.ts` | generateTaskChat()にimageData引数追加 + マルチモーダルメッセージ構築 + ディープリサーチ提案指示 |
| `src/app/api/meeting-records/[id]/analyze/route.ts` | boss_feedbacksプロンプト追加 + 抽出結果のDB保存ステップ |

---

## v8.0 構造再設計 — テーマ廃止・MS週次サイクル・定期作業・アジェンダ強化・プロジェクトログDoc（Phase 1-3 実装済み）

### 設計思想

```
【旧構造（v7.1以前）】
  Organization > Project > Theme > Milestone > Task  ← 5階層
  Theme: UIなし（死んでいる）
  Milestone: 手動作成のみ。タスクと弱い紐づけ
  Job: タスクとの違いが曖昧。繰り返しCron未実装
  タスク完了: 即アーカイブ。MS進捗チェックなし

【新構造（v8.0）】
  Organization > Project > Milestone(任意) > Task  ← 4階層（Themeを廃止）
  Milestone: 1週間サイクル。会議録から自動提案。internal PJは原則必須
  定期作業（旧Job）: カレンダー連動。会議・レポート・定例作業を管理
  タスク完了: MS進捗自動更新。週末に達成度判定
  会議前アジェンダ: MS進捗・タスク達成度・差異を自動記載
```

### 3つの変更

#### 変更1: テーマ（Phase）廃止

- `themes` テーブルは残すが新規作成を停止（UIは既に非表示）
- `milestones.theme_id` は NULL 運用（FK制約は残す）
- 階層は **Organization > Project > Milestone > Task** の4階層に簡素化
- CLAUDE.md の「5階層」記述を「4階層」に更新

#### 変更2: マイルストーンの週次サイクル運用

```
会議フロー（曜日はプロジェクト設定で変更可能）:
  ① 前週MSの振り返り（達成/未達）← 会議イベントのdescriptionに自動記載
  ② 今週やることの議論 ← 人間が会議で話す
  ③ 「今週末にどうなっていたいか」← 人間が言語化
  ④ 会議録AI解析 → ③の発言からMS自動抽出→milestones即登録（自動承認）
  ⑤ 検討ツリータブで自動登録MSを確認・任意で編集/削除
  ⑥ 自動登録されたMSにタスク提案が紐づく
  ⑦ タスク完了時 → MS進捗を自動更新
  ⑧ 週末 → MS達成度判定（評価エージェント）
  ⑨ 未達タスクは次週MSに自動持ち越し

会議サイクル設定:
  - projects.meeting_cycle_day: 週次会議の曜日（0=日〜6=土、デフォルト1=月曜）
  - projects.meeting_cycle_enabled: 週次サイクルの有効/無効（デフォルトtrue）
  - 曜日はプロジェクト設定タブで変更可能
  - 特定の曜日にハードコードしない

organization.relationship_type による分岐:
  internal（自社）: MSは会議録からAI自動登録（即承認）。ただし会議内容次第で抽出されない場合もあるためオプション扱い
  client / partner: MS任意。作成しなくてもタスクは動く
  ※ 全relationship_typeでMSなしでもタスクは正常動作（milestone_idはNULL許容）
```

**AI解析プロンプトへの追加**:
- 会議録AI解析で `milestone_suggestions` を自動抽出→ **自動承認（milestones即登録）**
- 「1週間後の理想像」「今週のゴール」「到達点」等の発言を検出
- 提案形式: `{ title, target_date(1週間後), success_criteria, tasks[] }`
- 抽出されたMS提案は `milestone_suggestions`（status='accepted'）と `milestones`（auto_generated=true）の両方に同時保存
- 検討ツリータブのMilestoneProposalPanelでは編集/削除のみ可能（承認/却下ボタンなし）

**タスク完了時のMS進捗更新**:
- タスクを `done` にした時点で、所属MSの進捗率を再計算
- 全タスク完了 → MSステータスを `achieved` に自動更新
- 期限超過＋未完了タスクあり → MSステータスを `missed` に自動更新

#### 変更3: ジョブ → 定期作業（ラベル変更 + カレンダー連携強化）

```
名称変更:
  旧: ジョブ（Job）
  新: 定期作業

用途:
  ① 定期会議: カレンダー登録 + 会議メモ取得対象フラグ
  ② 定期レポート: カレンダー登録 + 納品資料アップロード
  ③ 定例作業: カレンダー登録 + リマインド

カレンダー連携:
  [NM-Meeting] 定期会議名   ← 会議として扱う（空き判定に含む）
  [NM-Job] 定期作業名       ← 作業として扱う（空き判定に含まない）

定期会議の特別扱い:
  - Gemini会議メモ取得対象として登録（sync-meeting-notes Cronのフィルタに使用）
  - 未登録の会議イベントはスキャン対象外にできる
  - 回数自動カウント（「第N回 〇〇」）

繰り返しルール:
  - project_recurring_rules テーブルを活用（既存）
  - Cron: /api/cron/process-recurring-rules を実装
  - rrule形式（iCal準拠）で柔軟な繰り返し設定
```

#### 会議前アジェンダの自動生成強化（カレンダーイベントdescription注入）

```
アジェンダの記載場所:
  - Google カレンダーの会議イベントの「詳細」（description）フィールドに直接テキストで記載
  - 会議前日の夜（Cron）までにAIが自動生成・注入
  - 会議参加者はカレンダーアプリから事前確認可能

現在のアジェンダ内容（v3.4）:
  - 未確定事項（open_issues）
  - 決定事項の確認（decision_log）
  - タスク進捗

v8.0 追加内容:
  - 【MS進捗セクション】
    ・現在のMS: タイトル、期限、進捗率（完了タスク/全タスク）
    ・各タスクの状態: 完了/進行中/未着手 + 担当者
    ・未達タスクの理由（AI会話から推定）
    ・前週MSの達成/未達結果
  - 【定期作業セクション】
    ・今週の定期作業一覧（完了/未完了）
    ・納品資料のリンク（アップロード済みの場合）

生成タイミング:
  - 会議前日の21:00（JST） → Cron実行
  - Google Calendar API でイベントのdescription を更新
  - 繰り返し会議イベントの場合、次回インスタンスのみ更新
```

### 実装フェーズ（優先順）

```
Phase 1: テーマ廃止 + MS自動登録 ✅
  - UI上のテーマ参照を完全除去
  - 会議録AI解析で milestone_suggestions 自動抽出→milestones即登録（自動承認）
  - 検討ツリータブにMS管理パネルを配置（編集/削除のみ。承認/却下ボタンなし）
  - internal PJでは MS自動登録を強調表示（「AI自動登録」バッジ）

Phase 2: タスク完了 → MS進捗自動更新
  - タスクステータス変更時にMS進捗率を再計算
  - 全タスク完了 → MS自動 achieved
  - 期限超過 + 未完了 → MS自動 missed
  - 未達タスクの次週MS持ち越し機能

Phase 3: 定期イベント（旧ジョブ）カレンダー連携 ✅
  - UIラベルを「ジョブ」→「定期イベント」に変更
  - RecurringRulesManager.tsx を直感的UIに刷新:
    種別（MTG/定期作業）、頻度（毎日/毎週/毎月）、時間帯、参加者選択、議事録読み取りトグル
  - 参加者はメール登録済みメンバーのみ表示（カレンダー招待に必要）
  - ルール作成時にGoogleカレンダーへ即時登録（ネイティブRRULEで繰り返し予定）
  - descriptionにrule_id/project_id/type/プロジェクト名/NodeMapリンクを記載（名寄せ用）
  - 参加者のメールアドレスをcontact_channelsから解決→カレンダー招待（attendees）
  - ルール削除→Googleカレンダーからも自動削除（calendar_event_idをmetadataに保存）
  - MTGはカレンダー登録必須、定期作業はオプション
  - プロジェクトログDoc: 1PJ=1 Google Docs（正史）。会議後AI解析結果を自動追記

Phase 4: アジェンダ強化
  - generate-meeting-agendas CronにMS進捗セクション追加
  - 定期作業の完了/未完了セクション追加
  - カレンダー備考への自動注入
  - 前週MS振り返りの自動記載
```

### ⚠️ 注意事項

- **テーマテーブルは削除しない**: 既存データの参照整合性のため残す。新規作成のみ停止
- **internal判定**: `organizations.relationship_type = 'internal'` で判定。プロジェクト単位ではなく組織単位
- **MS自動承認フロー**: 会議録AI解析で抽出→`milestone_suggestions`(accepted)+`milestones`(auto_generated=true)に同時保存。MilestoneProposalPanelは編集/削除のみ
- **繰り返しルールのrrule**: iCal RRULE形式。`FREQ=WEEKLY;BYDAY=MO`（毎週月曜）等
- **カレンダー備考の文字数制限**: Google Calendar descriptionは最大8192文字。アジェンダが超えないよう制御
- **会議サイクルはハードコードしない**: 月曜固定ではなく `projects.meeting_cycle_day` で曜日を設定可能（デフォルト1=月曜）
- **アジェンダはプロジェクトログDoc + カレンダーリンク**: Google Docsに事前アジェンダを自動生成し、カレンダーイベントにDocリンクを貼付。カレンダーdescriptionへの直接記載はフォールバック
- **⚠️ projects テーブル追加カラム**: `meeting_cycle_day` (INTEGER DEFAULT 1) + `meeting_cycle_enabled` (BOOLEAN DEFAULT true) + `log_document_id` (TEXT) + `log_document_url` (TEXT)
- **⚠️ milestones テーブル追加カラム**: `source_meeting_record_id` (UUID REFERENCES meeting_records) + `auto_generated` (BOOLEAN DEFAULT false)
- **⚠️ milestone_suggestions テーブル**: task_suggestionsと同様の構造。自動承認のため常にaccepted。milestones テーブルに同時INSERTされる
- **⚠️ プロジェクトログDoc**: 1プロジェクト＝1 Google Docsドキュメント（正史）。最新の会議が先頭に配置。`projects.log_document_id` で管理
- **プロジェクトログDocの配置**: `[NodeMap] 組織名/プロジェクト名/` フォルダ直下（drive_foldersのhierarchy_level=2）。`getOrCreateProjectLogDoc()` がフォルダ未作成時にL1(組織)/L2(PJ)を自動作成してからDoc配置（Driveルートへの誤配置を防止）
- **プロジェクトログDocの構造**: 日付セクション × 3ブロック（事前アジェンダ / 会議メモ / AI解析結果）
- **事前アジェンダの自動生成**: Cron（generate-meeting-agendas）で翌営業日分を生成。decision_log + open_issues + MS進捗（タスク会話要約付き）+ 前回会議サマリ
- **会議後の自動追記**: analyze API（ステップ9.7）でAI解析結果をDocに追記。決定事項 + タスク提案 + MS提案 + 未確定事項
- **チャネル通知にDocリンク**: Slack Block Kit / Chatworkメッセージにプロジェクトログへのリンクを含める
- **⚠️ 定期イベント カレンダー連携**: ルール作成POST時にGoogle CalendarネイティブRRULEで繰り返し予定を即時作成。calendar_event_idは `metadata.calendar_event_id` に保存（テーブル変更不要）。削除時にこのIDでカレンダーからも削除
- **⚠️ カレンダー登録のタイムゾーン**: Vercel(UTC)環境では `setHours()` は使わない。ISO文字列に `+09:00` を明示して構築すること
- **⚠️ 参加者の表示条件**: RecurringRulesManagerの参加者選択は `contact_channels` にemail登録済みのメンバーのみ表示。未登録メンバーはメンバータブでメール追加が必要
- **⚠️ members API にemail追加済み**: `GET /api/projects/[id]/members` が `contact_channels`(email) から各メンバーのメールアドレスを取得して `email` フィールドで返す
- **⚠️ タスクページ2タブ構成**: 「タスク一覧」（カンバン）+ 「マイルストーン」（展開式カード+ネストタスク）。`include_tasks=true` パラメータでMS配下タスクを一括取得

---

## v9.0 秘書ダッシュボード化（実装済み）

### 概要

ホーム画面（`/`）をAIチャット秘書（44 intent）から3カード型ダッシュボードに完全置き換え。会議録サイクルが確立したため、秘書チャットの多機能は不要になった。

### 設計思想

```
【旧（v8.0以前）】
  / → SecretaryChat.tsx（44 intent AIチャット）
  URLパラメータでコンテキスト注入、カード型選択UI、会話履歴

【新（v9.0）】
  / → SecretaryDashboard.tsx（3カード）
  インボックス返信 / カレンダー / タスクリマインダー
  シンプル・高速・直接操作
```

### 3カード構成

**カード1: インボックス返信（InboxReplyCard.tsx）**
- 3段階フロー: リスト表示 → 詳細表示 → 返信編集・送信
- 未読メッセージをフィルタ表示（最大10件）
- チャネルアイコン: Slack=紫S、Chatwork=オレンジC、Email=Mailアイコン
- AI返信生成（`/api/ai/draft-reply`）→ 編集 → 送信（`/api/messages/reply`）
- 既読マーク（`/api/messages/read`）は詳細表示時に自動実行

**カード2: カレンダー（CalendarWidget.tsx）**
- 月カレンダーグリッド（7×6セル）
- 日付選択 → その日の予定一覧表示
- イベントドット表示（最大3個/日）
- 予定新規作成フォーム（タイトル・日付・開始/終了時刻）
- Google Calendar未連携時のフォールバック表示
- タイムゾーン: `+09:00`（JST）明示

**カード3: タスクリマインダー（TaskReminderCard.tsx）**
- 3フィルタ: 超過（赤）/ 今日（黄）/ 今週（青）+ カウントバッジ
- 担当者別グルーピング（`assignee_name` → フォールバック「未割当」）
- 優先度ドット（高=赤、中=黄、低=灰）
- 期限残り日数表示（「3日超過」「今日」「2日後」）
- タスク詳細へのリンク（`/tasks?taskId=X`）

### 廃止・削除済み（v9.0クリーンアップ完了）

| 項目 | 状態 |
|---|---|
| SecretaryChat.tsx / WelcomeDashboard.tsx / ChatCards.tsx / QuickActions.tsx | **削除済み** |
| /api/agent/chat / /api/agent/conversations | **削除済み** |
| secretary_conversations テーブル | **DROP済み** |
| /api/webhooks/meetgeek | **削除済み** |
| リダイレクトページ（/agent, /jobs, /memos等 9ページ） | **削除済み** |
| 44 intent分類（classifyIntent） | agent/chat と共に削除済み |
| URLパラメータコンテキスト注入 | page.tsxから除去済み |
| seeds / seed_conversations テーブル | **DROP済み**（API・コンポーネント・サービス・型定義も全削除） |
| themes テーブル | **DROP済み**（API・コンポーネント・型定義も全削除） |
| thinking_logs テーブル | **DROP済み**（API・サービス・コンポーネントも全削除） |
| weekly_node_confirmations テーブル | **DROP済み**（API・コンポーネントも全削除） |
| GoalSuggestionReview / goals/batch-create API | **削除済み**（themes依存） |

### 新規ファイル

| ファイル | 用途 |
|---|---|
| `src/components/secretary/SecretaryDashboard.tsx` | ダッシュボード本体（3カードグリッド） |
| `src/components/secretary/InboxReplyCard.tsx` | インボックス返信カード |
| `src/components/secretary/CalendarWidget.tsx` | カレンダーウィジェット |
| `src/components/secretary/TaskReminderCard.tsx` | タスクリマインダーカード |

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/app/page.tsx` | SecretaryChat → SecretaryDashboard に置き換え。URLパラメータ処理を全削除 |
| `src/components/shared/AppSidebar.tsx` | アイコン: Bot → LayoutDashboard、ラベル: 秘書 → ホーム |
