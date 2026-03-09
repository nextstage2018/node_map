# NodeMap V2 — 各フェーズ作業スレッド用指示書

最終更新: 2026-03-06

> **使い方**: 各フェーズの「---ここから貼り付け---」〜「---ここまで---」をそのまま新しい作業スレッドの最初のメッセージとして貼り付けてください。

---

## Phase V2-A: DB — 新規テーブル作成 + 既存テーブル変更

### ---ここから貼り付け---

# V2-A: DBマイグレーション（新規8テーブル + 既存4テーブル変更）

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション7.3）、`docs/TABLE_SPECS.md` を必ず読んでください
- ブランチ: `feature/v2-a-db-setup`

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-a-db-setup
```

### 2. 新規8テーブルのSQLファイル作成

`sql/v2-a-create-tables.sql` に以下の8テーブルのCREATE TABLE文を作成してください。CREATE文は `docs/ARCHITECTURE_V2.md` セクション7.3にあるものをそのまま使用します。

作成順序（FK依存順）:

1. **themes** — project_id FK → projects(id) ON DELETE CASCADE
2. **milestones** — project_id FK → projects(id) ON DELETE CASCADE, theme_id FK → themes(id) ON DELETE SET NULL
3. **meeting_records** — project_id FK → projects(id) ON DELETE CASCADE
4. **decision_trees** — project_id FK → projects(id) ON DELETE CASCADE
5. **decision_tree_nodes** — tree_id FK → decision_trees(id) ON DELETE CASCADE, parent_node_id FK → self ON DELETE SET NULL, cancel_meeting_id / source_meeting_id FK → meeting_records(id)
6. **decision_tree_node_history** — node_id FK → decision_tree_nodes(id) ON DELETE CASCADE, meeting_record_id FK → meeting_records(id)
7. **milestone_evaluations** — milestone_id FK → milestones(id) ON DELETE CASCADE
8. **evaluation_learnings** — milestone_id FK → milestones(id) ON DELETE CASCADE, project_id FK → projects(id) ON DELETE CASCADE, meeting_record_id FK → meeting_records(id)

### 3. 既存4テーブルの変更SQLファイル作成

`sql/v2-a-alter-tables.sql` に以下のALTER TABLE文を作成:

```sql
-- tasks テーブル: milestone_id 追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

-- jobs テーブル: project_id 追加
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- thought_task_nodes テーブル: milestone_id 追加
ALTER TABLE thought_task_nodes ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;

-- business_events テーブル: meeting_record_id 追加
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL;
```

### 4. インデックスSQLファイル作成

`sql/v2-a-indexes.sql` に主要なインデックスを作成:

- themes: `project_id`
- milestones: `project_id`, `theme_id`, `status`
- meeting_records: `project_id`, `meeting_date`
- decision_trees: `project_id`
- decision_tree_nodes: `tree_id`, `parent_node_id`, `status`
- milestone_evaluations: `milestone_id`
- evaluation_learnings: `milestone_id`, `project_id`
- tasks: `milestone_id`（新カラム）
- jobs: `project_id`（新カラム）

### 5. TABLE_SPECS.md の更新

`docs/TABLE_SPECS.md` に新規8テーブルのセクションを追加し、既存テーブルの変更も反映してください。既存のフォーマットに合わせてください。

### 6. TypeScript型定義の作成

`src/types/v2.ts` に新規テーブルに対応するTypeScript型を定義:

```typescript
// Theme, Milestone, MeetingRecord, DecisionTree, DecisionTreeNode,
// DecisionTreeNodeHistory, MilestoneEvaluation, EvaluationLearning
```

各テーブルのカラムと型を正確に一致させてください。

### 7. ビルド確認

```bash
rm -rf .next && npm run build
```

### 8. コミット

```bash
git add "sql/" "src/types/v2.ts" "docs/TABLE_SPECS.md"
git commit -m "V2-A: Add 8 new tables and alter 4 existing tables for V2 hierarchy"
```

## 注意事項

- **SQLは実行しない**（Supabaseのダッシュボードで手動実行する）
- SQLファイルを作成するのみ
- `IF NOT EXISTS` を使って冪等性を確保
- 既存データを壊さない（ALTER TABLE ADD COLUMN のみ）
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-B: UI構造変更 — サイドメニュー4項目化 + PJ詳細タブ + 削除機能

### ---ここから貼り付け---

# V2-B: UI構造変更（サイドメニュー + PJ詳細タブ + 削除基盤 + リダイレクト整理）

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/UI_V2_SPEC.md`、`docs/ARCHITECTURE_V2.md` を必ず読んでください
- 前提フェーズ: V2-A 完了済み
- ブランチ: `feature/v2-b-ui-restructure`

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-b-ui-restructure
```

### 2. 共通コンポーネント作成

#### 2-1. DeleteConfirmDialog

`src/components/shared/DeleteConfirmDialog.tsx` を新規作成:

```typescript
interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;           // 例: 「組織「A社」を削除しますか？」
  description: string;      // カスケード影響の説明
  confirmText?: string;     // 入力確認が必要な場合の文字列（組織名など）
  isLoading?: boolean;
}
```

- 重要エンティティ（組織・PJ）は名前入力で確認
- 軽量エンティティはシンプル確認
- 配色: CLAUDE.md の nm-* カスタムカラー準拠（背景 nm-surface、ボーダー nm-border、削除ボタンは赤）

#### 2-2. MoreMenu（「…」メニュー）

`src/components/shared/MoreMenu.tsx` を新規作成:

```typescript
interface MoreMenuProps {
  items: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';  // danger = 赤文字
  }[];
}
```

- MoreHorizontal アイコン（lucide-react）
- クリックでドロップダウン表示
- danger バリアントは赤文字

### 3. サイドメニュー4項目化

`src/components/shared/AppSidebar.tsx` を修正:

**現在の6項目:**
1. 秘書（/）
2. インボックス（/inbox）
3. タスク（/tasks）← 削除
4. 思考マップ（/thought-map）← 削除
5. 組織・PJ（/organizations）
6. 設定（/settings）

**V2の4項目:**
1. 秘書（/）— Bot アイコン
2. インボックス（/inbox）— Inbox アイコン（未読バッジ維持）
3. 組織・PJ（/organizations）— Building2 アイコン
4. 設定（/settings）— Settings アイコン

### 4. プロジェクト詳細ページのタブ構成変更

`src/app/organizations/[id]/page.tsx` を修正:

**現在のプロジェクトタブ（3つ）:**
- タイムライン / タスク / ドキュメント

**V2のプロジェクトタブ（5つ）:**
1. **タイムライン** — 既存の BusinessTimeline 継続。各イベントに MoreMenu（削除）追加
2. **検討ツリー** — 新規タブ。この段階では「準備中」プレースホルダーでOK
3. **思考マップ** — 既存の思考マップUIをここに移動（`/thought-map` から統合）
4. **タスク** — 既存のタスク一覧を継続。テーマ→MS→タスクの3階層UIはV2-Cで実装するので、この段階では現行の表示でOK
5. **ジョブ** — `/jobs` ページの内容をここに統合

タブのアイコン（lucide-react）:
- タイムライン: Clock
- 検討ツリー: GitBranch
- 思考マップ: Map
- タスク: CheckSquare
- ジョブ: Briefcase

### 5. 不要ページの削除・リダイレクト設定

#### 完全削除:
- `src/app/seeds/page.tsx` — 削除
- `src/app/nodemap/page.tsx` — 削除

#### リダイレクト変更:
- `src/app/master/page.tsx` → `/settings?tab=knowledge` にリダイレクト
- `src/app/jobs/page.tsx` → `/organizations` にリダイレクト
- `src/app/memos/page.tsx` → `/` にリダイレクト（秘書チャットで代替）
- `src/app/tasks/page.tsx` → `/organizations` にリダイレクト
- `src/app/thought-map/page.tsx` → `/organizations` にリダイレクト

#### リダイレクト維持（変更なし）:
- `src/app/contacts/page.tsx` → /organizations
- `src/app/business-log/page.tsx` → /organizations
- `src/app/agent/page.tsx` → /

### 6. 既存エンティティへの削除ボタン追加

以下のUIに MoreMenu + DeleteConfirmDialog を追加:

- **組織カード**（組織一覧）: MoreMenu → 編集 / 削除。API: DELETE /api/organizations/[id] （既存）
- **プロジェクトカード**（組織一覧）: MoreMenu → 編集 / 削除。API: DELETE /api/projects/[id] （既存）
- **ビジネスイベント**（タイムライン）: MoreMenu → 削除。API: DELETE /api/business-events/[id] （既存）
- **タスク**（タスクタブ）: MoreMenu → 削除。API: DELETE /api/tasks?id=xxx （既存）

組織・PJの削除は名前入力確認。タスク・イベントはシンプル確認。

### 7. コンタクト削除API新規作成

`src/app/api/contacts/[id]/route.ts` に DELETE ハンドラを新規作成:

```typescript
// 認証パターン
import { getServerUserId } from '@/lib/serverAuth';
const userId = await getServerUserId();

// Supabase パターン
const supabase = getServerSupabase() || getSupabase();

// contact_channels は ON DELETE CASCADE で自動削除
// contact_persons を削除
```

### 8. ビルド確認

```bash
rm -rf .next && npm run build
```

### 9. コミット

```bash
git add -A
git commit -m "V2-B: Restructure UI - 4-item sidebar, 5-tab project detail, delete dialogs, redirects"
```

## 注意事項

- **Vercel互換params**: `{ params }: { params: Promise<{ id: string }> }` — Promiseで受ける
- **zshブラケット**: `git add "src/app/api/contacts/[id]/route.ts"` のようにパスを引用符で囲む
- 配色は CLAUDE.md の nm-* カスタムカラーに従う（slate ベース + blue アクセント）
- 思考マップ統合は、既存コンポーネントを import して配置する形でOK（コピーではなく参照）
- ジョブ統合も同様（既存の JobList 系コンポーネントを再利用）
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-C: テーマ・マイルストーン CRUD API + UI

### ---ここから貼り付け---

# V2-C: テーマ・マイルストーン CRUD API + UI

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション2, 4）、`docs/UI_V2_SPEC.md`（セクション3.3 タブ4）、`docs/TABLE_SPECS.md` を必ず読んでください
- 前提フェーズ: V2-A, V2-B 完了済み
- ブランチ: `feature/v2-c-theme-milestone-crud`
- テーブル `themes`, `milestones` は V2-A で作成済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-c-theme-milestone-crud
```

### 2. テーマ CRUD API

#### `src/app/api/themes/route.ts` — GET(一覧) / POST(作成)

```
GET /api/themes?project_id=xxx → テーマ一覧（sort_order順）
POST /api/themes → { project_id, title, description?, sort_order? }
```

#### `src/app/api/themes/[id]/route.ts` — GET / PUT / DELETE

```
GET /api/themes/[id] → テーマ詳細
PUT /api/themes/[id] → { title?, description?, status?, sort_order? }
DELETE /api/themes/[id] → 削除（milestones.theme_id は ON DELETE SET NULL）
```

### 3. マイルストーン CRUD API

#### `src/app/api/milestones/route.ts` — GET(一覧) / POST(作成)

```
GET /api/milestones?project_id=xxx&theme_id=xxx → マイルストーン一覧
POST /api/milestones → { project_id, theme_id?, title, description?, start_context?, target_date?, sort_order? }
```

#### `src/app/api/milestones/[id]/route.ts` — GET / PUT / DELETE

```
GET /api/milestones/[id] → マイルストーン詳細（配下タスク数・完了数を含む）
PUT /api/milestones/[id] → { title?, description?, start_context?, target_date?, achieved_date?, status?, sort_order? }
DELETE /api/milestones/[id] → 削除（tasks.milestone_id は ON DELETE SET NULL）
```

### 4. タスクタブのUI再構成

プロジェクト詳細のタスクタブ（V2-Bでプレースホルダーだった部分を含む）を、テーマ → マイルストーン → タスクの3階層表示に変更:

```
┌─────────────────────────────────────┐
│ + テーマ追加                         │
│                                     │
│ 📁 テーマ: ターゲット再定義    [···] │  ← MoreMenu（編集/削除）
│  ├── 🏁 Week1: 現状分析      [···] │  ← MoreMenu（編集/削除）
│  │    ├── ☑ 競合3社LP収集     [···] │  ← MoreMenu（削除）
│  │    ├── ☐ ユーザー調査設計   [···] │
│  │    └── + タスク追加              │
│  ├── 🏁 Week2: 仮説立案      [···] │
│  │    └── ...                       │
│  └── + マイルストーン追加            │
│                                     │
│ ── テーマなし ──                     │
│  └── 🏁 初期セットアップ            │
│       └── ...                       │
└─────────────────────────────────────┘
```

UIコンポーネント構成:
- `src/components/v2/TaskHierarchyView.tsx` — 全体を管理する親コンポーネント
- `src/components/v2/ThemeSection.tsx` — テーマ単位の折りたたみセクション
- `src/components/v2/MilestoneSection.tsx` — マイルストーン単位。配下タスク一覧 + 進捗バー
- `src/components/v2/ThemeForm.tsx` — テーマ作成・編集フォーム（モーダル）
- `src/components/v2/MilestoneForm.tsx` — マイルストーン作成・編集フォーム（モーダル）

### 5. 既存タスク作成フォームの修正

タスク作成時に `milestone_id` を指定できるように既存フォームを拡張:

- マイルストーンの「+ タスク追加」から作成する場合、milestone_id が自動セットされる
- POST /api/tasks のリクエストボディに `milestone_id` を追加
- 既存のタスク作成APIを確認し、必要なら修正

### 6. ビルド確認

```bash
rm -rf .next && npm run build
```

### 7. コミット

```bash
git add -A
git commit -m "V2-C: Theme & Milestone CRUD APIs + 3-tier task hierarchy UI"
```

## 注意事項

- APIの認証パターン: `getServerUserId()` + `getServerSupabase() || getSupabase()`
- Vercel互換params: `{ params }: { params: Promise<{ id: string }> }`
- テーマは「任意」— テーマなしのマイルストーンも表示する（「テーマなし」セクション）
- マイルストーンのステータス: pending / in_progress / achieved / missed
- テーマのステータス: active / completed / archived
- 配色: nm-* カスタムカラー準拠
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-D: 会議録アップロード + AI解析基盤

### ---ここから貼り付け---

# V2-D: 会議録アップロード + AI解析基盤

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション6）を必ず読んでください
- 前提フェーズ: V2-A 完了済み
- ブランチ: `feature/v2-d-meeting-records`
- テーブル `meeting_records` は V2-A で作成済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-d-meeting-records
```

### 2. 会議録 CRUD API

#### `src/app/api/meeting-records/route.ts` — GET / POST

```
GET /api/meeting-records?project_id=xxx → 会議録一覧（meeting_date DESC）
POST /api/meeting-records → { project_id, title, meeting_date, content, source_type?, source_file_id? }
```

#### `src/app/api/meeting-records/[id]/route.ts` — GET / PUT / DELETE

```
GET /api/meeting-records/[id] → 会議録詳細（ai_summary含む）
PUT /api/meeting-records/[id] → { title?, content?, meeting_date?, ai_summary?, processed? }
DELETE /api/meeting-records/[id] → 削除
```

### 3. 会議録AI解析エンドポイント

#### `src/app/api/meeting-records/[id]/analyze/route.ts` — POST

このエンドポイントは会議録テキストをAIに送り、以下を同時に実行:

1. **要約生成**: 会議の要点をサマリー → meeting_records.ai_summary に保存
2. **検討ツリー素材の抽出**: 議題・選択肢・決定方針をJSON形式で抽出（V2-Eで使用）
3. **ビジネスイベント追加**: business_events に会議イベントを自動登録

```typescript
// AIモデル: claude-sonnet-4-5-20250929
// Max Tokens: 2000
// レスポンス形式:
{
  summary: string,                    // 要約テキスト
  topics: [                           // 検討ツリー素材
    {
      title: string,                  // 議題
      options: string[],              // 選択肢
      decision: string | null,        // 決定事項（未決定ならnull）
      status: 'active' | 'completed' | 'cancelled'
    }
  ],
  milestone_feedback: [               // マイルストーンへのフィードバック（V2-G用）
    {
      milestone_title: string,        // 言及されたマイルストーン名
      human_judgment: string,         // 人間の判定
      reasoning: string               // 判定理由
    }
  ] | null
}
```

AIプロンプトの構成:
- システムプロンプト: 「あなたは会議録を構造化するアシスタントです。以下の会議録から...」
- meeting_records.content を入力として渡す
- JSON形式のレスポンスを要求

### 4. 会議録アップロードUI

プロジェクト詳細の「検討ツリー」タブ上部に会議録アップロードセクションを配置:

```
┌──────────────────────────────────────┐
│  📝 会議録アップロード                 │
│                                      │
│  タイトル: [________________]         │
│  日付:     [____-__-__]              │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  会議内容をここに貼り付け...    │    │
│  │  （テキスト入力）              │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  [AI解析して登録]                     │
└──────────────────────────────────────┘
```

コンポーネント:
- `src/components/v2/MeetingRecordUpload.tsx` — アップロードフォーム
- `src/components/v2/MeetingRecordList.tsx` — 会議録一覧（日付降順、要約表示）

### 5. ビジネスイベント自動登録

会議録が登録されたとき、business_events に以下を自動追加:

```typescript
{
  project_id: meetingRecord.project_id,
  event_type: 'meeting',
  title: `会議: ${meetingRecord.title}`,
  description: meetingRecord.ai_summary,
  event_date: meetingRecord.meeting_date,
  meeting_record_id: meetingRecord.id,  // V2-Aで追加したカラム
  ai_generated: true
}
```

### 6. ビルド確認

```bash
rm -rf .next && npm run build
```

### 7. コミット

```bash
git add -A
git commit -m "V2-D: Meeting record upload, AI analysis endpoint, and auto business event creation"
```

## 注意事項

- AI解析は非同期で良い（登録後にボタン押下で解析開始）
- AIが失敗した場合はテンプレート（空のsummary）で保存し、メイン処理をブロックしない
- `processed` フラグで解析済みかどうかを管理
- source_type は現段階では 'text' のみ対応（'file' は将来スコープ）
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-E: 検討ツリー — AI生成 + ツリーUI

### ---ここから貼り付け---

# V2-E: 検討ツリー — AI生成 + ツリーUI

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション3.2）、`docs/UI_V2_SPEC.md`（タブ2: 検討ツリー）を必ず読んでください
- 前提フェーズ: V2-D 完了済み（会議録AI解析が topics を返す）
- ブランチ: `feature/v2-e-decision-tree`
- テーブル `decision_trees`, `decision_tree_nodes`, `decision_tree_node_history` は V2-A で作成済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-e-decision-tree
```

### 2. 検討ツリー CRUD API

#### `src/app/api/decision-trees/route.ts` — GET / POST

```
GET /api/decision-trees?project_id=xxx → ツリー一覧
POST /api/decision-trees → { project_id, title, description? }
```

#### `src/app/api/decision-trees/[id]/route.ts` — GET / PUT / DELETE

```
GET /api/decision-trees/[id] → ツリー詳細（全ノード含む、階層構造で返す）
PUT /api/decision-trees/[id] → { title?, description? }
DELETE /api/decision-trees/[id] → 削除（ノードはCASCADE）
```

#### `src/app/api/decision-tree-nodes/route.ts` — GET / POST

```
GET /api/decision-tree-nodes?tree_id=xxx → ノード一覧
POST /api/decision-tree-nodes → { tree_id, parent_node_id?, title, node_type, description?, source_meeting_id? }
```

node_type: 'topic' | 'option' | 'decision' | 'action'

#### `src/app/api/decision-tree-nodes/[id]/route.ts` — GET / PUT / DELETE

```
PUT /api/decision-tree-nodes/[id] → { title?, status?, description?, cancel_reason?, cancel_meeting_id? }
DELETE /api/decision-tree-nodes/[id] → 削除（子ノードCASCADE）
```

ステータス変更時に `decision_tree_node_history` に自動記録:

```typescript
{
  node_id: nodeId,
  previous_status: oldStatus,
  new_status: newStatus,
  reason: cancelReason || null,
  meeting_record_id: meetingRecordId || null
}
```

### 3. AI生成エンドポイント

#### `src/app/api/decision-trees/generate/route.ts` — POST

V2-Dの会議録AI解析で抽出された topics データを受け取り、検討ツリーに反映:

```
POST /api/decision-trees/generate
{
  project_id: string,
  meeting_record_id: string,
  topics: [{ title, options, decision, status }]  // V2-Dの解析結果
}
```

処理ロジック:
1. プロジェクトに既存ツリーがあるか確認
2. なければ新規ツリーを作成
3. 各 topic について:
   - 既存ノードとタイトルで照合（類似度判定）
   - 新規なら topic ノードを追加（source_meeting_id を設定）
   - options があれば option 子ノードを追加
   - decision があれば decision 子ノードを追加
   - status が cancelled なら既存ノードの status を cancelled に変更 + cancel_reason + cancel_meeting_id を設定
4. 変更履歴を decision_tree_node_history に記録

### 4. 検討ツリーUI

プロジェクト詳細の「検討ツリー」タブに以下を実装:

```
┌──────────────────────────────────────┐
│  🌳 検討ツリー                        │
│                                      │
│  ┌─ バナー検証 ●                    │  ← active（青丸）
│  │   ├─ フレーム検証 ●              │
│  │   │   ├─ 色検証 ✕               │  ← cancelled（取消線 + 赤×）
│  │   │   └─ ビジュアル検証 ●        │
│  │   └─ テキスト検証 ✓             │  ← completed（緑チェック）
│  │                                  │
│  └─ LP改修 ●                       │
│      └─ ファーストビュー検証 ●      │
│                                      │
│  会議録一覧:                          │
│  ├── 第1回会議（3/1）要約...         │
│  ├── 第2回会議（3/8）要約...         │
│  └── 第3回会議（3/15）要約...        │
└──────────────────────────────────────┘
```

コンポーネント:
- `src/components/v2/DecisionTreeView.tsx` — ツリー全体ビュー
- `src/components/v2/DecisionTreeNode.tsx` — 個別ノード（クリックで詳細パネル）
- `src/components/v2/NodeDetailPanel.tsx` — ノード詳細（状態、会議メモ、変更履歴、削除）

ノードのビジュアル:

| status | 表示 | 色 |
|---|---|---|
| active | ● 通常テキスト | blue-500 |
| completed | ✓ テキスト | green-500 |
| cancelled | ✕ 取消線テキスト | red-400 + line-through |
| on_hold | ○ グレーテキスト | slate-400 |

ノードクリック → 右側にスライドパネル:
- ノードタイトル・説明
- 作成元の会議名
- 取消の場合: 取消理由 + 取消元の会議名
- 変更履歴一覧（decision_tree_node_history）
- 削除ボタン（MoreMenu パターン）

### 5. 会議録解析 → ツリー生成の連携

V2-Dの `MeetingRecordUpload.tsx` に、AI解析完了後に「検討ツリーに反映」ボタンを追加:
- 解析結果の topics を `/api/decision-trees/generate` に送信
- 成功後、ツリービューを自動リフレッシュ

### 6. ビルド確認

```bash
rm -rf .next && npm run build
```

### 7. コミット

```bash
git add -A
git commit -m "V2-E: Decision tree AI generation, tree UI with node status and history"
```

## 注意事項

- ツリー表示はインデントベースのシンプルなリスト表示でOK（SVGの複雑な図は不要）
- ノードの照合は完全一致ではなく「似ている」レベルで良い（将来的にAI類似度判定に置き換え可能）
- 配色: nm-* カスタムカラー準拠 + ノード状態色
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-F: チェックポイント — 評価エージェント + 判定UI

### ---ここから貼り付け---

# V2-F: チェックポイント — 評価エージェント + 判定UI

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション4.3, 5）を必ず読んでください
- 前提フェーズ: V2-C 完了済み（milestones テーブルとCRUD API）
- ブランチ: `feature/v2-f-checkpoint-evaluation`
- テーブル `milestone_evaluations` は V2-A で作成済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-f-checkpoint-evaluation
```

### 2. 評価エージェントAPIエンドポイント

#### `src/app/api/milestones/[id]/evaluate/route.ts` — POST

**評価エージェントのAI性格: 構造的・客観的・ズレを正直に指摘**
（壁打ちパートナーとは別の性格。Shinji Method は使わない。）

```typescript
// AIモデル: claude-sonnet-4-5-20250929
// Max Tokens: 2000

// 入力データの収集:
// 1. milestone の description（当初のゴール）と start_context（スタート地点）
// 2. milestone 配下の tasks（完了状況・成果）
// 3. 思考ログ（thought_task_nodes + thought_edges で milestone_id が一致するもの）
// 4. 過去の evaluation_learnings から learning_point を収集（同一プロジェクト、直近5件）

// システムプロンプト:
// 「あなたはプロジェクトの評価エージェントです。
//  構造的かつ客観的に、マイルストーンの到達度を評価してください。
//  ズレがある場合は正直に指摘し、軌道修正の提案をしてください。
//
//  【過去の学習】
//  ${learningPoints.join('\n')}
//
//  以下の情報を基に評価してください:
//  ゴール: ${milestone.description}
//  スタート地点: ${milestone.start_context}
//  完了タスク: ${completedTasks}
//  思考ログ: ${thoughtLogSummary}」

// レスポンス形式（JSON）:
{
  achievement_level: 'achieved' | 'partially' | 'missed',
  ai_analysis: string,           // 総合分析
  deviation_summary: string,      // ズレの要約
  correction_suggestion: string,  // 軌道修正の提案
  presentation_summary: string    // 会議用サマリー（簡潔版）
}
```

評価結果を `milestone_evaluations` に保存:

```typescript
{
  milestone_id: id,
  evaluation_type: 'manual',  // 手動トリガー（将来: 'auto' for Cron）
  achievement_level: result.achievement_level,
  ai_analysis: result.ai_analysis,
  deviation_summary: result.deviation_summary,
  correction_suggestion: result.correction_suggestion,
  presentation_summary: result.presentation_summary
}
```

### 3. 評価結果取得API

#### `src/app/api/milestones/[id]/evaluations/route.ts` — GET

```
GET /api/milestones/[id]/evaluations → 評価履歴一覧（evaluated_at DESC）
```

### 4. マイルストーン評価UI

マイルストーンの詳細ビュー（MilestoneSection.tsx の展開時）に評価セクションを追加:

```
┌─────────────────────────────────────────┐
│ 🏁 Week1: 現状分析                [···] │
│ ゴール: 競合3社の分析完了                │
│ 期限: 3/7（金）                         │
│ 進捗: ████████░░ 80%（4/5タスク完了）   │
│                                         │
│ [チェックポイント評価を実行]              │
│                                         │
│ ── 最新の評価結果 ──                    │
│ 到達度: 🟡 partially                    │
│                                         │
│ 分析:                                   │
│ 競合3社のLP収集は完了したが、            │
│ ユーザー調査設計が未完了...              │
│                                         │
│ ズレ:                                   │
│ 定量データの収集が不足...               │
│                                         │
│ 提案:                                   │
│ 次週でユーザー調査を優先的に...          │
│                                         │
│ 📋 会議用サマリーをコピー               │
└─────────────────────────────────────────┘
```

到達度の表示:

| レベル | 表示 | 色 |
|---|---|---|
| achieved | 🟢 achieved | green-500 |
| partially | 🟡 partially | yellow-500 |
| missed | 🔴 missed | red-500 |

コンポーネント:
- `src/components/v2/MilestoneEvaluation.tsx` — 評価実行ボタン + 結果表示
- `src/components/v2/EvaluationResult.tsx` — 個別の評価結果カード
- `src/components/v2/PresentationSummary.tsx` — 会議用サマリー（コピーボタン付き）

### 5. マイルストーンステータスの自動更新

評価結果に基づいてマイルストーンのステータスを更新:

- achieved → milestones.status = 'achieved', achieved_date = today
- partially → milestones.status = 'in_progress'（変更なし）
- missed → milestones.status = 'missed'

### 6. ビルド確認

```bash
rm -rf .next && npm run build
```

### 7. コミット

```bash
git add -A
git commit -m "V2-F: Checkpoint evaluation agent, milestone evaluation UI with presentation summary"
```

## 注意事項

- 評価エージェントは壁打ちパートナー（タスクAI）とは別の性格。協力的ではなく客観的
- Shinji Method は使わない（評価エージェント専用のプロンプト）
- 過去の learning_point は直近5件を優先
- AI失敗時はエラーメッセージを表示し、再試行ボタンを提供
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-G: 自己学習 — 差分記録 + 議事録からの学習 + プロンプト注入

### ---ここから貼り付け---

# V2-G: 自己学習 — 差分記録 + 議事録からの学習 + プロンプト注入

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション5）を必ず読んでください
- 前提フェーズ: V2-D（会議録AI解析）, V2-F（評価エージェント）完了済み
- ブランチ: `feature/v2-g-self-learning`
- テーブル `evaluation_learnings` は V2-A で作成済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-g-self-learning
```

### 2. 学習データ記録API

#### `src/app/api/evaluation-learnings/route.ts` — GET / POST

```
GET /api/evaluation-learnings?project_id=xxx&milestone_id=xxx → 学習データ一覧
POST /api/evaluation-learnings → {
  milestone_id,
  project_id,
  ai_judgment,
  ai_reasoning,
  human_judgment,
  human_reasoning,
  gap_analysis,
  learning_point,
  meeting_record_id?
}
```

### 3. 会議録からの自動学習抽出

V2-Dの会議録AI解析エンドポイント（`/api/meeting-records/[id]/analyze`）を拡張:

AI解析結果の `milestone_feedback` 配列を処理:

```typescript
// milestone_feedback が null でない場合:
for (const feedback of result.milestone_feedback) {
  // 1. milestone_title でマイルストーンを検索
  const milestone = await findMilestoneByTitle(projectId, feedback.milestone_title);
  if (!milestone) continue;

  // 2. そのマイルストーンの最新の milestone_evaluations を取得
  const latestEval = await getLatestEvaluation(milestone.id);
  if (!latestEval) continue;  // AI評価がまだない場合はスキップ

  // 3. 差分分析をAIで生成
  const gapAnalysis = await analyzeGap(
    latestEval.achievement_level,  // AI判定
    latestEval.ai_analysis,        // AI理由
    feedback.human_judgment,        // 人間の判定
    feedback.reasoning              // 人間の理由
  );

  // 4. evaluation_learnings に記録
  await insertLearning({
    milestone_id: milestone.id,
    project_id: projectId,
    ai_judgment: latestEval.achievement_level,
    ai_reasoning: latestEval.ai_analysis,
    human_judgment: feedback.human_judgment,
    human_reasoning: feedback.reasoning,
    gap_analysis: gapAnalysis.analysis,
    learning_point: gapAnalysis.learning,
    meeting_record_id: meetingRecordId
  });
}
```

差分分析用のAIプロンプト:

```
あなたはAI評価の改善アシスタントです。
AI判定と人間判定の差分を分析し、次回以降に反映すべき学びを1文で要約してください。

AI判定: ${aiJudgment}（理由: ${aiReasoning}）
人間判定: ${humanJudgment}（理由: ${humanReasoning}）

出力形式:
{ "analysis": "差分の分析...", "learning": "次回反映すべき学び..." }
```

### 4. 評価エージェントへの学習注入

V2-F の評価エージェント（`/api/milestones/[id]/evaluate`）を修正:

学習データの収集と注入を実装:

```typescript
// src/lib/services/evaluationLearning.service.ts
export async function getLearningPoints(projectId: string, limit = 5): Promise<string[]> {
  const supabase = getServerSupabase() || getSupabase();
  const { data } = await supabase
    .from('evaluation_learnings')
    .select('learning_point, created_at')
    .eq('project_id', projectId)
    .not('learning_point', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map(d => d.learning_point);
}

// 評価エージェントのシステムプロンプトに注入:
const learnings = await getLearningPoints(projectId);
const learningSection = learnings.length > 0
  ? `\n\n【過去の学習（重要: 以下を考慮して評価してください）】\n${learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
  : '';
```

### 5. 学習データの確認UI

マイルストーン評価セクション（V2-F の MilestoneEvaluation.tsx）に学習履歴の表示を追加:

```
── 学習データ ──
📚 このプロジェクトの学習 (3件)

1. 「定性的な成果も到達判定に含めるべき」（3/7 Week1評価より）
2. 「クライアントの合意をもって完了とみなす」（3/14 Week2評価より）
3. 「部分的な成果でも方向性が合っていれば高評価」（3/21 Week3評価より）
```

コンポーネント:
- `src/components/v2/LearningHistory.tsx` — 学習データ一覧

### 6. applied_count のインクリメント

評価エージェントが learning_point を参照したとき、そのレコードの `applied_count` を +1 する:

```typescript
await supabase
  .from('evaluation_learnings')
  .update({ applied_count: supabase.rpc('increment', { x: 1 }) })
  .in('id', usedLearningIds);
```

※ RPC が複雑な場合は、単純に1件ずつ UPDATE でもOK。

### 7. ビルド確認

```bash
rm -rf .next && npm run build
```

### 8. コミット

```bash
git add -A
git commit -m "V2-G: Self-learning - gap recording, meeting record extraction, prompt injection"
```

## 注意事項

- 差分分析のAIモデル: claude-sonnet-4-5-20250929、Max Tokens: 500
- milestone_feedback がnull（マイルストーンに言及なし）の場合はスキップ
- マイルストーンの検索は title の部分一致で良い（完全一致だと議事録の表記揺れで失敗する）
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-H: 思考ログ拡張 — マイルストーン間スコープ

### ---ここから貼り付け---

# V2-H: 思考ログ拡張 — マイルストーン間スコープ

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`、`docs/ARCHITECTURE_V2.md`（セクション3.3）を必ず読んでください
- 前提フェーズ: V2-C 完了済み（milestones CRUD）
- ブランチ: `feature/v2-h-thought-log-expansion`
- `thought_task_nodes.milestone_id` は V2-A で追加済み

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-h-thought-log-expansion
```

### 2. 思考ログAPIの拡張

#### 既存の思考マップ関連APIを確認し、以下を追加/修正:

**思考ノード（thought_task_nodes）**:
- GET /api/thought-map で `milestone_id` パラメータに対応
- POST 時に `milestone_id` を受け付けるように修正
- マイルストーンでフィルタリングして表示可能に

**思考エッジ（thought_edges）**:
- 変更なし（milestone_id はノード側で管理するため）

### 3. 思考マップUIの拡張

プロジェクト詳細の「思考マップ」タブ（V2-Bで配置済み）を修正:

マイルストーン選択フィルタを追加:

```
┌──────────────────────────────────────┐
│  🗺 思考マップ                        │
│                                      │
│  マイルストーン: [▼ Week1: 現状分析]  │  ← ドロップダウン
│                  [  全て表示      ]  │
│                  [  Week1: 現状分析]  │
│                  [  Week2: 仮説立案]  │
│                                      │
│  ┌──────────────────────────────┐    │
│  │    （思考マップ表示エリア）     │    │
│  │    スタート ──→ ノード1       │    │
│  │              └──→ ノード2    │    │
│  │                   └──→ ゴール│    │
│  └──────────────────────────────┘    │
│                                      │
│  スタート地点: 競合分析の知見がない     │
│  ゴール: 3社の強み弱みを把握          │
└──────────────────────────────────────┘
```

- 「全て表示」: 既存の動作（全ノード表示）
- マイルストーン選択時: そのMSの milestone_id を持つノードのみ表示
- スタート地点 / ゴール: milestone.start_context / milestone.description を表示

### 4. タスクAI会話からの自動ノード登録

既存のタスクAI会話（`/api/tasks/chat`）を確認し、タスクに milestone_id がある場合:
- AI会話で生成された知識ノード（knowledge_master_entries）に対応する thought_task_nodes にも `milestone_id` を自動設定

```typescript
// タスクにmilestone_idがあれば、生成されるthought_task_nodesにも伝播
if (task.milestone_id) {
  // thought_task_nodes 作成時に milestone_id を設定
}
```

### 5. 思考スナップショットの拡張

既存の `thought_snapshots` テーブルは変更なし。ただし、リプレイ時にマイルストーンスコープで表示できるように:

- `GET /api/thought-map/replay` にオプションパラメータ `milestone_id` を追加
- 指定時はそのマイルストーン期間のスナップショットのみ返す

### 6. ビルド確認

```bash
rm -rf .next && npm run build
```

### 7. コミット

```bash
git add -A
git commit -m "V2-H: Thought log expansion - milestone scope filter and auto milestone_id propagation"
```

## 注意事項

- 既存の思考マップUIは大きく変えない。マイルストーンフィルタの追加が主な変更
- thought_task_nodes.id は TEXT型（`me_auto_...` 形式）— UUID ではない
- 既存データ（milestone_id がnull）は「全て表示」で引き続き表示される
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## Phase V2-I: 統合 — 秘書AIへの新intent追加 + ダッシュボード更新

### ---ここから貼り付け---

# V2-I: 統合 — 秘書AI新intent + ダッシュボード更新

## 前提

- リポジトリ: ~/Desktop/node_map_git
- 作業開始前に `CLAUDE.md`（特に「秘書AI 44 Intent」セクション）を必ず読んでください
- 前提フェーズ: V2-C〜V2-H 全て完了済み
- ブランチ: `feature/v2-i-integration`

## やること

### 1. ブランチ作成

```bash
cd ~/Desktop/node_map_git
git checkout main && git pull
git checkout -b feature/v2-i-integration
```

### 2. 秘書AIへの新intent追加（5つ）

既存のintent分類（キーワードベース）に以下を追加:

#### Intent #40: `upload_meeting_record`

- **キーワード**: 会議録, 議事録, ミーティングメモ, 会議の記録, MTG記録, meeting record
- **応答**: 「会議録を登録しますか？プロジェクト詳細の検討ツリータブからアップロードできます。」
- **アクション**: プロジェクト選択 → /organizations/[id] の検討ツリータブへ誘導

#### Intent #41: `milestone_status`

- **キーワード**: マイルストーン, MS, 進捗, チェックポイント, 到達, 達成状況, milestone
- **応答**: 指定プロジェクト（なければ全PJ横断）のマイルストーン状況を一覧表示
- **データソース**: milestones テーブル（status, target_date, 配下タスク完了率）

```typescript
// 秘書AIのレスポンスに含めるデータ:
const milestones = await supabase
  .from('milestones')
  .select('*, tasks(id, status)')
  .eq('status', 'in_progress')
  .order('target_date', { ascending: true });

// 表示例:
// 📊 進行中のマイルストーン:
// 🏁 A社リブランディング > Week2: 仮説立案（期限: 3/14）
//    進捗: 2/5タスク完了（40%）
// 🏁 B社Web制作 > Week1: 要件定義（期限: 3/7）
//    進捗: 3/3タスク完了（100%）→ 評価待ち
```

#### Intent #42: `decision_tree`

- **キーワード**: 検討ツリー, 検討状況, 決定事項, 議題, decision tree, 何が決まった
- **応答**: 指定プロジェクトの検討ツリーのアクティブノードを一覧表示
- **データソース**: decision_trees + decision_tree_nodes（status = 'active' のみ）

#### Intent #43: `checkpoint_evaluation`

- **キーワード**: 評価, チェックポイント評価, MS評価, マイルストーン評価, 判定, evaluate
- **応答**: 「マイルストーンの評価を実行しますか？」→ 対象MS選択 → 評価エージェント実行
- **アクション**: `/api/milestones/[id]/evaluate` を呼び出し、結果をチャットに表示

#### Intent #44: `create_milestone`

- **キーワード**: マイルストーン作成, MS作成, 新しいマイルストーン, milestone作成
- **応答**: プロジェクト・テーマ（任意）・タイトル・ゴール・期限を聞いて作成
- **アクション**: `/api/milestones` POST

### 3. intent分類の実装場所

既存のintent分類ロジックを確認してください。通常は以下のいずれかにあります:

- `src/lib/services/secretary/intentClassifier.ts` または類似ファイル
- `src/app/api/agent/chat/route.ts` 内のキーワードマッチング

新intentのキーワードと応答ハンドラをここに追加してください。

### 4. 秘書ダッシュボード更新

`src/components/WelcomeDashboard.tsx`（またはホームページのダッシュボードコンポーネント）に以下のカードを追加:

#### 「対応が必要なジョブ」カード

```typescript
// project_id が紐づいているジョブ + 期限が近いものを表示
const urgentJobs = await supabase
  .from('jobs')
  .select('*')
  .in('status', ['pending', 'in_progress'])
  .lte('scheduled_date', addDays(new Date(), 3))  // 3日以内
  .order('scheduled_date', { ascending: true })
  .limit(5);
```

#### 「今週の進捗」カード

```typescript
// 今週が期限のマイルストーンの達成状況
const weekMilestones = await supabase
  .from('milestones')
  .select('*, tasks(id, status)')
  .gte('target_date', startOfWeek)
  .lte('target_date', endOfWeek);

// 表示: MS達成: 2/5、タスク完了: 12/20
```

ダッシュボードのレイアウト（4カード）:

```
┌──────────┬───────────┐
│今日のタスク│ インボックス│
│ 全PJ横断  │ 未読 N件   │
├──────────┼───────────┤
│今日の予定  │ 今週の進捗 │ ← 新規
│ N件の予定 │ MS達成:2/5 │
├──────────┴───────────┤
│対応が必要なジョブ       │ ← 新規
│ SEOレポート 期限:3/7   │
└────────────────────────┘
```

### 5. 「今日のタスク」カードの強化

タスクが /organizations に統合されたため、ダッシュボードの「今日のタスク」の重要度が上がっています:

- 全プロジェクト横断で表示
- scheduled_start が今日 or due_date が今日以前の未完了タスク
- マイルストーン名も併記（どのMSの配下か分かるように）

```
今日のタスク (5)
├── A社リブランディング > Week2
│   ├── ☐ ペルソナ作成
│   └── ☐ 競合UI比較
├── B社Web制作 > Week1
│   └── ☐ ワイヤーフレーム
└── テーマなし
    └── ☐ 見積書作成
```

### 6. CLAUDE.md の更新

CLAUDE.md の「秘書AI — 44 Intent」セクションで、V2追加予定intentのステータスを「実装済み」に更新。

### 7. ビルド確認

```bash
rm -rf .next && npm run build
```

### 8. コミット

```bash
git add -A
git commit -m "V2-I: Integration - 5 new secretary intents, enhanced dashboard with milestone progress"
```

## 注意事項

- 秘書AIの既存intentは一切変更しない（追加のみ）
- キーワードベース意図分類のパフォーマンス（< 10ms）を維持
- ダッシュボードのデータ取得は既存のAPIパターンに従う
- 「今日のタスク」のクリックで /organizations/[orgId] に遷移（タスクが所属するPJ詳細へ）
- 完了後、コミットハッシュを報告してください

### ---ここまで---

---

## フェーズ完了チェックリスト（管理スレッド用）

| Phase | 内容 | ブランチ | ステータス | コミットハッシュ |
|---|---|---|---|---|
| V2-A | DB: 8テーブル + 4変更 | feature/v2-a-db-setup | ✅ 完了 | a2a1339 |
| V2-B | UI構造変更 | feature/v2-b-ui-restructure | ✅ 完了 | 6abae0c |
| V2-C | テーマ・MS CRUD | feature/v2-c-theme-milestone-crud | ✅ 完了 | 60d321b |
| V2-D | 会議録 + AI解析 | feature/v2-d-meeting-records | ✅ 完了 | 3a1495f |
| V2-E | 検討ツリー | feature/v2-e-decision-tree | ⬜ 次 | |
| V2-F | チェックポイント評価 | feature/v2-f-checkpoint-evaluation | ⬜ 次 | |
| V2-G | 自己学習 | feature/v2-g-self-learning | ⬜ 未着手（V2-F待ち） | |
| V2-H | 思考ログ拡張 | feature/v2-h-thought-log-expansion | ⬜ 次 | |
| V2-I | 統合 | feature/v2-i-integration | ⬜ 未着手（V2-C〜H待ち） | |

各フェーズ完了時にこのテーブルを更新してください。
