# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-09

> **ドキュメント構成**: このファイルが唯一の設計書（SSOT）。
> V2全9フェーズ + v3.0アップグレード + v3.1 UI改善 + v3.2 秘書チャット改善 実装済み。作業開始前に必ず読んでください。

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
| 4 | `inbox_messages.user_id` は存在しない | カラム不存在エラー | `direction` カラムで送受信を区別 |
| 5 | 既読更新後にキャッシュ無効化 | 既読→未読に戻る | `cache.invalidateByPrefix('messages:')` |
| 6 | タスクIDは `crypto.randomUUID()` | 挿入が静かに失敗 | UUID型。`task-${Date.now()}` は禁止 |
| 7 | Calendar API前に `isCalendarConnected()` | 403エラー | 古いトークンはスコープなし |
| 8 | チャネルトークンの存在を仮定しない | 取得失敗 | `hasChannelToken()` で確認 |
| 9 | mutation後のキャッシュ無効化 | 削除したデータが再表示 | UPDATE/DELETE/INSERT直後に実行 |
| 10 | ファイルアップロードには `project_id` 必須 | アップロード失敗 | Driveフォルダ構造がプロジェクト基盤 |

### 追加の注意

- **Vercel互換params**: `{ params }: { params: Promise<{ id: string }> }` — Promiseで受ける
- **zshブラケット**: `git add "src/app/api/tasks/[id]/route.ts"` — 引用符で囲む
- **knowledge_master_entries.id**: TEXT型、`me_auto_${Date.now()}_${random}` で手動生成
- **milestones.status の制約**: CHECK制約あり。許可値は `'pending'`, `'in_progress'`, `'achieved'`, `'missed'` の4つのみ
- **intent分類の優先順位**: `classifyIntent()` はキーワード一致で**先にマッチしたものが勝つ**。V2 intent（#40〜44）は `create_project`（#29）より**前**に評価すること
- **会議録AI解析のレスポンス構造**: `analyzeData.data.analysis.topics`（× `analyzeData.data.topics` ではない）
- **検討ツリーのデータフロー**: 会議録登録 → AI解析 → 検討ツリー自動生成 → ビジネスイベント自動追加
- **タイムラインは読み取り専用**: 手動イベント登録は廃止。すべて会議録・チャネルメッセージ・Cronから自動生成

---

## 設計原則（v3.0 + v3.2）

### 議事録ファースト

すべてのプロジェクトデータは**会議録またはチャネルメッセージ**から自動生成される。手動の「登録」は原則排除。

```
データの流入経路（2つのみ）:
  1. 会議録 → 検討ツリータブで登録 or MeetGeek Webhook自動連携
  2. チャネルメッセージ → Slack/Chatwork同期（Cron）
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

### サイドメニュー（4項目）

| 画面 | URL | 主なテーブル |
|---|---|---|
| 秘書 | / | secretary_conversations, inbox_messages, tasks |
| インボックス | /inbox | inbox_messages |
| 組織・プロジェクト | /organizations | organizations, projects, business_events |
| 設定 | /settings | 個人設定 |
| ガイド | /guide | 操作ガイド（5タブ構成） |

### 組織レベル（/organizations/[id]）

組織には「設定」タブのみ。名前・ドメイン・関係性等の基本情報管理。配下にプロジェクト一覧。

### プロジェクト詳細（/organizations/[id]）タブ構成（v3.3: 8タブ）

| タブ | 内容 | 主なテーブル |
|---|---|---|
| タイムライン | ビジネスログ（**読み取り専用**） | business_events |
| 検討ツリー | 会議録からAI生成 | decision_trees, decision_tree_nodes, meeting_records |
| 思考マップ | マイルストーン間の思考経路 | thought_task_nodes, thought_edges |
| タスク | テーマ→MS→タスク階層 | themes, milestones, tasks |
| ジョブ | 定型業務 / やることメモ | jobs |
| メンバー | PJ関係者管理（v3.3で組織から移動） | project_members, contact_persons |
| チャネル | PJ紐づけチャネル（1メディア=1推奨） | project_channels |
| 関連資料 | ドキュメント・スプレッドシートURL一覧。タグ検索対応 | drive_documents |

### リダイレクトページ

| 旧URL | リダイレクト先 |
|---|---|
| /tasks | / |
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
| `drive_documents` | Driveドキュメント | UUID | task_id ON DELETE SET NULL。v3.3: milestone_id, job_id 追加予定。タグ検索対応 |
| `thought_snapshots` | スナップショット | UUID | initial_goal / final_landing |
| `secretary_conversations` | 秘書会話 | UUID | AIコンテキスト用（UI復元なし） |
| `contact_patterns` | パターン分析 | UUID | 日次Cron自動計算 |
| `user_thinking_tendencies` | 思考傾向 | UUID | 日次Cron AI分析 |
| `business_events` | ビジネスイベント | UUID | ai_generated / meeting_record_id nullable |
| `themes` | テーマ（任意中間レイヤー） | UUID | project_id 必須 |
| `milestones` | マイルストーン | UUID | project_id 必須、theme_id nullable。**status CHECK: pending/in_progress/achieved/missed のみ** |
| `meeting_records` | 会議録 | UUID | project_id 必須。**source_type CHECK: text/file/transcription/meetgeek**。source_file_id TEXT型。v3.0: participants/meeting_start_at/meeting_end_at/metadata/highlights 追加 |
| `decision_trees` | 検討ツリーのルート | UUID | project_id 必須 |
| `decision_tree_nodes` | 検討ツリーのノード | UUID | parent_node_id で階層構造。v3.0: source_type/confidence_score/source_message_ids 追加 |
| `decision_tree_node_history` | ノード状態変更履歴 | UUID | node_id FK CASCADE |
| `milestone_evaluations` | チェックポイント評価結果 | UUID | milestone_id FK CASCADE |
| `evaluation_learnings` | 評価エージェント学習データ | UUID | AI判定 vs 人間判定の差分 |
| `seeds` | 種ボックス（廃止済み） | UUID | 参照のみ。新規作成しない |

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
- **管理場所**: v3.3よりプロジェクト配下「チャネル」タブで管理（組織レベルから移動）
- **例外**: メール・LINEなど1:1のやり取りは手動紐づけ

### メール休眠フラグ

- **フラグ**: `NEXT_PUBLIC_EMAIL_ENABLED=false` でメール機能をUI非表示（デフォルト: true）
- **定数**: `EMAIL_ENABLED`（`src/lib/constants.ts`）
- **影響**: メール取得スキップ、フィルタ非表示、ブリーフィングから除外
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
| `/api/cron/sync-calendar-events` | 毎日 06:00 | Googleカレンダー同期 |

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
CHATWORK_API_TOKEN=              # Chatwork連携
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
| Slack | OAuth Bot | メッセージ同期 |
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
- **タスク提案**: 会議録AI解析でaction_items抽出 → task_suggestions → 秘書ブリーフィングで承認UI
- **MeetGeek全データ取得**: 会議詳細・サマリー・トランスクリプト・ハイライトを保存。録画はオンデマンド取得
- **既知バグ**: MilestoneSection.tsx — MilestoneCard に projectId が渡されていない（展開時にエラー）
- **v3.2 カレンダー修正**: `getAllCalendarEvents` はprimaryカレンダーのみ取得（他人の「業務」ブロックで全時間が埋まる問題を修正済み）
- **v3.2 タスクカード**: TaskProgressCard / TaskResumeCard から`sendMessage`による無限ループを除去済み。タスク詳細ページは存在しない（`/tasks`はリダイレクト）
- **v3.2 秘書チャットUI**: `formatAssistantMessage()`でアシスタントメッセージをリッチ表示。APIは`suggestions`（動的選択肢）を返却
- **v3.2 intent判定順序**: `create_milestone` → `checkpoint_evaluation` → `milestone_status` → `project_status` の順に配置（`project_status`の「進捗+教えて」がMSを横取りしないよう修正済み）
- **v3.2 マイルストーンカード**: `milestone_overview`カード（プロジェクト単位グルーピング・開閉式）を追加。ただしDB上にactive MSがないとテキスト応答のみ

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
    → task_suggestions にアクションアイテム自動保存（v3.0: action_items[]）
    → evaluation_learnings にフィードバック保存（該当あれば）
  → POST /api/decision-trees/generate（topics → ノード生成）
    → decision_trees 作成 or 既存取得
    → decision_tree_nodes 作成/更新（タイトル類似判定で重複防止）
    → decision_tree_node_history に履歴記録
```

---

## v3.3 プロジェクト中心リストラクチャリング（設計済み・実装予定）

### 概要
組織レベルの「メンバー」「チャネル」をプロジェクト配下に移動。Driveフォルダ構造を用途別に再設計。

### 組織→プロジェクト引っ越し
- **組織レベル**: 「設定」タブのみ残す（メンバー・チャネル削除）
- **プロジェクト配下**: 8タブ（タイムライン/検討ツリー/思考マップ/タスク/ジョブ/メンバー/チャネル/関連資料）
- **チャネル推奨**: Slack 1、Chatwork 1、メール任意（休眠中）

### Driveフォルダ新構造
```
[NodeMap] 組織名/
└── プロジェクト名/
    ├── ジョブ/            ← 定型業務の資料
    ├── 会議議事録/         ← MeetGeek等の格納先
    └── マイルストーン/
        └── MS名/
            └── タスク名/   ← タスク関連ドキュメント蓄積
```
- L1（組織）・L2（PJ）: 作成時に自動生成
- L3以降: ファイル保存時に動的生成
- ファイル名: `YYYY-MM-DD_種別_原名.ext`
- メタデータタグ: PJ・MS・タスク・ジョブで検索可能

### 関連資料タブ（v3.3新設）
- ドキュメント・スプレッドシートURL・外部リンクを一覧管理
- タグ（PJ/MS/タスク/ジョブ）で絞り込み検索
- 各アイテムにリンクショートカット

### ジョブの2種類
- **定型業務**: SEOレポート、定例MTGなど定期実行
- **やることメモ**: 一時的なTODO

### 実装フェーズ（詳細: docs/RESTRUCTURING_V3.3.md）
- Phase 1: DBスキーマ拡張（project_members, drive_documents拡張）
- Phase 2: UIリストラクチャリング（タブ移動・新規コンポーネント）
- Phase 3: Driveフォルダ再構築
- Phase 4: Cron・AIパイプライン更新

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
