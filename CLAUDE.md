# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-12

> **ドキュメント構成**: このファイルが唯一の設計書（SSOT）。
> V2全9フェーズ + v3.0〜v3.4 + v4.0〜v4.5 + v5.0 実装済み。作業開始前に必ず読んでください。

| ファイル | 内容 | 必読 |
|---|---|---|
| **CLAUDE.md（本ファイル）** | 設計・ルール・テーブル・API・配色の全情報 | ★ |
| **docs/ARCHITECTURE_V2.md** | V2設計書 — 5階層・3ログ・チェックポイント・自己学習・MeetGeek連携 | ★ |
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
- **⚠️ Slackリトライ対策**: `X-Slack-Retry-Num` ヘッダーがある場合は即座に200を返す（重複処理防止）
- **⚠️ Chatwork BOTトークン**: `CHATWORK_BOT_API_TOKEN` を優先使用。`CHATWORK_API_TOKEN` はフォールバック。BOTアカウントから送信するため
- **⚠️ resolveProjectFromChannel() の戻り値**: `{ projectId, projectName, organizationId }` オブジェクトを返す（文字列IDではない）
- **⚠️ inbox_messages.user_id は存在する**: TEXT NOT NULL。ユーザー向けAPIでは必ず `.eq('user_id', userId)` でフィルタすること。Cronジョブ（プロジェクト横断処理）では不要
- **⚠️ inbox_messages のチャネル制限**: `EMAIL_ENABLED=false` 時、バッジ・メッセージ一覧では `.in('channel', ['slack', 'chatwork'])` でメール除外。`excludeEmail` オプション対応済み
- **⚠️ インボックスポーリング間隔**: メッセージ取得 30秒（`INBOX_POLL_INTERVAL`）、バッジ更新 30秒（AppSidebar）

---

## 設計原則（v3.0 + v3.2 + v3.4）

### 議事録ファースト

すべてのプロジェクトデータは**会議録またはチャネルメッセージ**から自動生成される。手動の「登録」は原則排除。

```
データの流入経路（2つのみ）:
  1. 会議録 → 検討ツリータブで登録 or MeetGeek Webhook自動連携
  2. チャネルメッセージ → Slack/Chatwork同期（Cron）
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

### 秘書コンテキスト自動注入

秘書（ホーム画面）はURLパラメータでコンテキストを受け取る。プロジェクト詳細画面からの遷移時に自動付与。

```
/?projectId=xxx&taskId=yyy&message=テキスト
```

対応パラメータ: `projectId`, `taskId`, `organizationId`, `messageId`, `contactId`, `message`

### 秘書選択UI

テキスト入力だけでなく、カード型選択UIで操作を簡素化。

| カード種別 | 用途 |
|---|---|
| `action_selector` | プロジェクトコンテキスト時のアクション選択 |
| `project_selector` | プロジェクト未指定時のPJ選択 |
| `milestone_selector` | タスク作成時のMS選択 |

### v3.2: 秘書チャットUI改善

| 機能 | 実装 | 備考 |
|---|---|---|
| **テキスト構造化表示** | `formatAssistantMessage()` in SecretaryChat.tsx | 【】見出し、箇条書き、**太字**、番号リストをリッチ表示。`#`マークダウン見出しは**未対応**（残課題） |
| **動的選択肢（suggestions）** | APIレスポンスに`suggestions[]`追加 | intentに応じた次のアクション候補。入力エリア上に青いチップボタンで表示 |
| **マイルストーン開閉式カード** | `milestone_overview`カードタイプ | プロジェクト単位グルーピング → 開閉 → MS期日・タスク件数・進捗バー・超過日数 |
| **タスクカード安全化** | TaskProgressCard / TaskResumeCard | `sendMessage`ループ除去。プロジェクトリンク or チャット入力プリセットに変更 |
| **カレンダー primaryのみ** | `getAllCalendarEvents` | 他人のカレンダーを除外。primaryのみ取得 |

---

## 画面・ルート一覧

### サイドメニュー（5項目）

| 画面 | URL | 主なテーブル |
|---|---|---|
| 秘書 | / | secretary_conversations, inbox_messages, tasks |
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
| 思考マップ | マイルストーン間の思考経路 | thought_task_nodes, thought_edges |
| タスク | テーマ→MS→タスク階層 | themes, milestones, tasks |
| ジョブ | 定型業務 / やることメモ | jobs |
| メンバー | チャネル登録＋メンバー管理を統合。チャネルからメンバー自動取り込み対応 | project_channels, project_members, contact_persons, contact_channels |
| 関連資料 | ドキュメント・スプレッドシートURL一覧。タグ検索対応 | drive_documents |

### リダイレクトページ

| 旧URL | リダイレクト先 |
|---|---|
| /thought-map | / |
| /jobs | / |
| /memos | / |
| /master | /settings |
| /contacts | / |
| /business-log | / |
| /agent | / |

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
| `inbox_messages` | メッセージ（受信+送信） | TEXT | **user_idカラムなし**。directionで区別 |
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
| `drive_file_staging` | ファイルステージング | UUID | AI分類→承認→最終配置 |
| `drive_folders` | Driveフォルダ | UUID | v3.3新構造: 組織/PJ/（ジョブ\|会議議事録\|MS）/タスク。L1-L2は作成時自動生成、L3以降は動的生成 |
| `drive_documents` | Driveドキュメント | UUID | task_id ON DELETE SET NULL。milestone_id, job_id 追加済み。タグ検索対応 |
| `thought_snapshots` | スナップショット | UUID | initial_goal / final_landing |
| `secretary_conversations` | 秘書会話 | UUID | AIコンテキスト用（UI復元なし） |
| `contact_patterns` | パターン分析 | UUID | 日次Cron自動計算 |
| `user_thinking_tendencies` | 思考傾向 | UUID | 日次Cron AI分析 |
| `business_events` | ビジネスイベント | UUID | ai_generated / meeting_record_id nullable |
| `themes` | テーマ（任意中間レイヤー） | UUID | project_id 必須 |
| `milestones` | マイルストーン | UUID | project_id 必須、theme_id nullable。**status CHECK: pending/in_progress/achieved/missed のみ** |
| `meeting_records` | 会議録 | UUID | project_id 必須。**source_type CHECK: text/file/transcription/meetgeek/gemini**。source_file_id TEXT型。v3.0: participants/meeting_start_at/meeting_end_at/metadata/highlights 追加。v6.0: 'gemini'追加（カレンダーイベントIDをsource_file_idに格納） |
| `decision_trees` | 検討ツリーのルート | UUID | project_id 必須 |
| `decision_tree_nodes` | 検討ツリーのノード | UUID | parent_node_id で階層構造。v3.0: source_type/confidence_score/source_message_ids 追加 |
| `decision_tree_node_history` | ノード状態変更履歴 | UUID | node_id FK CASCADE |
| `milestone_evaluations` | チェックポイント評価結果 | UUID | milestone_id FK CASCADE |
| `evaluation_learnings` | 評価エージェント学習データ | UUID | AI判定 vs 人間判定の差分 |
| `seeds` | 種ボックス（廃止済み） | UUID | 参照のみ。新規作成しない |
| `open_issues` | 未確定事項トラッカー | UUID | project_id必須。**status CHECK: open/resolved/stale**。priority_score自動算出。days_stagnant Cron更新。UNIQUE(project_id, title, source_type) |
| `decision_log` | 意思決定ログ | UUID | project_id必須。previous_decision_idで変更チェーン。**status CHECK: active/superseded/reverted/on_hold**。implementation_status別管理 |
| `meeting_agenda` | 会議アジェンダ | UUID | project_id必須。items JSONB配列。**status CHECK: draft/confirmed/completed**。UNIQUE(project_id, meeting_date)。自動生成→確認→完了のライフサイクル |

---

## 秘書AI — 44 Intent

キーワードベース意図分類（< 10ms）で高速判定。優先度順に評価。

**⚠️ V2 intent（#40〜44）は classifyIntent() 内で #29 create_project より前に配置すること**

| # | Intent | 用途 |
|---|---|---|
| 1 | `briefing` | 今日の状況・ブリーフィング |
| 2 | `inbox` | メッセージ一覧 |
| 3 | `message_detail` | 特定メッセージ詳細 |
| 4 | `reply_draft` | 返信下書き生成 |
| 5 | `create_job` | ジョブ作成（AIに任せる） |
| 6 | `calendar` | カレンダー・予定確認 |
| 7 | `schedule` | 日程調整・空き時間 |
| 8 | `tasks` | タスク状況 |
| 9 | `jobs` | ジョブ・対応必要 |
| 10 | `projects` | プロジェクト一覧 |
| 11 | `documents` | ドキュメント・ファイル一覧 |
| 12 | `file_intake` | ファイル確認・承認フロー |
| 13 | `store_file` | ファイル格納指示 |
| 14 | `share_file` | ファイル共有 |
| 15 | `thought_map` | 思考マップ |
| 16 | `business_log` | ビジネスログ |
| 17 | `business_summary` | 活動要約・週間レポート |
| 18 | `create_business_event` | → `upload_meeting_record` にリダイレクト（手動登録廃止） |
| 19 | `knowledge_structuring` | ナレッジ構造化提案 |
| 20 | `create_calendar_event` | カレンダー予定作成 |
| 21 | `create_drive_folder` | Driveフォルダ作成 |
| 22 | `create_task` | タスク作成 |
| 23 | `task_progress` | タスク進行（AIに相談） |
| 24 | `pattern_analysis` | 傾向分析 |
| 25 | `knowledge_reuse` | 過去知見の再利用 |
| 26 | `setup_organization` | 組織セットアップ |
| 27 | `create_contact` | コンタクト作成 |
| 28 | `create_organization` | 組織作成（手動） |
| 29 | `create_project` | プロジェクト作成 |
| 30 | `search_contact` | コンタクト検索 |
| 31 | `task_negotiation` | タスク修正提案・調整 |
| 32 | `consultations` | 社内相談確認 |
| 33 | `link_channel` | チャンネル→PJ紐づけ |
| 34 | `task_external_resource` | タスクに外部資料を取り込み |
| 35 | `knowledge_nodes` | 期間別ナレッジノード表示 |
| 36 | `settings_change` | 設定変更 |
| 37 | `org_projects` | 特定組織のPJ一覧 |
| 38 | `project_tasks` | 特定PJのタスク一覧 |
| 39 | `general` | その他 |
| 40 | `upload_meeting_record` | 会議録アップロード・AI解析 |
| 41 | `milestone_status` | マイルストーン状況確認 |
| 42 | `decision_tree` | 検討ツリー表示・更新 |
| 43 | `checkpoint_evaluation` | チェックポイント評価実行 |
| 44 | `create_milestone` | マイルストーン作成 |

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
| 1 | `/api/agent/chat` | 秘書チャット | inbox, tasks, jobs, calendar, contacts | 2000 |
| 2 | `/api/tasks/chat` | タスクAI会話 | tasks, task_conversations, projects | 1500 |
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

### Webhook エンドポイント

| エンドポイント | 用途 | トリガー |
|---|---|---|
| `/api/webhooks/meetgeek` | MeetGeek会議録自動取り込み | MeetGeek会議完了時 |
| `/api/webhooks/slack/events` | Slack メンション応答 + タスク作成 + リアクション | Slack Events API（app_mention, message, reaction_added） |
| `/api/webhooks/chatwork/events` | Chatwork メンション応答 + タスク作成 + タスク完了 | Chatwork Webhook（mention_to_me, message_created） |

**MeetGeek Webhook処理**: 全処理を`await`で完了してからHTTPレスポンスを返す。AI解析 → 検討ツリー生成まで一気通貫。日本語トランスクリプトのスペース除去前処理付き。

**MeetGeek Webhook取得データ**: 会議完了通知受信時、以下の全データをAPIから取得:
- 会議詳細（タイトル・参加者メール・ホスト・開始/終了時刻・タイムゾーン）
- サマリー + AIインサイト
- 全文トランスクリプト（発言者・タイムスタンプ付き）
- ハイライト（アクションアイテム等）
- **録画リンクは保存しない**（4時間期限付き → `GET /api/meeting-records/[id]/recording` でオンデマンド取得）

**プロジェクト自動判定**: Webhook受信時、以下の優先順位でプロジェクトを自動判定:
0. 参加者メール → `contact_channels` → `contact_persons` → 所属`organization` → `projects`
1. 参加者名 → `contact_persons` → 所属`organization` → `projects`
2. 同日の`business_events`（会議）とサマリー照合
3. フォールバック: 最新プロジェクト

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
| `/api/cron/sync-drive-documents` | 毎日 23:00 | Gmail添付→Driveステージング |
| `/api/cron/clean-drive-staging` | 毎日 00:30 | 期限切れステージングファイル削除 |
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
| `/api/cron/sync-meeting-notes` | 毎日 07:00 | Gemini会議メモ自動取り込み（v6.0） |

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
- 秘書会話はUI復元しない（毎回ダッシュボード表示。DBはAIコンテキスト用のみ）
- **5階層**: Organization > Project > Theme（任意） > Milestone > Task
- **タスク vs ジョブ**: タスク＝思考を伴う作業（MS配下必須）、ジョブ＝定型業務 or やることメモ（PJ配下。SEOレポート・定例MTG等の定期実行に便利）
- **3つのログ**: ビジネスログ（事実）/ 検討ツリー（意思決定）/ 思考ログ（個人の思考経路）
- **1週間サイクル**: マイルストーンは1週間単位で設計、週末に到達判定
- **評価エージェントの自己学習**: AI判定 vs 人間判定の差分を記録、次回プロンプトに注入
- **ナレッジはバックエンド基盤**: 専用UIなし。会議録・メッセージから自動抽出され、AIが内部で自動参照
- **対称データパイプライン**: 会議録(A-1)とチャネルメッセージ(A-2)から business_events / decision_trees / knowledge が対称的に自動生成
- **タスク提案（v5.0改善済み）**: 会議録AI解析でaction_items抽出（担当者ごとに集約+文脈付き） → task_suggestions → 検討ツリータブで直接承認（秘書経由は廃止）
- **MeetGeek全データ取得**: 会議詳細・サマリー・トランスクリプト・ハイライトを保存。録画はオンデマンド取得
- **カレンダー**: `getAllCalendarEvents` はprimaryカレンダーのみ取得
- **タスクカード**: TaskProgressCard / TaskResumeCard は安全化済み。`/tasks`ページは統合カンバンボード（v5.0）
- **秘書チャットUI**: `formatAssistantMessage()`でリッチ表示。`suggestions`（動的選択肢）対応
- **メンバーフォールバック廃止**: project_membersが空でも組織メンバーを返さない。チャネル自動取り込みが正規フロー
- **メンバー検出2経路**: Slackチャネルは `conversations.members` APIで直接取得（メッセージ不要）。Chatwork/Emailは `inbox_messages` から送信者検出。`getChannelMembers()` in `slackClient.service.ts`
- **v3.4 未確定事項**: open_issues テーブルで管理。AI解析で自動検出→自動クローズ。21日以上放置で `stale`
- **v3.4 決定ログ**: decision_log テーブル。不変ログ＋変更チェーン。decision_tree_nodes と連動
- **v3.4 アジェンダ**: meeting_agenda テーブル。open_issues + decision_log + tasks から自動生成。JSONB items
- **Slack OAuth token_data構造**: `access_token`, `token_type`, `team_id`, `team_name`, `bot_user_id`（ボットID共通: `U0AFUJV6HAA`）, `scope`, `authed_user_id`（認証ユーザー個人のSlack ID）, `authed_user_scope`。`authed_user_id` はメッセージのユーザー紐づけに必須
- **チームメンバー（確定）**: suzuki（owner）, yokota, taniguchi, fukuda — 全員 `@next-stage.biz` ドメイン。Slack workspace: 株式会社NextStage
- **インボックス ユーザー分離**: 全ユーザー向けAPIの `inbox_messages` クエリに `.eq('user_id', userId)` 適用済み（14箇所）。Cronジョブはプロジェクト横断処理のため user_id フィルタなし（意図的）
- **インボックス メール除外**: `EMAIL_ENABLED=false` 時、バッジAPI・メッセージ一覧・秘書チャットで email チャネルを除外。`inboxStorage.service.ts` の `loadMessages` に `excludeEmail` オプションあり
- **インボックス ポーリング**: メッセージ取得 `INBOX_POLL_INTERVAL=30秒`（`src/lib/constants.ts`）、バッジ更新 30秒（`AppSidebar.tsx`）
- **MeetGeek日本語スペース除去**: `cleanJapaneseSpaces()` でCJK文字間のスペースを自動除去。Webhook受信時（`formatTranscript`）とAI解析入力時（`analyze/route.ts`）の2箇所で適用
- **AI解析 JSON修復**: `max_tokens: 12000`。AIレスポンスのJSONが途切れた場合、未閉じの括弧を自動補完して修復を試行
- **business_events重複防止**: `meeting_record_id` で既存チェック。既にあれば更新（upsert）、なければ新規挿入
- **会議録 再解析ボタン**: `MeetingRecordList.tsx` にRefreshCwアイコンで実装。AI解析＋検討ツリー生成を手動トリガー可能。未解析時は黄色バナーで通知

### 検討ツリー データフロー

```
データ流入（2経路）:
  経路1: 検討ツリータブで会議録登録（手動）
  経路2: MeetGeek Webhook（自動: 会議終了→参加者からPJ判定→議事録保存）

共通パイプライン:
  → POST /api/meeting-records（meeting_records に保存）
  → POST /api/meeting-records/{id}/analyze（AI解析）
    → meeting_records.ai_summary 更新
    → business_events に自動追加（event_type: meeting, meeting_record_id 付き）
    → knowledge_master_entries にキーワード自動抽出（v3.0）
    → task_suggestions にアクションアイテム自動保存（v5.0: 担当者ごとに集約、context付き）
    → 検討ツリータブの TaskProposalPanel でインライン承認
    → evaluation_learnings にフィードバック保存（該当あれば）
  → POST /api/decision-trees/generate（topics → ノード生成）
    → decision_trees 作成 or 既存取得
    → decision_tree_nodes 作成/更新（タイトル類似判定で重複防止）
    → decision_tree_node_history に履歴記録
```

---

## v3.3 プロジェクト中心リストラクチャリング（全Phase完了）

### 概要
組織レベルの「メンバー」「チャネル」をプロジェクト配下に移動。チャネルとメンバーを1タブに統合。Driveフォルダ構造を用途別に再設計。

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

### Driveフォルダ構造
```
[NodeMap] 組織名/
└── プロジェクト名/
    ├── ジョブ/            ← 定型業務の資料
    ├── 会議議事録/         ← MeetGeek等の格納先
    └── マイルストーン/
        └── MS名/
            └── タスク名/   ← タスク関連ドキュメント蓄積
```

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

【新フロー（v6.0）】
  Google Calendar → Gemini会議メモ（Google Docs添付） → テキストパース（コードのみ） → AnalysisResult
  利点: 無料、即座、確実、Geminiが既に構造化済み
```

### アーキテクチャ

```
データフロー:
  1. Google Meet で会議 → Gemini「メモを取る」ON
  2. 会議終了 → Gemini が Google Docs を自動生成しカレンダーイベントに添付
  3. Cron（sync-meeting-notes）が過去24時間のイベントをスキャン
  4. Google Docs 添付を検出 → Drive API export でテキスト取得
  5. geminiParser がテキストパース → AnalysisResult 形式に変換（AI不要）
  6. meeting_records に保存 + 既存パイプライン実行（ビジネスイベント・タスク提案・検討ツリー等）

手動再解析:
  検討ツリータブの再解析ボタン → analyze API
  → source_type='gemini' なら Geminiパーサー（AI不要）
  → それ以外なら Claude AI（従来通り）
```

### Geminiパーサーの仕様

Gemini会議メモの構造化テキスト（3セクション）をパースする:

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
| `src/services/gemini/geminiParser.service.ts` | Gemini会議メモのテキストパーサー（AI不要） |
| `src/services/gemini/meetingNoteFetcher.service.ts` | カレンダーイベント添付からGoogle Docs取得 |
| `src/app/api/cron/sync-meeting-notes/route.ts` | Cronジョブ: 会議メモ自動取り込み |
| `sql/v6.0_gemini_migration.sql` | meeting_records.source_type に 'gemini' 追加 |

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/services/calendar/calendarClient.service.ts` | CalendarEvent に attachments/conferenceData 追加、supportsAttachments=true |
| `src/app/api/meeting-records/[id]/analyze/route.ts` | source_type='gemini' 分岐追加（Geminiパーサー or Claude AI） |

### meeting_records.source_type CHECK制約

```
旧: ('text', 'file', 'transcription', 'meetgeek')
新: ('text', 'file', 'transcription', 'meetgeek', 'gemini')
```

### Cronスケジュール

| エンドポイント | スケジュール | 用途 |
|---|---|---|
| `/api/cron/sync-meeting-notes` | 毎日 07:00 UTC（= JST 16:00） | Gemini会議メモ自動取り込み |

### ⚠️ 注意事項

- **SQLマイグレーション必須**: `sql/v6.0_gemini_migration.sql` を Supabase で実行してからデプロイ
- **source_file_id にカレンダーイベントID**: 重複取り込み防止のキーとして使用
- **metadata に Gemini Docs 情報**: gemini_doc_id, gemini_doc_url, gemini_doc_title を格納
- **従来のClaude AI解析は維持**: source_type が text/file/transcription/meetgeek の場合は従来通りClaude AI
- **MeetGeek連携も残る**: 既存のMeetGeek Webhookは削除しない（併用可能）
- **Google OAuth スコープ**: 既存の calendar.readonly, calendar.events, drive.file で十分（追加不要）
- **Geminiパーサーはフォールバック安全**: パース失敗時は空の AnalysisResult を返し、メイン処理をブロックしない
