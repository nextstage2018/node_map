# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-05

> **ドキュメント構成**: このファイルが作業の起点。詳細仕様は `docs/` 配下の2ファイルを参照。
> 作業開始前に、関連セクションを必ず読んでください。

| ファイル | 内容 |
|---|---|
| **docs/TABLE_SPECS.md** | DB現状マスタ — 全テーブルのCREATE文・制約・インデックス |
| **docs/FEATURES.md** | 全機能仕様 — データフロー・ルール・テストチェックリスト |
| **docs/PHASE_HISTORY.md** | フェーズ実装履歴（アーカイブ・普段読まない） |

---

## プロジェクト概要

**NodeMap** は「情報を受け取り → 整理し → 活用する」個人・チーム向けコミュニケーション＆ビジネスログツール。

- **フレームワーク**: Next.js 14 / TypeScript / Tailwind CSS
- **DB**: Supabase（PostgreSQL）
- **AI**: Claude API（claude-sonnet-4-5-20250929）
- **デプロイ**: Vercel（本番: https://node-map-eight.vercel.app）
- **リポジトリ**: https://github.com/nextstage2018/node_map.git
- **ローカル**: ~/Desktop/node_map_git

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
| `seeds` | 種ボックス（廃止予定） | UUID | project_id / user_id あり |
| `tasks` | タスク | UUID | seed_id / project_id / due_date / scheduled_start/end |
| `task_members` | グループタスクメンバー | UUID | UNIQUE(task_id, user_id) |
| `jobs` | ジョブ | UUID | type / status / ai_draft / scheduled fields |
| `consultations` | 社内相談 | UUID | requester→responder→AI返信生成 |
| `idea_memos` | アイデアメモ | UUID | tags TEXT[] |
| `thought_task_nodes` | ノード紐づけ | UUID | UNIQUE(task_id, node_id) |
| `thought_edges` | 思考動線 | UUID | UNIQUE(task_id, from_node_id, to_node_id) |
| `knowledge_master_entries` | ナレッジ | TEXT | 手動生成。field_id NULLable |
| `drive_file_staging` | ファイルステージング | UUID | AI分類→承認→最終配置 |
| `drive_folders` | Driveフォルダ | UUID | 4階層: 組織/プロジェクト/方向/年月 |
| `drive_documents` | Driveドキュメント | UUID | task_id ON DELETE SET NULL |
| `thought_snapshots` | スナップショット | UUID | initial_goal / final_landing |
| `secretary_conversations` | 秘書会話 | UUID | AIコンテキスト用（UI復元なし） |
| `contact_patterns` | パターン分析 | UUID | 日次Cron自動計算 |
| `user_thinking_tendencies` | 思考傾向 | UUID | 日次Cron AI分析 |
| `business_events` | ビジネスイベント | UUID | ai_generated / summary_period |

---

## 画面・ルート一覧

| 画面 | URL | 主なテーブル |
|---|---|---|
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks / task_conversations |
| ジョブ | /jobs | jobs / consultations |
| アイデアメモ | /memos | idea_memos / memo_conversations |
| 思考マップ | /thought-map | thought_task_nodes / thought_edges |
| コンタクト | /contacts | contact_persons / contact_channels |
| 組織 | /organizations | organizations / organization_channels |
| 組織詳細 | /organizations/[id] | organizations / contact_persons |
| ナレッジ | /master | knowledge_domains / knowledge_master_entries |
| ビジネスログ | /business-log | projects / business_events |
| 秘書 | /agent | tasks / seeds（読み取り専用） |
| 種ボックス（廃止予定） | /seeds | seeds |
| 設定 | /settings | organizations / contact_persons |

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

**共通コンテキスト**: getUserWritingStyle()（過去送信10件） / メール署名（メールのみ） / buildPersonalizedContext()（性格・思考傾向）

**フォールバック**: AI失敗時はテンプレート生成 or メッセージそのまま使用。メイン処理をブロックしない。

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
EMAIL_USER=                      # メール取得用
SLACK_BOT_TOKEN=                 # Slack連携（チームレベル）
CHATWORK_API_TOKEN=              # Chatwork連携
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

---

## 既知の仕様

- コンタクト集約キー: `from_address`（email=メアド / chatwork=account_id / slack=UXXXXX）
- 組織重複防止: domain でチェック（SetupWizard実装済み）
- コンタクトは1組織のみ所属（横断ガード: 409エラー）
- メンバー追加時に `company_name` と `relationship_type` を自動設定
- メール署名: メールのみ自動付与（Slack/CWは付与しない）
- AI文体学習: `getUserWritingStyle()` で過去送信10件を参照
- パーソナライズ: `buildPersonalizedContext()` で性格タイプ・思考傾向・オーナー方針を注入

---

## 作業フロー

```
【作業開始前】
1. このCLAUDE.mdの「10のルール」を確認
2. 関連する docs/FEATURES.md のセクションを読む
3. テーブル操作がある場合 docs/TABLE_SPECS.md を確認

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
