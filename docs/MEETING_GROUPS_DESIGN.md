# 会議グループ化設計書（P2-3）

最終更新: 2026-03-19

---

## 背景と課題

### 現状

| 項目 | 現在の構造 | 制約 |
|---|---|---|
| 検討ツリー | 1PJ = 1ツリー | 全会議のノードが1つに混在 |
| アジェンダ | UNIQUE(project_id, meeting_date) | 同日複数会議の分離不可 |
| recurring_rules | 個別ルール | グループ概念なし |

### 解決したい2つのケース

**ケースA: 同じ趣旨の会議が複数の定期イベントに分かれている**
- 木曜12時の `recurring_rule` (ID: aaa) — 広告AI化検討MTG
- 火曜10時の `recurring_rule` (ID: bbb) — 広告AI化検討MTG（臨時）
- → 同じグループとしてまとめたい（検討ツリー・アジェンダを共有）

**ケースB: 同じPJ内で異なる趣旨の会議がある**
- 「戦略MTG」の検討ツリーと「制作進行MTG」の検討ツリーを分離したい
- アジェンダも趣旨別に生成したい

---

## 設計

### 新テーブル: meeting_groups

```sql
CREATE TABLE meeting_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- グループ名（例: 「戦略MTG」「制作進行MTG」）
  description TEXT,                       -- グループの説明
  color TEXT DEFAULT 'blue',              -- UI表示色（blue/green/purple/amber/rose）
  sort_order INTEGER NOT NULL DEFAULT 0,  -- 表示順
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_groups_project ON meeting_groups(project_id);
```

### 既存テーブルへのカラム追加

```sql
-- 1. project_recurring_rules に meeting_group_id を追加
ALTER TABLE project_recurring_rules
  ADD COLUMN meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. meeting_records に meeting_group_id を追加
ALTER TABLE meeting_records
  ADD COLUMN meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- 3. decision_trees に meeting_group_id を追加（ツリーのグループ分離）
ALTER TABLE decision_trees
  ADD COLUMN meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;

-- 4. meeting_agenda の UNIQUE 制約を変更（グループ単位に）
-- 既存制約を削除して再作成
ALTER TABLE meeting_agenda DROP CONSTRAINT IF EXISTS meeting_agenda_project_id_meeting_date_key;
ALTER TABLE meeting_agenda
  ADD COLUMN meeting_group_id UUID REFERENCES meeting_groups(id) ON DELETE SET NULL DEFAULT NULL;
-- 新しいUNIQUE制約: (project_id, meeting_date, meeting_group_id)
-- ※ meeting_group_id が NULL の場合は従来通り PJ単位で1日1アジェンダ
ALTER TABLE meeting_agenda
  ADD CONSTRAINT meeting_agenda_project_date_group_key
  UNIQUE NULLS NOT DISTINCT (project_id, meeting_date, meeting_group_id);
```

---

## リレーション図

```
meeting_groups (1PJ内に複数作成可能)
├── project_recurring_rules.meeting_group_id  ← 定期イベントをグループに割り当て
├── meeting_records.meeting_group_id          ← 会議録をグループに自動紐づけ
├── decision_trees.meeting_group_id           ← グループ別の検討ツリー
└── meeting_agenda.meeting_group_id           ← グループ別のアジェンダ

project
├── meeting_group A: 「戦略MTG」
│   ├── recurring_rule: 木曜12時 戦略MTG
│   ├── recurring_rule: 火曜10時 戦略MTG（臨時）   ← ケースA解決
│   ├── decision_tree: 戦略MTG用ツリー             ← ケースB解決
│   ├── meeting_agenda: 戦略MTG用アジェンダ         ← ケースB解決
│   └── meeting_records: 第1回, 第2回, ...
│
├── meeting_group B: 「制作進行MTG」
│   ├── recurring_rule: 月曜10時 制作進行MTG
│   ├── decision_tree: 制作進行MTG用ツリー
│   ├── meeting_agenda: 制作進行MTG用アジェンダ
│   └── meeting_records: 第1回, 第2回, ...
│
└── (meeting_group NULL: グループ未割当)
    └── 従来通りPJ単位で1ツリー・1アジェンダ
```

---

## 影響範囲と修正箇所

### バックエンド

| ファイル | 修正内容 |
|---|---|
| `analyze/route.ts` ステップ11 | ツリー選択を `meeting_group_id` で分岐。グループ有 → グループ専用ツリー、グループ無 → 従来のPJツリー |
| `sync-meeting-notes/route.ts` | 会議メモ取込時に `recurring_rule_id` → `meeting_group_id` を自動セット |
| `meetingAgenda.service.ts` | `generateAgenda()` に `meeting_group_id` パラメータ追加。グループ別のタスク・決定事項を取得 |
| `generate-meeting-agendas Cron` | プロジェクトのグループ一覧を取得し、グループ別にアジェンダ生成 |
| `botResponseGenerator.service.ts` | BOTレスポンスのアジェンダ・タスクをグループ単位で整理 |

### フロントエンド

| ファイル | 修正内容 |
|---|---|
| `RecurringRulesManager.tsx` | ルール作成/編集時に「会議グループ」ドロップダウンを追加 |
| `DecisionTreeView.tsx` | グループ選択タブ or フィルタを追加。グループ切替でツリー表示を分離 |
| `MeetingRecordList.tsx` | グループフィルタ追加 |

### 新規API

| エンドポイント | 用途 |
|---|---|
| `GET /api/projects/[id]/meeting-groups` | グループ一覧取得 |
| `POST /api/projects/[id]/meeting-groups` | グループ作成 |
| `PUT /api/projects/[id]/meeting-groups/[gid]` | グループ更新 |
| `DELETE /api/projects/[id]/meeting-groups/[gid]` | グループ削除（配下のrecords等はNULLにフォールバック） |

---

## 後方互換性

- `meeting_group_id = NULL` の場合は従来通りPJ単位で動作
- 既存データは全て `meeting_group_id = NULL` のまま（マイグレーションでデータ変更なし）
- グループ未設定のPJは今まで通り使える
- グループ機能は「使いたいPJだけ有効化」するオプション設計

---

## 実装フェーズ（推奨順序）

```
Phase 1: テーブル作成 + API
  - meeting_groups テーブル作成
  - 既存テーブルへのカラム追加（4テーブル）
  - CRUD API 作成
  - RecurringRulesManagerにグループ選択UI追加

Phase 2: 検討ツリー分離
  - analyze/route.ts のステップ11修正（グループ別ツリー選択）
  - DecisionTreeView.tsx にグループ切替UI追加
  - sync-meeting-notes でmeeting_group_id自動セット

Phase 3: アジェンダ分離
  - meetingAgenda.service.ts にグループ対応
  - generate-meeting-agendas Cron修正
  - アジェンダUIにグループフィルタ追加

Phase 4: BOT・通知連携
  - BOTレスポンスのグループ対応
  - チャネル通知のグループ表示
```

---

## 注意事項

- **meeting_groups は必須ではない**: グループを作成しなくても全機能が従来通り動く
- **1 recurring_rule は 1 グループのみ**: N:1 の関係（1つのルールが複数グループに属することはない）
- **meeting_agenda の UNIQUE 制約変更に注意**: `NULLS NOT DISTINCT` が必要（PostgreSQL 15+）。Supabase は対応済み
- **ツリーのマージロジック**: グループ内のノード同士でのみ類似度マッチ。異なるグループのノードはマージしない
