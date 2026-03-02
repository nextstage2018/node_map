# Phase 46 引き継ぎ書：ビジネスログ＋ナレッジ ページ改善

**作成日**: 2026年3月2日
**前提**: CLAUDE.md を読んでから作業を開始してください。

---

## 今回のセッションで完了した作業

- Phase 45a-45c（URL検出・全チャネル対応・格納指示・ビジネスログ自動蓄積）実装完了
- 古いドキュメント整理（NODEMAP_SSOT.md / HANDOFF_PHASE40.md 等に CLAUDE.md リダイレクト追加）
- コミット: `c1fca9b`（ドキュメント整理）、`59f2907`（Phase 45a-45c 実装）

---

## 次スレッドの目標

**ビジネスログ（/business-log）** と **ナレッジ（/master）** ページの改善。
両ページとも基本機能は動作するが、実用上の使い勝手・完成度に課題がある。

---

## 1. ビジネスログ（/business-log）の現状

### 既存ファイル構成
| ファイル | 内容 |
|---|---|
| `src/app/business-log/page.tsx` | メインページ（約700行の大きなコンポーネント） |
| `src/app/api/business-events/route.ts` | イベント一覧取得(GET) / 新規作成(POST) |
| `src/app/api/business-events/[id]/route.ts` | イベント詳細取得/更新/削除 |
| `src/app/api/projects/route.ts` | プロジェクトCRUD |
| `src/app/api/projects/[id]/channels/route.ts` | プロジェクトチャネル管理 |
| `src/app/api/projects/[id]/messages/route.ts` | チャネルメッセージ取得 |
| `src/app/api/cron/sync-business-events/route.ts` | Phase 45c: ビジネスイベント自動蓄積Cron |
| `src/app/api/cron/summarize-business-log/route.ts` | Phase 45c: AI週間要約Cron |

### 現在の機能
- **左サイドバー**: プロジェクト一覧（新規作成可、組織紐づけ可）
- **メインエリア3タブ**: イベント / メッセージ / ドキュメント
  - **イベントタブ**: 日付グループ化タイムライン。手動でイベント追加（種別: メモ/打ち合わせ/電話/メール/チャット/意思決定）。編集・削除対応。議事録・参加者フィールドあり
  - **メッセージタブ**: project_channels に紐づくメッセージを表示
  - **ドキュメントタブ**: Google Drive連携で同期されたドキュメント表示
- **チャネル設定**: プロジェクトにSlack/CW/Emailチャネルを紐づけるパネル
- **Phase 45c**: Cronで inbox_messages から自動イベント生成（日次）、AI週間要約（週次）

### 改善が必要な点

#### UI/UX面
- **1ファイル700行超で巨大**: コンポーネント分割が未実施。プロジェクトリスト、イベントタイムライン、チャネル設定、フォームなどを分割すべき
- **プロジェクト未選択時のUI**: 「プロジェクトを選択してください」だけで寂しい。全プロジェクト横断の最新イベント表示や統計があると良い
- **AI自動生成イベントの区別**: Phase 45c で `ai_generated` フラグが追加されたが、UI上で手動イベントとAI自動イベントの区別表示がない
- **AI週間要約の表示場所がない**: Cronで生成されるが、ビジネスログページに要約表示UIがない（秘書のBusinessSummaryCardのみ）
- **イベントのフィルタリング**: 種別フィルタ・日付範囲フィルタがない
- **タイムライン表示の改善**: 現在は単純なリスト。ビジュアルタイムライン（縦線+ドット）にすると分かりやすい

#### データ面
- **business_events テーブルが空の可能性**: Phase 45c の Cron（sync-business-events）がまだ一度も実行されていない場合、自動イベントがゼロ。手動トリガーが必要:
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://node-map-eight.vercel.app/api/cron/sync-business-events
  ```
- **要約Cronも未実行**: 週次要約（summarize-business-log）も同様:
  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://node-map-eight.vercel.app/api/cron/summarize-business-log
  ```

---

## 2. ナレッジ（/master）の現状

### 既存ファイル構成
| ファイル | 内容 |
|---|---|
| `src/app/master/page.tsx` | メインページ（119行、シンプル） |
| `src/components/master/DomainTree.tsx` | ツリー表示コンポーネント（領域→分野→キーワード） |
| `src/components/master/MasterStats.tsx` | 統計カード表示 |
| `src/app/api/master/route.ts` | 階層データ取得 |
| `src/app/api/master/domains/route.ts` | 領域CRUD |
| `src/app/api/master/fields/route.ts` | 分野CRUD |
| `src/app/api/master/entries/route.ts` | キーワード（エントリ）CRUD |
| `src/app/api/master/classify/route.ts` | AI自動分類 |

### 現在の機能
- **統計カード**: マスタキーワード数 / 分類済みノード / 未分類ノード / 領域数
- **ツリー表示**: 領域→分野→キーワードの折りたたみツリー。検索フィルタ対応
- **API**: 階層データ取得、領域・分野・エントリのCRUD、AI分類

### 改善が必要な点

#### UI/UX面
- **CRUD操作UIがない**: APIは領域・分野・キーワードのCRUDに対応しているが、UI上で新規作成・編集・削除ができない（表示のみ）
- **未確認ノードの管理UI**: Phase 42a で AI会話からキーワードが自動抽出されるが、`is_confirmed=false` のノードを確認・承認するUIがない（APIは `/api/nodes/unconfirmed` に存在）
- **思考マップとの連携表示**: ナレッジキーワードが「どのタスクで使われたか」の紐づき情報がUIに出ていない（DBにはthought_task_nodesで紐づいている）
- **キーワードの使用頻度・重要度の可視化**: 現在はフラットなリスト。使用頻度や関連タスク数で重み付け表示があると実用的
- **同義語（synonyms）の管理**: DBにはsynonyms TEXT[]があるが、UIで編集する手段がない
- **分類の再割り当て**: 未分類キーワードを手動でドメイン/フィールドに割り当てるUIがない

#### データ面
- **AI自動抽出キーワードが大量に溜まる可能性**: 種/タスクのAI会話のたびに抽出されるため、未確認ノードが増加し続ける。定期的な確認・整理フローが必要

---

## 3. 関連テーブル（参考）

### business_events
```sql
id UUID, user_id TEXT, project_id UUID, title TEXT, content TEXT,
event_type TEXT, group_id UUID, contact_id TEXT,
-- Phase 45c 追加:
source_message_id TEXT, source_channel TEXT, ai_generated BOOLEAN,
summary_period TEXT, event_date TIMESTAMPTZ, source_document_id TEXT,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

### knowledge_master_entries
```sql
id TEXT, label TEXT, synonyms TEXT[], domain_id UUID, field_id UUID,
description TEXT, category TEXT, source_type TEXT, source_id TEXT,
source_conversation_id UUID, extracted_at TIMESTAMPTZ,
is_confirmed BOOLEAN, confirmed_at TIMESTAMPTZ,
user_id TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

### thought_task_nodes（ナレッジ↔タスク紐づけ）
```sql
id UUID, task_id UUID, seed_id UUID, node_id UUID(→knowledge_master_entries),
user_id TEXT, appear_order INT, is_main_route BOOLEAN, appear_phase TEXT,
source_conversation_id UUID, created_at TIMESTAMPTZ
```

---

## 4. 改善案の優先度（提案）

### 高優先度
1. **ビジネスログ: コンポーネント分割** — 700行を整理して保守性向上
2. **ビジネスログ: AI自動イベント区別表示** — ai_generated フラグでラベル表示
3. **ビジネスログ: 週間要約表示UI** — summary_period のイベントをまとめ表示
4. **ナレッジ: CRUD操作UI** — 領域・分野・キーワードの追加/編集/削除
5. **ナレッジ: 未確認ノード管理UI** — is_confirmed=false のノードを一覧→承認/削除

### 中優先度
6. **ビジネスログ: プロジェクト横断ダッシュボード** — 未選択時に全体概要表示
7. **ビジネスログ: フィルタ機能** — イベント種別・日付範囲
8. **ナレッジ: タスク紐づき表示** — キーワード→関連タスク一覧
9. **ナレッジ: 同義語編集UI**

### 低優先度
10. **ビジネスログ: ビジュアルタイムライン** — 縦線+ドットのデザイン
11. **ナレッジ: 使用頻度ヒートマップ/重み付け表示**
12. **ナレッジ: 分類ドラッグ&ドロップ再割り当て**

---

## 5. 注意事項

- **CLAUDE.md が SSOT**: 最新のテーブル仕様・APIパターン・サービス層の使い方はすべて CLAUDE.md に記載
- **Supabase クライアント**: サーバーサイドは `getServerSupabase() || getSupabase()` を使用（Phase 41 で統一済み）
- **ビルド確認**: 変更後は必ず `npm run build` で確認
- **Cron手動トリガー**: テストデータが必要な場合は上記のcurlコマンドで Cron を手動実行
