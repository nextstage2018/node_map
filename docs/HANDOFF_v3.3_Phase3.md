# NodeMap v3.3 引き継ぎ書（Phase 3〜4 + v3.2残課題）

最終更新: 2026-03-09

---

## 完了済み作業

| 作業 | コミット | 内容 |
|---|---|---|
| v3.2 高優先度修正 | `23a5124` | #マークダウン→【】統一、AIフォーマット指示、debugエンドポイント削除 |
| v3.3 Phase 0 | `ef28529` | ガイドページ・CLAUDE.md を新構成に先行更新 |
| v3.3 Phase 1 | `23a5124`, `fff0455` | DBスキーマ拡張（project_members / drive_documents拡張） |
| v3.3 Phase 2 | `1b9e861` | UIリストラクチャリング（8タブ化・新コンポーネント3つ） |

---

## 次のステップ（優先順）

### 1. v3.3 Phase 3: Driveフォルダ再構築

**目的**: 旧フォルダ構造（受領/提出/YYYY-MM）→ 用途別構造（ジョブ/会議議事録/MS/タスク）

**主な変更ファイル**:

| ファイル | 変更内容 |
|---|---|
| `src/services/drive/driveClient.service.ts` | フォルダ作成ロジック全面書換。新関数4つ追加 |
| `src/app/api/drive/documents/route.ts` | メタデータタグ（milestone_id, job_id）保存対応 |

**新サービス関数**:
- `getOrCreateJobFolder(projectId, jobId)` — ジョブ資料フォルダ
- `getOrCreateMeetingFolder(projectId, yearMonth)` — 会議議事録フォルダ
- `getOrCreateMilestoneFolder(projectId, msId)` — MSフォルダ
- `getOrCreateTaskFolder(projectId, taskId, msId)` — タスクフォルダ

**新フォルダ構造**:
```
[NodeMap] 組織名/
└── プロジェクト名/
    ├── ジョブ/
    ├── 会議議事録/
    └── マイルストーン/
        └── MS名/
            └── タスク名/
```

**注意**:
- 旧フォルダ（受領/提出/YYYY-MM）は残置。新規のみ新構造で作成
- ファイル名: `YYYY-MM-DD_種別_原名.ext`
- `drive_folders.resource_type` カラムはPhase 1で追加済み

**設計書**: `docs/RESTRUCTURING_V3.3.md` Phase 3 セクション

---

### 2. v3.3 Phase 4: Cron・AIパイプライン更新

| Cron | 変更内容 |
|---|---|
| `src/app/api/cron/sync-drive-documents/route.ts` | 新フォルダパスに対応 |
| `src/app/api/cron/sync-channel-topics/route.ts` | project_channels参照に切替（organization_channelsからの移行） |
| `src/app/api/webhooks/meetgeek/route.ts` | 会議議事録フォルダに自動格納 |

---

### 3. v3.2 残課題（中優先度 × 4）

**参照**: `docs/REMAINING_TASKS_v3.2.md` — #4〜7

| # | 課題 | 参照ファイル |
|---|---|---|
| 4 | MilestoneSection.tsx の projectId 未渡し | `src/components/organizations/ProjectsTab.tsx` |
| 5 | suggestions コンテキスト改善 | `src/app/api/agent/chat/route.ts` L4190 `getSuggestions()` |
| 6 | QuickActionBar と動的suggestions の使い分け | `src/components/secretary/SecretaryChat.tsx` L2074 |
| 7 | TaskResumeCard UX確認 | `src/components/secretary/ChatCards.tsx` L523 |

---

### 4. v3.2 残課題（低優先度 × 3）

| # | 課題 | 参照ファイル |
|---|---|---|
| 8 | カレンダー接続scope保存最適化 | `src/services/calendar/calendarClient.service.ts` |
| 9 | 秘書チャットタイムスタンプ表示 | `src/components/secretary/SecretaryChat.tsx` L2015 |
| 10 | 思考マップ・ジョブ詳細ページへのリンク | 秘書チャットのカードからのリンク |

---

## 必読ドキュメント（作業前に必ず確認）

| ファイル | 内容 | 必読度 |
|---|---|---|
| `CLAUDE.md` | 設計SSOT — 10のルール・テーブル・API・配色・全intent | ★★★ |
| `docs/RESTRUCTURING_V3.3.md` | v3.3全フェーズ設計書（進捗サマリー付き） | ★★★ |
| `docs/TABLE_SPECS.md` | 全テーブルCREATE文 | ★★ |
| `docs/REMAINING_TASKS_v3.2.md` | v3.2残課題（参照ファイル・行番号付き） | ★★ |
| `docs/ARCHITECTURE_V2.md` | V2設計書（5階層・3ログ等） | ★ |

---

## v3.3 Phase 2 で作成・変更したファイル一覧

### 新規作成

| ファイル | 内容 |
|---|---|
| `src/components/project/ProjectMembers.tsx` | PJメンバー管理（コンタクトから追加・フォールバック表示） |
| `src/components/project/ProjectChannels.tsx` | PJチャネル管理（1メディア=1推奨・警告UI） |
| `src/components/project/ProjectResources.tsx` | 関連資料（Drive連携 + URL登録 + タグ検索） |
| `src/app/api/projects/[id]/members/route.ts` | PJメンバーAPI（GET/POST/DELETE・組織フォールバック） |

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/app/organizations/[id]/page.tsx` | NavNode型変更、組織タブ縮小（設定のみ）、PJ 8タブ化、~300行削除 |

---

## 技術的な注意事項

1. **Vercel互換params**: `{ params }: { params: Promise<{ id: string }> }` — Promiseで受ける
2. **contact_persons.id**: TEXT型（UUIDではない）、手動生成 `team_${Date.now()}_${random}`
3. **project_members フォールバック**: テーブルが空の場合、`contact_persons.organization_id` 経由で組織メンバーを自動表示
4. **organization_channels**: ソフト廃止中。`deprecated_at` カラム追加済み。Phase 4で`project_channels`への完全移行
5. **drive_documents 拡張カラム**: `milestone_id`, `job_id` はPhase 1で追加済み（DB実行済み）
6. **VM環境**: ディスク容量が逼迫する可能性あり。`rm -rf .next` でキャッシュクリア推奨
