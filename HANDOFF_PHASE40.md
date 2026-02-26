# Phase 40c 引き継ぎ書

作成日: 2026-02-26
前提: CLAUDE.md を読んでから作業を開始してください。

---

## 現在の状況サマリ

Phase 40c で「組織→プロジェクト→チャネル」の階層構造と、種のプロジェクト自動検出機能を実装した。
ビルドは通り、mainにプッシュ済み（コミット: abbaf17）。

**ただし、種ボックスの保存が動作しない致命的バグが残っている。**
次のスレッドでは、まずこのバグの修正から着手すること。

---

## 🔴 最優先: 種ボックスの保存バグ

### 症状
- `/seeds` 画面から種を追加しても、データベースに保存されない
- エラーメッセージが表示されない（サーバー側でサイレントに失敗している可能性）
- プロジェクト紐づけ有無に関わらず発生

### 推定原因（複数の可能性）

**原因1: RLS（Row Level Security）によるINSERT拒否**
- `TaskService.createSeed()` は `getSupabase()`（anon key）を使用
- seeds テーブルに RLS が有効で `WITH CHECK (auth.uid()::text = user_id)` ポリシーがある場合、`auth.uid()` が NULL のため INSERT が拒否される
- 確認方法: Supabase ダッシュボード → Authentication → Policies → seeds テーブル

**原因2: project_id カラムの外部キー制約エラー**
- `project_id` に無効な UUID が渡されている場合、FK制約で INSERT が失敗する
- 確認方法: ブラウザの DevTools Network タブで `/api/seeds` POST のレスポンスボディを確認

**原因3: seeds テーブルに必要なカラムが不足**
- Phase 40b の SQL（019_phase40b_seed_project.sql）が未実行の場合、`project_id` カラムがない
- 確認方法: Supabase ダッシュボード → Table Editor → seeds テーブルのカラム確認

### 調査手順
```
1. ブラウザの DevTools → Network タブを開く
2. /seeds 画面で種を追加
3. /api/seeds POST のレスポンスを確認
   - success: false の場合 → エラーメッセージが原因特定のヒント
   - success: true の場合 → フロントのステート管理問題（画面リロードで出るか確認）
4. Vercel Function Logs またはローカル npm run dev のコンソールで "[Seeds API]" ログを確認
5. Supabase ダッシュボードで seeds テーブルの RLS ポリシーを確認
```

### 修正方針

**RLSが原因の場合（最も可能性が高い）:**
```typescript
// src/services/task/taskClient.service.ts の createSeed メソッド
// 現状: getSupabase() → anon key（RLSの影響を受ける）
// 修正案1: createServerClient() を使用（RLSバイパス）
// 修正案2: seeds テーブルの RLS を調整
//   → INSERT ポリシーに service_role を許可するか、anon でも user_id 付きで INSERT できるようにする
```

**同様の問題が他のテーブルにも影響する可能性:**
- `TaskService.createTask()` も `getSupabase()` を使用
- `TaskService.getSeeds()` / `TaskService.getTasks()` も同様
- すべてのサービスメソッドで一貫したクライアント使用が必要

---

## 🟡 種→タスク変換の問題（修正済み・要確認）

### 症状
- 種をタスクに変換すると、種ボックスからは消えるが、タスク画面（/tasks）に表示されない

### 実施した修正（abbaf17）
- `/api/seeds/convert` を直接 Supabase INSERT → `TaskService.createTask()` 経由に変更
- `CreateTaskRequest` に `seedId` / `projectId` を追加
- `mapTaskFromDb` に `seedId` / `projectId` のマッピングを追加

### 残りの確認
- 種保存バグが解消した後に、変換→タスク表示のフローを再確認すること
- タスク画面側の `useTasks.ts` → `/api/tasks` GET → `TaskService.getTasks()` のフローもRLS影響を確認

---

## 🟡 プロジェクト紐づけ時の種登録失敗（修正済み・要確認）

### 症状
- 種ボックスでプロジェクトを選択して種を追加すると登録に失敗

### 実施した修正（abbaf17）
- `createSeed` のリトライロジックで `project_id` も除外するよう修正
- 種作成UIにエラーメッセージ表示を追加

### 残りの確認
- そもそもの種保存バグが解消した後に再確認

---

## Phase 40c で実装した機能（正常動作するもの）

### 1. 組織→プロジェクト紐づけ
- ビジネスログ画面（/business-log）でプロジェクト作成時に組織を選択可能
- プロジェクト一覧に組織名を表示
- テーブル: `projects.organization_id` → `organizations.id`

### 2. プロジェクト→チャネル紐づけ
- ビジネスログ画面でプロジェクトに組織チャネルを紐づけ
- 紐づけたチャネルのメッセージを「チャネルメッセージ」タブで表示
- テーブル: `project_channels`（service_name + channel_identifier）

### 3. 種のプロジェクト自動検出
- インボックスから種化する際、slackChannel/chatworkRoomId で project_channels を検索
- 1件→自動紐づけ、複数→モーダル表示
- 種ボックス画面にプロジェクト選択ドロップダウン

### 4. タスク変換プロジェクトモーダル
- 種→タスク変換時にプロジェクトを選択・確認するモーダル

---

## DBマイグレーション一覧（Phase 40系）

すべて Supabase で実行済み:

```sql
-- 019_phase40b_seed_project.sql ← 要確認（実行されているか不明）
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_seeds_project_id ON seeds(project_id);

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

---

## 主要ファイル構成（Phase 40c 関連）

### API
- `src/app/api/seeds/route.ts` — 種 CRUD + プロジェクト自動検出
- `src/app/api/seeds/convert/route.ts` — 種→タスク/ナレッジ変換
- `src/app/api/seeds/chat/route.ts` — 種AI会話
- `src/app/api/seeds/[id]/confirm/route.ts` — 種の確認（タスク画面のSeedBoxから使用）
- `src/app/api/projects/route.ts` — プロジェクト CRUD
- `src/app/api/projects/[id]/channels/route.ts` — プロジェクトチャネル CRUD
- `src/app/api/projects/[id]/messages/route.ts` — チャネルメッセージ取得
- `src/app/api/tasks/route.ts` — タスク CRUD

### UI
- `src/app/seeds/page.tsx` — 種ボックス画面（プロジェクト選択・タスク変換モーダル）
- `src/app/business-log/page.tsx` — ビジネスログ（組織選択・チャネル設定・メッセージタブ）
- `src/components/inbox/MessageDetail.tsx` — インボックスの種化ボタン・プロジェクト選択モーダル

### サービス
- `src/services/task/taskClient.service.ts` — タスク・種・ジョブの全操作
  - `createSeed()` — 882行目付近。getSupabase() 使用
  - `createTask()` — 468行目付近。getSupabase() 使用。seedId/projectId対応済み
  - `mapTaskFromDb()` — 298行目付近。seedId/projectId マッピング済み
  - `mapSeedFromDb()` — 353行目付近。projectId/projectName マッピング済み

### 型定義
- `src/lib/types.ts`
  - `Task`: seedId, projectId 追加済み
  - `CreateTaskRequest`: seedId, projectId 追加済み
  - `Seed`: projectId, projectName あり
  - `Project`: organizationId, organizationName あり

---

## 次のスレッドでの作業手順

```
CLAUDE.md を読んでから作業を開始してください。

【最優先タスク】種ボックスの保存バグ修正

【調査手順】
1. npm run dev でローカル起動
2. ブラウザの DevTools → Network タブを開く
3. /seeds 画面で種を追加して /api/seeds POST のレスポンスを確認
4. エラーがある場合、Supabase の seeds テーブルの RLS ポリシーを確認
5. src/services/task/taskClient.service.ts の createSeed メソッドを修正

【修正後の確認】
1. 種ボックスから種を追加できるか
2. プロジェクトを紐づけて種を追加できるか
3. 種→タスク変換後にタスク画面に表示されるか
4. npm run build でビルド確認
5. git commit & push
```

---

## 過去の引き継ぎ書
- `docs/handoff/HANDOFF_Phase29.md`
- `docs/HANDOFF_Phase25_session2.md`
