# Phase 29 ハンドオフ: ノード登録リデザイン＆会話ログ構造化＆AIサジェスト

> 作成日: 2026-02-25
> 前提: Phase 28 までの実装が完了済み

---

## 完了した作業

### リポジトリ整理
- `docs/handoff/` サブフォルダ作成（ハンドオフ文書集約）
- `sql/` ディレクトリ新設（`supabase/` から全10ファイル移動）
- ルート `NODEMAP_SSOT.md` 削除（`docs/` 版と重複）
- `docs/DESIGN_Phase29.md` 設計書作成

### ノード登録リデザイン
- `NodeRegistrationDialog.tsx` — 手動登録モーダル（ラベル・タイプ・ドメイン・フィールド）
- `NodeDetailPanel.tsx` — 詳細表示・編集・削除パネル
- `MapControls.tsx` — +ノード追加ボタン、検索候補クリック→ノード選択
- API拡張: PUT（更新）/ DELETE（削除）/ POST（domainId/fieldId対応）
- サービス: `updateNode`, `deleteNode`, `updateNodeClassification` 追加

### 会話ログ構造化
- `ConversationSummary.tsx` — AI要約パネル（/api/ai/thread-summary活用）
- `ConversationMeta.tsx` — 会話メタデータ（期間・参加者・メッセージ数）
- `ConversationFilter.tsx` — 詳細フィルタ（日付・参加者・キーワード・ステータス）
- `ThreadView.tsx` — 日付区切り線・メッセージ間経過時間表示

### AIサジェスト
- `GET /api/ai/daily-digest` — 日次ダイジェスト（統計+AI要約+推奨アクション3件）
- `POST /api/ai/next-action` — コンテキスト別ネクストアクション提案
- `DailyDigest.tsx` — ダイジェストカード（inbox未選択時に表示）
- `NextActionPanel.tsx` — フローティングパネル（layout.tsxでグローバル配置）

### 型安全性修正
- 93件のTypeScriptエラーを修正
- `NodeInteractionTrigger`, `Attachment`, `AuthenticationError` 等の未定義型を追加
- `tsconfig.json` に `target: "es2017"` 追加
- 複数APIルートの関数呼び出し形式修正

---

## 未対応・次フェーズ候補

| 項目 | 優先度 | 説明 |
|------|--------|------|
| Phase 22 SQL実行 | 高 | `sql/migrations/005_phase22_rls_policies.sql` をSupabase SQL Editorで実行（RLSポリシー有効化） |
| ConversationNodeLinks | 中 | メッセージ内キーワードと思考マップノードの関連リンク表示（設計書に記載、未実装） |
| スレッド内検索 | 低 | 5件以上のスレッドでの検索バー（設計書に記載、未実装） |
| AI応答時間分析 | 低 | ConversationMetaに平均応答時間・最速応答時間の分析機能追加 |
| @supabase/ssr 移行 | 低 | `@supabase/auth-helpers-nextjs` がdeprecated警告 |

---

## デプロイ情報

- プロジェクト: `node-map-eight`
- URL: https://node-map-eight-alpha.vercel.app
- ビルド: 全47ページ正常生成
