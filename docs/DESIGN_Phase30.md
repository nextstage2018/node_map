# Phase 30 設計書: 思考ログ & 種ボックス改善

> **作成日:** 2026-02-25
> **対象リポジトリ:** node_map_git
> **前提Phase:** Phase 29（ノード登録リデザイン＆会話ログ構造化＆AIサジェスト）完了済み

---

## 1. 既存実装の分析

### 1.1 種ボックスの現状

**DBテーブル（`seeds`）: `sql/004_phase7_10_schema.sql`**
| カラム | 型 | 備考 |
|--------|------|------|
| id | UUID PK | gen_random_uuid() |
| content | TEXT NOT NULL | ユーザー入力の生テキスト |
| source_channel | TEXT | email/slack/chatwork |
| source_message_id | TEXT | メッセージ起点の場合 |
| status | TEXT | 'pending' / 'confirmed' |
| structured | JSONB | AI構造化結果 |
| created_at | TIMESTAMPTZ | |
| user_id | TEXT | Phase 22で追加 |

**TypeScript型（`src/lib/types.ts`）:**
- `Seed`: id, content, sourceChannel?, sourceMessageId?, createdAt, status, structured?
- `SeedStatus`: 'pending' | 'confirmed'
- `CreateSeedRequest`: content, sourceChannel?, sourceMessageId?

**API（`src/app/api/seeds/`）:**
- `GET /api/seeds` — 一覧取得（pendingのみ）
- `POST /api/seeds` — 新規作成（ナレッジパイプライン統合済み）
- `POST /api/seeds/[id]/confirm` — タスク化（AI構造化→タスク生成）

**コンポーネント（`src/components/seeds/`）:**
- `SeedBox.tsx` — 折りたたみ式の種ボックス（入力＋一覧）
- `SeedCard.tsx` — 個別の種カード（内容表示＋タスク化ボタン）

**フック（`src/hooks/useTasks.ts`）:**
- `seeds` state、`createSeed()`、`confirmSeed()` が `useTasks` 内に同居

**ページ統合（`src/app/tasks/page.tsx`）:**
- タスクページ上部に `SeedBox` を配置。タスクボードの一部として表示。

### 1.2 種ボックスの不足機能

| 不足機能 | 現状 | 改善方針 |
|----------|------|----------|
| **タグ付け** | なし | 種にタグ（自由入力 + AI提案）を付けて分類 |
| **検索・フィルタ** | なし | テキスト検索 + タグフィルタ |
| **種の編集** | なし（作成と確認のみ） | 内容の編集・タグの変更 |
| **種の削除** | なし | 不要な種の削除 |
| **種→ノード紐づけ** | ナレッジパイプラインで間接的 | 明示的なノード紐づけUI |
| **専用ページ** | タスクページ内の折りたたみ | 専用ページで一覧管理 |
| **一覧表示の改善** | pendingのみ表示 | confirmed含む全履歴表示 |

### 1.3 思考ログの現状

**既存で近い機能:**
- `AiConversationMessage` 型：タスクに紐づくAI会話履歴（role, content, timestamp, phase, conversationTag）
- `ConversationTag` 型：7種類の会話タグ分類
- Phase 29で `ConversationSummary`（要約）、`ConversationMeta`（メタ情報）、`ConversationFilter`（フィルタ）を追加済み

**思考ログとの違い:**
- AI会話はタスクに紐づくが、思考ログは**ノード**や**テーマ**に紐づく自由記述
- AI会話はユーザー↔AI の対話形式だが、思考ログは**ユーザー自身の思考プロセス**を記録
- 思考ログはタスクに限定されない。特定のノード（キーワード/人物/プロジェクト）について考えたことを時系列で蓄積

---

## 2. DB設計

### 2.1 thinking_logs テーブル（新規作成）

```sql
-- ============================================================
-- Phase 30: 思考ログテーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS thinking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,                    -- 思考の内容（Markdown対応）
  log_type TEXT NOT NULL DEFAULT 'note'
    CHECK (log_type IN ('note', 'question', 'insight', 'decision')),
  -- 紐づけ先（いずれか1つ以上）
  node_id UUID REFERENCES user_nodes(id) ON DELETE SET NULL,
  task_id TEXT,                             -- タスクIDへの参照
  seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL,
  -- メタ情報
  tags TEXT[] DEFAULT '{}',                 -- 自由タグ
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE, -- ピン留め
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_thinking_logs_user ON thinking_logs(user_id);
CREATE INDEX idx_thinking_logs_node ON thinking_logs(node_id);
CREATE INDEX idx_thinking_logs_task ON thinking_logs(task_id);
CREATE INDEX idx_thinking_logs_created ON thinking_logs(created_at DESC);
CREATE INDEX idx_thinking_logs_type ON thinking_logs(log_type);

-- 自動更新トリガー
CREATE TRIGGER trigger_update_thinking_logs_updated_at
  BEFORE UPDATE ON thinking_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**log_type の定義:**
| 値 | 意味 | UIでの表示 |
|----|------|-----------|
| `note` | メモ・気づき | 灰色アイコン |
| `question` | 疑問・問い | 黄色アイコン |
| `insight` | 洞察・発見 | 緑色アイコン |
| `decision` | 判断・決定 | 青色アイコン |

### 2.2 seeds テーブル拡張（ALTERで追加）

```sql
-- Phase 30: 種テーブルにタグカラムを追加
ALTER TABLE seeds
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Phase 30: 種テーブルに更新日時を追加
ALTER TABLE seeds
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- タグ検索用インデックス（GIN）
CREATE INDEX IF NOT EXISTS idx_seeds_tags ON seeds USING GIN(tags);

-- 全文検索用インデックス
CREATE INDEX IF NOT EXISTS idx_seeds_content_search
  ON seeds USING GIN(to_tsvector('simple', content));

-- 種の更新トリガー
CREATE TRIGGER trigger_update_seeds_updated_at
  BEFORE UPDATE ON seeds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 2.3 マイグレーションファイル

ファイル名: `sql/010_phase30_thinking_logs_seeds.sql`

上記2.1 + 2.2をまとめて1ファイルに記載する。

---

## 3. API設計

### 3.1 思考ログAPI

#### `GET /api/thinking-logs`

思考ログ一覧を取得する。

**クエリパラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| nodeId | string | - | ノードIDで絞り込み |
| taskId | string | - | タスクIDで絞り込み |
| logType | string | - | ログ種別で絞り込み |
| search | string | - | テキスト検索（content内） |
| limit | number | - | 取得件数（デフォルト50） |
| offset | number | - | オフセット（ページネーション） |

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-id",
      "content": "このキーワードについて調べた結果...",
      "logType": "insight",
      "nodeId": "node-uuid",
      "taskId": null,
      "seedId": null,
      "tags": ["調査", "技術"],
      "isPinned": false,
      "createdAt": "2026-02-25T10:00:00Z",
      "updatedAt": "2026-02-25T10:00:00Z",
      "node": { "id": "node-uuid", "label": "React", "type": "keyword" }
    }
  ],
  "total": 42
}
```

#### `POST /api/thinking-logs`

思考ログを新規作成する。

**リクエストボディ:**
```json
{
  "content": "思考の内容",
  "logType": "note",
  "nodeId": "node-uuid",
  "taskId": null,
  "seedId": null,
  "tags": ["タグ1"]
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": { "id": "uuid", ... },
  "knowledge": { "keywords": [...], "newKeywords": [...], "nodeCount": 3 }
}
```

POST時にはナレッジパイプライン（`triggerKnowledgePipeline`）を呼び出し、思考ログからもキーワードを抽出してノードに登録する。

#### `PUT /api/thinking-logs`

思考ログを更新する。

**リクエストボディ:**
```json
{
  "id": "uuid",
  "content": "更新後の内容",
  "logType": "insight",
  "tags": ["タグ1", "タグ2"],
  "isPinned": true
}
```

#### `DELETE /api/thinking-logs`

思考ログを削除する。

**リクエストボディ:**
```json
{
  "id": "uuid"
}
```

### 3.2 種ボックスAPI拡張

#### `PUT /api/seeds`（新規追加）

種を更新する（内容編集・タグ変更）。

**リクエストボディ:**
```json
{
  "id": "seed-uuid",
  "content": "更新した内容",
  "tags": ["アイデア", "マーケティング"]
}
```

#### `DELETE /api/seeds`（新規追加）

種を削除する。

**リクエストボディ:**
```json
{
  "id": "seed-uuid"
}
```

#### `GET /api/seeds` 改修

既存のGETにクエリパラメータを追加する。

**追加クエリパラメータ:**
| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| status | string | - | 'pending' / 'confirmed' / 'all'（デフォルト: 'pending'） |
| search | string | - | テキスト検索（content内） |
| tags | string | - | カンマ区切りタグ（AND検索） |

---

## 4. 型定義

`src/lib/types.ts` に追加する型定義。

```typescript
// ===== Phase 30: 思考ログ & 種ボックス改善 =====

// 思考ログの種別
export type ThinkingLogType = 'note' | 'question' | 'insight' | 'decision';

// 思考ログ
export interface ThinkingLog {
  id: string;
  userId: string;
  content: string;
  logType: ThinkingLogType;
  // 紐づけ先
  nodeId?: string;
  taskId?: string;
  seedId?: string;
  // メタ情報
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  // JOINで取得する関連データ（API返却時のみ）
  node?: {
    id: string;
    label: string;
    type: NodeType;
  };
}

// 思考ログ作成リクエスト
export interface CreateThinkingLogRequest {
  content: string;
  logType?: ThinkingLogType;
  nodeId?: string;
  taskId?: string;
  seedId?: string;
  tags?: string[];
}

// 思考ログ更新リクエスト
export interface UpdateThinkingLogRequest {
  id: string;
  content?: string;
  logType?: ThinkingLogType;
  nodeId?: string;
  taskId?: string;
  seedId?: string;
  tags?: string[];
  isPinned?: boolean;
}

// 思考ログフィルター
export interface ThinkingLogFilter {
  nodeId?: string;
  taskId?: string;
  logType?: ThinkingLogType;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

// 種の更新リクエスト（既存CreateSeedRequestに追加）
export interface UpdateSeedRequest {
  id: string;
  content?: string;
  tags?: string[];
}

// 種フィルター
export interface SeedFilter {
  status?: SeedStatus | 'all';
  searchQuery?: string;
  tags?: string[];
}
```

**既存Seed型の拡張:**

```typescript
// 変更: Seed インターフェースに tags と updatedAt を追加
export interface Seed {
  id: string;
  content: string;
  sourceChannel?: ChannelType;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt?: string;    // 追加
  status: SeedStatus;
  tags?: string[];       // 追加
  structured?: {
    goal: string;
    content: string;
    concerns: string;
    deadline?: string;
  };
}
```

---

## 5. コンポーネント設計

### 5.1 思考ログ

#### 5.1.1 `ThinkingLogInput`（新規）

**ファイル:** `src/components/thinking-log/ThinkingLogInput.tsx`

**責務:** 思考ログの入力フォーム。テキスト入力 + ログ種別選択 + ノード/タスク紐づけ + タグ入力。

**Props:**
```typescript
interface ThinkingLogInputProps {
  defaultNodeId?: string;     // 初期値として紐づけるノードID
  defaultTaskId?: string;     // 初期値として紐づけるタスクID
  onSubmit: (req: CreateThinkingLogRequest) => Promise<void>;
  isSubmitting?: boolean;
}
```

**UI構成:**
- テキストエリア（複数行、Shift+Enterで改行、Enter送信はなし）
- ログ種別セレクタ（4種のアイコンボタン: note/question/insight/decision）
- タグ入力（コンマ区切り自由入力、既存タグからの候補表示）
- ノード紐づけセレクタ（既存ノードから検索選択）
- 送信ボタン

#### 5.1.2 `ThinkingLogTimeline`（新規）

**ファイル:** `src/components/thinking-log/ThinkingLogTimeline.tsx`

**責務:** 思考ログを時系列で表示するタイムラインUI。

**Props:**
```typescript
interface ThinkingLogTimelineProps {
  logs: ThinkingLog[];
  onEdit: (log: ThinkingLog) => void;
  onDelete: (logId: string) => void;
  onTogglePin: (logId: string, isPinned: boolean) => void;
  isLoading?: boolean;
}
```

**UI構成:**
- 日付区切り線（「今日」「昨日」「2026/02/23」等）
- 各ログエントリ: 左に種別アイコン（色つき丸）、右にコンテンツ + メタ情報
- ピン留めされたログは上部に固定表示
- ホバーで編集・削除・ピン留めボタン表示
- 関連ノード/タスクへのリンク表示

#### 5.1.3 `ThinkingLogCard`（新規）

**ファイル:** `src/components/thinking-log/ThinkingLogCard.tsx`

**責務:** タイムライン内の個別ログカード。

**Props:**
```typescript
interface ThinkingLogCardProps {
  log: ThinkingLog;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}
```

#### 5.1.4 `ThinkingLogFilter`（新規）

**ファイル:** `src/components/thinking-log/ThinkingLogFilter.tsx`

**責務:** 思考ログのフィルタリングUI。

**Props:**
```typescript
interface ThinkingLogFilterProps {
  filter: ThinkingLogFilter;
  onFilterChange: (filter: ThinkingLogFilter) => void;
  availableTags: string[];
}
```

**UI構成:**
- テキスト検索ボックス
- ログ種別フィルタ（チップ型トグル）
- タグフィルタ（ドロップダウン）

### 5.2 種ボックス改善

#### 5.2.1 `SeedBox.tsx`（改修）

**変更内容:**
- タグ入力UI追加（種作成時にタグ付け可能に）
- 検索バー追加（種一覧の上部）
- タグフィルタチップ追加
- 種の編集モード対応（SeedCardからインライン編集）
- 種の削除ボタン追加

**Props変更:**
```typescript
interface SeedBoxProps {
  seeds: Seed[];
  onCreateSeed: (content: string, tags?: string[]) => Promise<unknown>; // tags追加
  onConfirmSeed: (seedId: string) => Promise<unknown>;
  onUpdateSeed: (seedId: string, content: string, tags: string[]) => Promise<unknown>; // 新規
  onDeleteSeed: (seedId: string) => Promise<unknown>; // 新規
  isExpanded: boolean;
  onToggle: () => void;
}
```

#### 5.2.2 `SeedCard.tsx`（改修）

**変更内容:**
- タグ表示（チップ型）
- 編集ボタン（ホバーで表示、クリックでインライン編集モード）
- 削除ボタン（ホバーで表示、確認ダイアログ付き）
- タグ編集UI

**Props変更:**
```typescript
interface SeedCardProps {
  seed: Seed;
  onConfirm: () => Promise<unknown>;
  onUpdate: (content: string, tags: string[]) => Promise<unknown>; // 新規
  onDelete: () => Promise<unknown>; // 新規
}
```

#### 5.2.3 `SeedPage`（新規 — 専用ページコンポーネント）

**ファイル:** `src/app/seeds/page.tsx`

**責務:** 種ボックスの専用フルページ。タスクページの折りたたみUIとは別に、全種の一覧管理・検索・フィルタ・履歴閲覧ができる。

**UI構成:**
- ヘッダー（Header共通コンポーネント）
- 上部: 入力エリア（SeedBoxの入力部分を拡張）
- フィルタバー: ステータスタブ（pending / confirmed / all）+ テキスト検索 + タグフィルタ
- メインエリア: 種カードの一覧（グリッドまたはリスト表示）
- 右パネル: 選択した種の詳細（AI構造化結果、関連ノード、思考ログ）

#### 5.2.4 `SeedTagInput`（新規）

**ファイル:** `src/components/seeds/SeedTagInput.tsx`

**責務:** タグ入力の共通コンポーネント。

**Props:**
```typescript
interface SeedTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];  // 既存タグからのサジェスト
}
```

**UI構成:**
- 入力フィールド（テキスト入力、Enter/コンマでタグ追加）
- タグチップ（×ボタンで削除）
- サジェストドロップダウン（入力中に既存タグを表示）

---

## 6. ページ構成

### 6.1 新規ページ

#### `/seeds` — 種ボックス専用ページ

**ファイル:** `src/app/seeds/page.tsx`

Headerに新しいナビゲーション項目を追加する。

```typescript
// src/components/shared/Header.tsx の NAV_ITEMS に追加
{ href: '/seeds', label: '種', icon: Sprout },  // lucide-react の Sprout アイコン
```

ナビゲーション順序:
`インボックス → タスク → 種 → 思考マップ → コンタクト → ナレッジ → 設定`

### 6.2 既存ページへの統合

#### タスクページ（`/tasks`）

- 既存の `SeedBox` はそのまま維持（クイックアクセス用）
- 「もっと見る」リンクを追加して `/seeds` へ遷移

#### 思考マップページ（`/map`）

- ノード選択時のサイドパネルに「思考ログ」タブを追加
- 選択ノードに紐づく思考ログをタイムライン表示
- ノード詳細パネル（`NodeDetailPanel`）に思考ログ入力欄を追加

#### タスク詳細（`TaskDetail`）

- タスク詳細の下部に「思考ログ」セクションを追加
- 当該タスクに紐づく思考ログを時系列表示
- タスク詳細画面から思考ログを直接追加可能

### 6.3 ページ構成まとめ

```
/inbox           — インボックス（変更なし）
/tasks           — タスクボード（SeedBoxに「もっと見る」追加）
/seeds           — 種ボックス専用ページ（新規）
/map             — 思考マップ（ノード詳細に思考ログ統合）
/contacts        — コンタクト（変更なし）
/master          — ナレッジ（変更なし）
/settings        — 設定（変更なし）
```

---

## 7. サービス層設計

### 7.1 ThinkingLogService（新規）

**ファイル:** `src/services/thinking-log/thinkingLogClient.service.ts`

```typescript
export class ThinkingLogService {
  // CRUD
  static async getLogs(filter: ThinkingLogFilter): Promise<{ logs: ThinkingLog[]; total: number }>;
  static async createLog(userId: string, req: CreateThinkingLogRequest): Promise<ThinkingLog>;
  static async updateLog(userId: string, req: UpdateThinkingLogRequest): Promise<ThinkingLog | null>;
  static async deleteLog(userId: string, logId: string): Promise<boolean>;

  // 特化クエリ
  static async getLogsByNode(userId: string, nodeId: string): Promise<ThinkingLog[]>;
  static async getLogsByTask(userId: string, taskId: string): Promise<ThinkingLog[]>;
  static async getRecentLogs(userId: string, limit?: number): Promise<ThinkingLog[]>;
}
```

**実装パターン:** 既存の `TaskService` / `NodeClientService` と同じ。
- Supabase接続時はDBアクセス
- 未接続時はメモリ上のデモデータを返却

### 7.2 TaskService拡張（既存改修）

**ファイル:** `src/services/task/taskClient.service.ts`

追加メソッド:
```typescript
// 種の更新
static async updateSeed(userId: string, req: UpdateSeedRequest): Promise<Seed | null>;
// 種の削除
static async deleteSeed(userId: string, seedId: string): Promise<boolean>;
// 種の検索
static async searchSeeds(userId: string, filter: SeedFilter): Promise<Seed[]>;
```

### 7.3 useThinkingLogs フック（新規）

**ファイル:** `src/hooks/useThinkingLogs.ts`

```typescript
export function useThinkingLogs(initialFilter?: ThinkingLogFilter) {
  // state
  const [logs, setLogs] = useState<ThinkingLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<ThinkingLogFilter>(initialFilter || {});

  // actions
  const fetchLogs: () => Promise<void>;
  const createLog: (req: CreateThinkingLogRequest) => Promise<ThinkingLog>;
  const updateLog: (req: UpdateThinkingLogRequest) => Promise<void>;
  const deleteLog: (logId: string) => Promise<void>;
  const togglePin: (logId: string, isPinned: boolean) => Promise<void>;

  return { logs, total, isLoading, filter, setFilter, fetchLogs, createLog, updateLog, deleteLog, togglePin };
}
```

### 7.4 useTasks フック拡張（既存改修）

**ファイル:** `src/hooks/useTasks.ts`

追加する返り値:
```typescript
// 追加
updateSeed: (seedId: string, content: string, tags: string[]) => Promise<Seed | null>;
deleteSeed: (seedId: string) => Promise<boolean>;
```

---

## 8. 実装順序

依存関係を考慮し、以下の順序で実装する。

### Step 1: DB + 型定義（基盤）
1. `sql/010_phase30_thinking_logs_seeds.sql` 作成
2. `src/lib/types.ts` に新型定義を追加（ThinkingLog系 + Seed型拡張）

### Step 2: サービス層
3. `src/services/thinking-log/thinkingLogClient.service.ts` 新規作成
4. `src/services/task/taskClient.service.ts` に updateSeed / deleteSeed / searchSeeds 追加

### Step 3: API
5. `src/app/api/thinking-logs/route.ts` 新規作成（GET/POST/PUT/DELETE）
6. `src/app/api/seeds/route.ts` 改修（PUT/DELETE追加、GETにフィルタ追加）

### Step 4: フック
7. `src/hooks/useThinkingLogs.ts` 新規作成
8. `src/hooks/useTasks.ts` に updateSeed / deleteSeed 追加

### Step 5: 共通コンポーネント
9. `src/components/seeds/SeedTagInput.tsx` 新規作成
10. `src/components/thinking-log/ThinkingLogCard.tsx` 新規作成
11. `src/components/thinking-log/ThinkingLogInput.tsx` 新規作成
12. `src/components/thinking-log/ThinkingLogFilter.tsx` 新規作成
13. `src/components/thinking-log/ThinkingLogTimeline.tsx` 新規作成

### Step 6: 種ボックスUI改修
14. `src/components/seeds/SeedCard.tsx` 改修（タグ・編集・削除）
15. `src/components/seeds/SeedBox.tsx` 改修（検索・フィルタ・タグ入力）

### Step 7: ページ統合
16. `src/app/seeds/page.tsx` 新規作成（種ボックス専用ページ）
17. `src/components/shared/Header.tsx` 改修（ナビゲーション追加）
18. `src/app/tasks/page.tsx` 改修（SeedBoxに「もっと見る」追加）

### Step 8: 思考ログ統合
19. マップページのノード詳細パネルに思考ログセクション追加
20. タスク詳細に思考ログセクション追加

---

## 9. ファイル変更一覧

### 新規作成ファイル

| ファイルパス | 概要 |
|-------------|------|
| `sql/010_phase30_thinking_logs_seeds.sql` | マイグレーション（thinking_logs + seeds拡張） |
| `src/services/thinking-log/thinkingLogClient.service.ts` | 思考ログサービス |
| `src/hooks/useThinkingLogs.ts` | 思考ログ用カスタムフック |
| `src/app/api/thinking-logs/route.ts` | 思考ログAPI（GET/POST/PUT/DELETE） |
| `src/app/seeds/page.tsx` | 種ボックス専用ページ |
| `src/components/thinking-log/ThinkingLogInput.tsx` | 思考ログ入力フォーム |
| `src/components/thinking-log/ThinkingLogTimeline.tsx` | 思考ログタイムライン |
| `src/components/thinking-log/ThinkingLogCard.tsx` | 思考ログ個別カード |
| `src/components/thinking-log/ThinkingLogFilter.tsx` | 思考ログフィルタUI |
| `src/components/seeds/SeedTagInput.tsx` | タグ入力コンポーネント |

### 修正ファイル

| ファイルパス | 変更内容 |
|-------------|----------|
| `src/lib/types.ts` | ThinkingLog系型追加、Seed型にtags/updatedAt追加、UpdateSeedRequest追加 |
| `src/app/api/seeds/route.ts` | PUT/DELETE追加、GETにフィルタパラメータ追加 |
| `src/services/task/taskClient.service.ts` | updateSeed / deleteSeed / searchSeeds 追加 |
| `src/hooks/useTasks.ts` | updateSeed / deleteSeed 追加 |
| `src/components/seeds/SeedBox.tsx` | 検索・タグフィルタ・編集/削除対応・「もっと見る」リンク |
| `src/components/seeds/SeedCard.tsx` | タグ表示・編集モード・削除ボタン追加 |
| `src/components/shared/Header.tsx` | NAV_ITEMSに `/seeds` 追加 |
| `src/app/tasks/page.tsx` | SeedBoxに新Props渡し、「もっと見る」リンク追加 |

---

## 10. 設計上の判断事項

### 10.1 思考ログの配置方針

思考ログは専用ページを設けず、既存ページに統合する方針を取る。理由:
- 思考ログは「ノード」や「タスク」の文脈で記録・閲覧するものであり、独立ページだと文脈が失われる
- 種ボックスには専用ページを設ける（一覧管理の需要が高い）が、思考ログは関連エンティティのサイドパネルとして十分

**思考ログの主な入口:**
1. 思考マップ → ノード選択 → サイドパネルの「思考ログ」タブ
2. タスク詳細 → 下部の「思考ログ」セクション
3. 種ボックス専用ページ → 種詳細 → 関連思考ログ

### 10.2 種ボックスの二重配置

- タスクページの `SeedBox`（クイックアクセス用、折りたたみ式）は維持
- 専用ページ `/seeds` で全機能（検索・フィルタ・履歴・編集）を提供
- 両者は同じAPIを使うため、データの不整合は発生しない

### 10.3 認証パターン

既存パターン（`getServerUserId()`）に従う。
- APIルートの先頭で `const userId = await getServerUserId();` を呼び出し
- デモモード時は `'demo-user-001'` が返却される
- user_id による RLS フィルタリングをサービス層で実施

### 10.4 ナレッジパイプライン統合

思考ログ作成時も、既存の `triggerKnowledgePipeline()` を呼び出してキーワード抽出を行う。これにより、思考ログに書いた内容が自動的にノードとして登録される。

---

## 11. デモデータ

サービス層のデモモード用に、以下のデモデータを用意する。

```typescript
// thinking-log デモデータ
const demoThinkingLogs: ThinkingLog[] = [
  {
    id: 'tlog-1',
    userId: 'demo-user-001',
    content: 'Reactのサーバーコンポーネントとクライアントコンポーネントの使い分けを整理する必要がある',
    logType: 'question',
    nodeId: undefined,
    tags: ['React', 'アーキテクチャ'],
    isPinned: false,
    createdAt: '2026-02-24T09:00:00Z',
    updatedAt: '2026-02-24T09:00:00Z',
  },
  {
    id: 'tlog-2',
    userId: 'demo-user-001',
    content: 'データ取得はサーバーコンポーネント、インタラクティブUIはクライアントコンポーネントという分離が明確になった',
    logType: 'insight',
    nodeId: undefined,
    tags: ['React', 'アーキテクチャ'],
    isPinned: true,
    createdAt: '2026-02-24T14:00:00Z',
    updatedAt: '2026-02-24T14:00:00Z',
  },
  {
    id: 'tlog-3',
    userId: 'demo-user-001',
    content: '次のスプリントでは認証フローの改善を優先する。理由: ユーザーからの離脱率が認証画面で最も高い',
    logType: 'decision',
    tags: ['スプリント計画'],
    isPinned: false,
    createdAt: '2026-02-25T10:00:00Z',
    updatedAt: '2026-02-25T10:00:00Z',
  },
];
```
