# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-02-26（Phase 41 まで反映）

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

## 重要なテーブル仕様（必ず守ること）

| テーブル名 | 備考 |
|---|---|
| `contact_persons` | コンタクト本体。id は TEXT型（自動生成なし）→ 必ず `'team_${Date.now()}_${random}'` 等で生成して渡す |
| `contact_channels` | コンタクトの連絡先。UNIQUE(contact_id, channel, address) 制約あり |
| `inbox_messages` | メッセージ本体（受信＋送信）。user_id カラムは存在しない。direction カラムで送受信を区別（received/sent） |
| `unified_messages` | 現在は空。inbox_messages を使うこと |
| `organizations` | 自社・取引先組織。domain で重複チェック。relationship_type / address / phone / memo カラムあり |
| `organization_channels` | 組織に紐づくチャネル（Slack/CW/Email）。UNIQUE(organization_id, service_name, channel_id) |
| `projects` | プロジェクト。organization_id で組織に紐づく |
| `project_channels` | プロジェクトとチャネルの紐づけ。UNIQUE(project_id, service_name, channel_identifier) |
| `seeds` | 種ボックス。project_id で紐づけ可。user_id カラムあり |
| `tasks` | タスク。id は UUID型（DEFAULT gen_random_uuid()）。seed_id / project_id カラムあり |

---

## 画面・ルート一覧

| 画面 | URL | 主なテーブル |
|---|---|---|
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks / task_conversations |
| 思考マップ | /nodemap | user_nodes / node_edges |
| コンタクト | /contacts | contact_persons / contact_channels |
| 組織 | /organizations | organizations / organization_channels |
| 組織詳細 | /organizations/[id] | organizations / organization_channels / contact_persons |
| ナレッジ | /master | knowledge_domains / knowledge_fields / knowledge_master_entries |
| ビジネスログ | /business-log | projects / business_events / project_channels |
| 秘書 | /agent | tasks / seeds / user_nodes（読み取り専用） |
| 種ボックス | /seeds | seeds |
| 設定 | /settings | organizations / contact_persons / projects |

---

## API パターン（既存コードに必ず合わせること）

```typescript
// 認証
import { getServerUserId } from '@/lib/serverAuth';
const userId = await getServerUserId();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// レスポンス
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ error: 'message' }, { status: 400 });
```

### Supabase クライアントの使い分け（重要）
```typescript
import { getSupabase, getServerSupabase, createServerClient } from '@/lib/supabase';

// getServerSupabase() → service role key（キャッシュ付きシングルトン）。★ サービス層では基本これを使う
// getSupabase() → anon key。RLSの影響を受ける。クライアントサイドやフォールバック用
// createServerClient() → service role key（毎回新規生成）。特殊ケースのみ

// ★重要: TaskService など サーバーサイドのサービス層では getServerSupabase() || getSupabase() を使用
// Phase 41 で全メソッドをこのパターンに統一済み（RLSバイパス）
```

---

## 実装済みフェーズ（コミット履歴）

| Phase | 内容 | コミット |
|---|---|---|
| 30a+30b | マスターデータ基盤・簡単登録UI | 20fec1b |
| 30c+30d | 自動マッチング・ビジネスログ基盤 | f2d2b81 |
| 31 | 種AI会話強化 | f8b1195 |
| 32 | パーソナル秘書エージェント | 03ed3a7 |
| 33 | ビジネスログ強化（議事録・参加者） | 86b5ccf |
| 34 | コンタクト強化・組織ページ | ceb958d |
| 35 | コンタクトマージ・重複解消・チャンネル統合 | mainにマージ済み |
| 36 | AIコミュニケーション分析（コンタクトnotes自動生成） | mainにマージ済み |
| 37 | 組織チャネル連携・メンバー管理・自動検出 | mainにマージ済み |
| 37b | 組織関係性・詳細情報・コンタクト連動・ラベル統一 | 39b676e |
| 38 | 送信メッセージDB保存・スレッド統合表示・送信済みフィルタ | mainにマージ済み |
| 38b | 返信修正・送信文字色改善・宛先サジェスト機能 | mainにマージ済み |
| 39 | AIコミュニケーション分析を双方向（受信＋送信）対応に拡張 | 6cbc3c8 |
| 39b | 外部サービス送信検出＋AI分析ルーム/チャンネルマッチング | 82ecfdb |
| 40 | タスク・種ボックス・ノードマップ修正 | mainにマージ済み |
| 40b | 種AI会話DB保存・プロジェクト選択・インボックスAI種化 | mainにマージ済み |
| 40c | 組織→プロジェクト→チャネル階層・種プロジェクト自動検出・バグ修正 | abbaf17 |
| 41 | 種・タスクRLSバグ修正＋AI構造化タスク変換＋伴走支援AI会話 | 7c202f2 |

---

## Phase 41 実装内容（種→タスク強化・AI伴走支援）

### バグ修正
- **種ボックス保存不可（致命的）**: `TaskService` 全メソッドが `getSupabase()`（anon key）を使用していたため RLS で INSERT/SELECT 失敗 → `getServerSupabase() || getSupabase()` に統一
- **種一覧が空になる**: `getSeeds()` の `.select('*, projects(name)')` が `project_id` カラム未追加時に JOIN エラー → フォールバック（JOINなし再試行）を追加
- **種→タスク変換失敗**: `confirmSeed` に `user_id` が渡されていない → confirm API ルートから userId を渡すよう修正
- **seed_conversations のRLS**: `getSupabase()` → `getServerSupabase()` に修正

### DBマイグレーション（Supabase実行済み）
```sql
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_from TEXT;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
```

### AI構造化タスク変換
- `confirmSeed` を全面改修: 種の内容＋AI会話履歴を Claude API に渡して構造化情報（タイトル・ゴール・内容・懸念・期限・メモ・優先度）を自動生成
- `convert` API も `confirmSeed` 経由に統一（AI構造化が両ルートで動作）
- 種の会話履歴（`seed_conversations`）→ タスクの会話履歴（`task_conversations`）に引き継ぎ
- `due_date` カラムにAI推定の期限を保存

### 構想メモの編集対応（TaskAiChat.tsx）
- AI構造化で埋めた値（ゴール・内容・懸念・期限）をフォームの初期値として復元
- 構想メモがある状態でも「✏️ 編集」ボタンで再編集可能
- 「保存のみ」ボタン追加（DB保存のみ、AIに送信しない）
- 期限日は `due_date` カラムにも保存

### AI会話の伴走支援化（aiClient.service.ts）
- システムプロンプトを「伴走パートナー」に改定（構想・進行・結果の各フェーズ）
- 種から生まれたタスクは構想メモ＋種の経緯をコンテキストに含める
- モデルを `claude-sonnet-4-5-20250929` に統一（コスト最適化）

### 変更ファイル一覧
- `src/lib/supabase.ts` — `getServerSupabase()` 追加（キャッシュ付き service role client）
- `src/services/task/taskClient.service.ts` — 全メソッド RLS 対応、`confirmSeed` AI 構造化、`structureSeedWithAI` 追加
- `src/app/api/seeds/[id]/confirm/route.ts` — userId を confirmSeed に渡す
- `src/app/api/seeds/convert/route.ts` — confirmSeed 経由に統一
- `src/app/api/seeds/chat/route.ts` — getServerSupabase 対応
- `src/components/tasks/TaskAiChat.tsx` — 構想メモ編集対応・保存のみボタン
- `src/services/ai/aiClient.service.ts` — 伴走支援型プロンプト・sonnet モデル統一

---

## Phase 40c 実装内容（組織-プロジェクト-チャネル階層）

### 組織→プロジェクト紐づけ
- `projects` テーブルに `organization_id UUID` カラム追加
- `/api/projects` GET: `organizations(name)` を JOIN して取得
- `/api/projects` POST: `organizationId` で組織紐づけ
- `/api/projects` PUT: 新規追加（プロジェクト更新）
- ビジネスログ画面: プロジェクト作成時に組織を選択可能

### プロジェクト→チャネル紐づけ
- `project_channels` テーブル新設
- `/api/projects/[id]/channels` GET/POST/DELETE
- `/api/projects/[id]/messages` GET: 紐づけチャネルの inbox_messages を取得
- ビジネスログ画面: チャネル設定パネル、チャネルメッセージタブ

### 種のプロジェクト自動検出
- インボックスから種化する際、チャネル情報（slackChannel/chatworkRoomId）で `project_channels` を検索
- 1件マッチ → 自動紐づけ、複数マッチ → モーダルで選択
- `/api/seeds` POST: `detectProjectFromChannel()` 関数で自動検出
- `/api/seeds` PUT: `projectId` のみの部分更新をサポート

### タスク変換時のプロジェクト確認モーダル
- 種→タスク変換時にプロジェクトを選択するモーダルを表示
- `/api/seeds/convert` POST: `TaskService.createTask()` 経由でタスク作成（RLS整合性対応）
- `CreateTaskRequest` に `seedId` / `projectId` 追加

### DBマイグレーション（Supabase実行済み）
```sql
-- 020_phase40c_project_organization.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- 021_phase40c_project_channels.sql
CREATE TABLE IF NOT EXISTS project_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_channel_id UUID REFERENCES organization_channels(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  channel_identifier TEXT NOT NULL,
  channel_label TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, service_name, channel_identifier)
);

-- 022_phase40c_task_project.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_seed_id ON tasks(seed_id);
```

### 変更ファイル一覧
- `src/lib/types.ts` — Project に organizationId/organizationName、Task に projectId、CreateTaskRequest に seedId/projectId
- `src/app/api/projects/route.ts` — GET(JOIN組織)/POST(組織紐づけ)/PUT(新規)
- `src/app/api/projects/[id]/channels/route.ts` — 新規: チャネルCRUD
- `src/app/api/projects/[id]/messages/route.ts` — 新規: チャネルメッセージ取得
- `src/app/api/seeds/route.ts` — プロジェクト自動検出・projectId部分更新
- `src/app/api/seeds/convert/route.ts` — TaskService.createTask()経由に変更
- `src/app/business-log/page.tsx` — 組織選択・チャネル設定・メッセージタブ
- `src/app/seeds/page.tsx` — タスク変換プロジェクトモーダル・エラー表示
- `src/components/inbox/MessageDetail.tsx` — 種化時のプロジェクト自動検出・選択モーダル
- `src/services/task/taskClient.service.ts` — createTask に seedId/projectId、mapTaskFromDb に seedId/projectId、createSeed リトライ時 project_id 除外

---

## 残課題（未実装・未解決バグ）

### ✅ Phase 41 で解決済み
- ~~🔴 種ボックスの保存が動作しない~~ → RLS対応で解決
- ~~🟡 種→タスク変換後にタスクが表示されない~~ → confirmSeed に userId 追加で解決
- ~~🟡 プロジェクト紐づけで種が登録できない~~ → seeds テーブルに project_id カラム追加で解決

### 🟡 次の設計課題: 思考マップの体験価値設計
- タスク詳細の「詳細」タブの役割を再定義（構想メモとの重複解消 → 伴走ログ・変遷履歴に転換？）
- 種→タスクの AI 会話が生む思考ノードの可視化設計
- 「人の思考の流れ」を思考マップでどう表現するかの UX 設計

### その他の未実装課題
1. **auto生成コンタクト同士の連絡先結合**: isAutoGenerated: true 同士の統合は未実装
2. **ビジネスログの活動履歴連携**: business_events の contact_id 未設定問題
3. **宛先サジェストのデータソース拡充**: API直接取得による全ルーム・全チャネル表示は未対応

---

## 既知の仕様・注意事項

### コンタクト一覧の集約ロジック
- `contact_persons` 主体で取得（1人1行保証）
- inbox_messages の集約キー: `from_address`（email=メアド / chatwork=account_id数値 / slack=UXXXXX）
- from_address が空の場合: from_name をスペース正規化してフォールバック
- 自分自身のメールアドレスからのメッセージ（Me）は除外済み

### 組織の重複防止
- SetupWizard でドメイン重複チェック済み（同じ domain が存在すれば新規作成しない）

### 組織とコンタクトの連動ルール
- コンタクトは1つの組織にのみ所属可能（組織横断ガード: 409エラー）
- メンバー追加時に `company_name` と `relationship_type` を自動設定
- 組織の基本情報保存時に所属コンタクト全員の `company_name` と `relationship_type` を連動更新
- メンバー削除時に `company_name` をクリア
- メンバータブ表示時に `company_name` 未設定メンバーを自動修復

### 送信サービス関数の引数（位置引数、オブジェクトではない）
- `sendEmail(to, subject, body, inReplyTo?, cc?)` → `Promise<boolean>`
- `sendSlackMessage(channelId, text, threadTs?, userId?)` → `Promise<boolean>`
- `sendChatworkMessage(roomId, body)` → `Promise<boolean>`
- 返信時のチャネルID: Slack → `metadata.slackChannel`、Chatwork → `metadata.chatworkRoomId`
- Chatwork To形式: `[To:数値account_id]`（名前ではない）

### タスクのID生成
- `tasks` テーブルの id は UUID型（`DEFAULT gen_random_uuid()`）
- コード内では `crypto.randomUUID()` を使用
- **絶対に** `task-${Date.now()}` 形式を使わないこと（過去に発生したバグ）

### Vercel Cron
- vercel.json に crons 設定済み
- 環境変数 `CRON_SECRET` が必要

### ビルドエラー対処
```bash
# キャッシュエラーの場合
rm -rf .next && npm run build
# 依存関係エラーの場合
rm -rf .next node_modules package-lock.json && npm install && npm run build
```

---

## 作業フロー（Claude Code への指示テンプレート）

```
CLAUDE.md を読んでから作業を開始してください。

【タスク】Phase XX: 機能名

【手順】
1. git checkout -b feature/phase-XX-name
2. SQLファイル作成（実行はしない）
3. API作成
4. UI作成
5. npm run build でビルド確認
6. git commit してコミットハッシュを報告

【注意】
- 既存画面を壊さないこと
- contact_persons テーブルの id は TEXT型のため必ず生成して渡す
- inbox_messages を使うこと（unified_messages ではない）
- inbox_messages に user_id カラムは存在しない
- APIは既存パターン（getServerUserId + NextResponse.json）に従うこと
- tasks テーブルの id は UUID型 → crypto.randomUUID() を使う
- Supabase クライアントは読み書きで同じものを使う（getSupabase or createServerClient、混在させない）
```

---

## 環境変数（.env.local / Vercel）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=
```
