# NodeMap v3.3 プロジェクト中心リストラクチャリング 設計書

最終更新: 2026-03-09

---

## 進捗サマリー

| Phase | 内容 | ステータス | コミット |
|---|---|---|---|
| Phase 0 | ドキュメント先行更新（ガイド・CLAUDE.md） | ✅ 完了 | `ef28529` |
| Phase 1 | DBスキーマ拡張（project_members, drive_documents拡張） | ✅ 完了 | `23a5124`, `fff0455` |
| Phase 2 | UIリストラクチャリング（8タブ化・新コンポーネント） | ✅ 完了 | `1b9e861` |
| Phase 3 | Driveフォルダ再構築 | ✅ 完了 | (current) |
| Phase 4 | Cron・AIパイプライン更新 | ✅ 完了 | (current) |

---

## 概要

v3.3では、組織レベルにあった「メンバー」「チャネル」をプロジェクト配下に移動し、プロジェクトをすべての情報のハブにする。同時にDriveフォルダ構造を用途別に再設計し、関連資料タブを新設する。

---

## 現状 → 目標

### 組織レベルタブ

| 現状（v3.2） | 目標（v3.3） |
|---|---|
| メンバー / チャネル / 設定 | **設定のみ** |

### プロジェクト配下タブ

| 現状（v3.2） | 目標（v3.3） |
|---|---|
| タイムライン | タイムライン |
| 検討ツリー | 検討ツリー |
| 思考マップ | 思考マップ |
| タスク | タスク |
| ドキュメント | ジョブ（定型業務 / やることメモ） |
| — | **メンバー**（組織から移動） |
| — | **チャネル**（組織から移動。1メディア=1推奨） |
| — | **関連資料**（旧ドキュメント統合 + URL管理 + タグ検索） |

### Driveフォルダ構造

| 現状（v3.2） | 目標（v3.3） |
|---|---|
| L1: 組織 | L1: 組織 |
| L2: プロジェクト | L2: プロジェクト |
| L3: 受領 / 提出 | L3: ジョブ / 会議議事録 / マイルストーン |
| L4: YYYY-MM | L4: タスク（MS配下） |

---

## Phase 1: DBスキーマ拡張 ✅ 完了（`23a5124`, `fff0455`）

### 新テーブル: `project_members`

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',  -- 'owner' | 'member' | 'viewer'
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, contact_id)
);
CREATE INDEX idx_project_members_project ON project_members(project_id);
```

### drive_documents 拡張

```sql
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX idx_drive_documents_milestone ON drive_documents(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX idx_drive_documents_job ON drive_documents(job_id) WHERE job_id IS NOT NULL;
```

### drive_folders 拡張

```sql
ALTER TABLE drive_folders
  ADD COLUMN IF NOT EXISTS resource_type TEXT;  -- 'job' | 'meeting' | 'milestone' | null(L1/L2)

-- 新構造のCHECK制約（既存データとの互換性のためソフト適用）
-- hierarchy_level: 1=組織, 2=PJ, 3=用途別, 4=タスク等
```

### organization_channels ソフト廃止

```sql
ALTER TABLE organization_channels
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS migrated_to_project_id UUID REFERENCES projects(id);
```

---

## Phase 2: UIリストラクチャリング ✅ 完了（`1b9e861`）

### 2.1 組織詳細ページ変更

**ファイル**: `src/app/organizations/[id]/page.tsx`

NavNode型を変更:
```typescript
// v3.2
type NavNode =
  | { type: 'org'; tab: 'members' | 'channels' | 'settings' }
  | { type: 'project'; projectId: string; tab: 'tasks' | 'timeline' | 'documents' | 'decision_tree' | 'thought_map' };

// v3.3
type NavNode =
  | { type: 'org'; tab: 'settings' }
  | { type: 'project'; projectId: string; tab: 'timeline' | 'decision_tree' | 'thought_map' | 'tasks' | 'jobs' | 'members' | 'channels' | 'resources' };
```

### 2.2 新コンポーネント

| コンポーネント | 用途 |
|---|---|
| `ProjectMembers.tsx` | プロジェクトメンバー管理。コンタクトから追加 / 自動検出 |
| `ProjectChannels.tsx` | チャネル管理。1メディア=1制約。推奨文言表示 |
| `ProjectResources.tsx` | 関連資料一覧。ドキュメント + URL + タグ検索 |

### 2.3 チャネル追加UI推奨文言

```
推奨構成:
・Slack: 1チャネル
・Chatwork: 1ルーム
・メール: 任意（現在休眠中）
```

### 2.4 関連資料タブ

- ドキュメント一覧（Drive連携ファイル）
- スプレッドシート等のURL登録機能
- タグフィルタ（プロジェクト / マイルストーン / タスク / ジョブ）
- 各アイテムにリンクショートカット

---

## Phase 3: Driveフォルダ再構築

### フォルダ構造

```
[NodeMap] 組織名/                     ← L1: 組織作成時に自動生成
└── プロジェクト名/                    ← L2: PJ作成時に自動生成
    ├── ジョブ/                        ← L3: 初回ファイル保存時に動的生成
    │   └── {ジョブ名 or YYYY-MM}/
    ├── 会議議事録/                     ← L3: 初回会議録保存時に動的生成
    │   └── YYYY-MM/
    └── マイルストーン/                 ← L3: 初回タスクファイル保存時に動的生成
        └── {MS名}/
            └── {タスク名}/            ← L4: 初回ファイル保存時に動的生成
```

### 新サービス関数

| 関数 | 用途 |
|---|---|
| `getOrCreateJobFolder(projectId, jobId)` | ジョブフォルダ取得/作成 |
| `getOrCreateMeetingFolder(projectId, yearMonth)` | 会議議事録フォルダ取得/作成 |
| `getOrCreateMilestoneFolder(projectId, msId)` | MSフォルダ取得/作成 |
| `getOrCreateTaskFolder(projectId, taskId, msId)` | タスクフォルダ取得/作成 |

### ファイル名ルール

`YYYY-MM-DD_種別_原名.ext`

例:
- `2026-03-09_見積書_proposal_v1.pdf`
- `2026-03-09_議事録_定例MTG.txt`
- `2026-03-09_レポート_SEO月次.xlsx`

### メタデータタグ

drive_documents に以下のカラムでタグ付け:
- `project_id` (既存)
- `task_id` (既存)
- `milestone_id` (v3.3追加)
- `job_id` (v3.3追加)

### 旧フォルダとの互換性

- 旧構造（受領/提出/YYYY-MM）のフォルダは**残置**
- 新規ファイルのみ新構造で作成
- 読み取りは旧・新両方を参照

---

## Phase 4: Cron・AIパイプライン更新

| Cron | 変更内容 |
|---|---|
| `sync-drive-documents` | 新フォルダパスに対応 |
| `sync-channel-topics` | project_channels参照に切替 |
| MeetGeek webhook | 会議議事録フォルダに自動格納 |

---

## 主要ファイルマップ

### 変更対象

| ファイル | Phase | 変更内容 |
|---|---|---|
| `src/app/organizations/[id]/page.tsx` | 2 | NavNode変更、メンバー/チャネルタブ削除、新タブ追加 ✅ |
| `src/services/drive/driveClient.service.ts` | 3 | フォルダ作成ロジック全面書換 |
| `src/app/api/projects/[id]/channels/route.ts` | 2 | 既存（変更不要） ✅ |
| `src/app/api/projects/[id]/members/route.ts` | 2 | 新規作成 ✅ |
| `CLAUDE.md` | 0 | 画面一覧・Drive構造・チャネルルール更新 ✅ |
| `src/app/guide/page.tsx` | 0 | ガイド更新 ✅ |

### 新規作成

| ファイル | Phase | 用途 |
|---|---|---|
| `src/components/project/ProjectMembers.tsx` | 2 | メンバー管理コンポーネント ✅ |
| `src/components/project/ProjectChannels.tsx` | 2 | チャネル管理コンポーネント ✅ |
| `src/components/project/ProjectResources.tsx` | 2 | 関連資料コンポーネント ✅ |
| `supabase/migrations/XXX_v3.3_restructuring.sql` | 1 | DBマイグレーション ✅ |

---

## リスクと対策

| リスク | 対策 |
|---|---|
| 既存のorganization_channelsデータ | ソフト廃止（deprecated_at付与）。新規はproject_channels |
| 旧Driveフォルダのファイル | 残置。新規のみ新構造。読み取りは両方参照 |
| メンバーの二重管理 | project_membersが空なら組織メンバーにフォールバック |
| 旧URLへのアクセス | リダイレクト or エラーメッセージ表示 |
