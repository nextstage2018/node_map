# NodeMap SSOT（Single Source of Truth）

> 最終更新: 2026-02-18

---

## 1. プロジェクト概要

**NodeMap** — 統合コミュニケーションツール（Email/Slack/Chatwork）
AI支援付きタスク管理と、裏側での思考マップデータ収集を行うアプリ。

- **リポジトリ**: https://github.com/nextstage2018/node_map
- **デプロイ先**: https://node-map-eight.vercel.app
- **技術スタック**: Next.js 14 (App Router), TypeScript, Tailwind CSS 3, Supabase, OpenAI API

---

## 2. フェーズ進捗

| Phase | 内容 | ステータス |
|-------|------|-----------|
| Phase 1 | 統合インボックス | ✅ 完了 |
| Phase 2 | タスクボード + AI会話 | ✅ 完了 |
| Phase 3 | 設定画面 / API接続 | 🔄 次のフェーズ |
| Phase 4 | 思考マップ（NodeMap本体） | ⏳ 未着手 |

---

## 3. Phase 1 完了サマリー — 統合インボックス

### 実装済み機能
- Gmail / Slack / Chatwork の統合メッセージ一覧
- メッセージ詳細表示（スレッド履歴含む）
- 未読/既読/返信済みステータス管理
- AI返信下書き生成（OpenAI gpt-4o-mini）
- チャネルフィルタ、検索機能
- 公式ロゴSVGアイコン

### 主要ファイル
- `src/app/inbox/page.tsx` — インボックスページ
- `src/components/inbox/` — MessageList, MessageDetail, ReplyBox等
- `src/services/email/`, `slack/`, `chatwork/` — 各チャネルサービス
- `src/services/ai/aiClient.service.ts` — AI返信生成
- `src/app/api/messages/`, `api/ai/`, `api/messages/reply/` — APIルート
- `src/hooks/useMessages.ts` — メッセージ取得Hook
- `supabase/001_initial_schema.sql` — メッセージキャッシュスキーマ

---

## 4. Phase 2 完了サマリー — タスクボード + AI会話

### 実装済み機能
- カンバンボード（未着手 / 進行中 / 完了）
- ドラッグ&ドロップ（@dnd-kit）でステータス変更
- AI提案カラム（未着手の左側、縦スクロール）
  - 判断材料表示（誰から/いつ/件名/抜粋/推薦理由）
  - 却下/あとで/タスクに追加 の3ボタン
- タスク3フェーズモデル: 構想 → 進行 → 結果
- 構想フェーズ: 構造化メモフォーム（ゴール/主な内容/気になる点/期限日）
- 進行フェーズ: AI補助クイックアクション（要点整理/次のステップ/懸念点チェック/進捗まとめ）
- 結果フェーズ: AI自動要約生成
- 詳細タブ: 進捗サマリー/構造化構想メモ表示/起点メッセージ/アクティビティ統計
- 優先度テキストバッジ（高/中/低）
- タスク作成モーダル

### 主要ファイル
- `src/app/tasks/page.tsx` — タスクページ（DndContext）
- `src/components/tasks/TaskCard.tsx` — カンバンカード（useSortable）
- `src/components/tasks/TaskColumn.tsx` — ドロップ可能カラム
- `src/components/tasks/TaskDetail.tsx` — 詳細パネル（AI会話/詳細タブ）
- `src/components/tasks/TaskAiChat.tsx` — AI会話UI（構造化フォーム/クイックアクション）
- `src/components/tasks/TaskSuggestions.tsx` — AI提案カラム+詳細モーダル
- `src/components/tasks/CreateTaskModal.tsx` — タスク作成モーダル
- `src/services/task/taskClient.service.ts` — タスクサービス（デモデータ）
- `src/app/api/tasks/`, `tasks/chat/`, `tasks/suggestions/` — APIルート
- `src/hooks/useTasks.ts` — タスクHook
- `supabase/002_tasks_schema.sql` — タスクDBスキーマ

---

## 5. Phase 3 設計 — 設定画面 / API接続

### 目的
現在デモモードで動作している各サービス（Gmail/Slack/Chatwork/OpenAI/Supabase）を、
ユーザーが設定画面から実際のAPI情報を入力して接続できるようにする。

### 計画する機能
1. **設定ページ** (`/settings`)
   - API接続ステータス一覧（接続済み/未接続の可視化）
   - 各サービスの接続設定フォーム

2. **チャネル接続設定**
   - Gmail: OAuth2認証フロー or APIキー設定
   - Slack: Bot Token / App Token設定
   - Chatwork: APIトークン設定

3. **AI設定**
   - OpenAI APIキー設定
   - モデル選択（gpt-4o-mini / gpt-4o等）

4. **データベース接続**
   - Supabase URL / Anon Key設定

5. **プロフィール設定**
   - ユーザー名、メールアドレス
   - 通知設定

6. **接続テスト機能**
   - 各サービスへの疎通確認ボタン
   - 成功/失敗のフィードバック表示

### 技術方針
- 環境変数 or Supabaseへの暗号化保存
- サーバーサイドでのAPI検証
- 接続状態のリアルタイム表示

---

## 6. チェックポイント履歴

| CP | 内容 | 日付 |
|----|------|------|
| CP1 | Phase 1 プロジェクト初期化 | — |
| CP2 | Phase 1 基盤レイヤー完了 | — |
| CP3 | Phase 1 UIコンポーネント完了 | — |
| CP4 | Phase 1 API・Hook・スキーマ完了 | — |
| CP5 | Phase 1 全機能完了・動作確認 | — |
| CP6 | Phase 1 改善完了（アイコン/ステータス/スレッド） | — |
| CP7 | Phase 2 基盤レイヤー完了 | — |
| CP8 | Phase 2 全機能完了（D&D/提案/AI会話/詳細改善） | 2026-02-18 |

---

## 7. 決定ログ

| 決定事項 | 理由 |
|---------|------|
| デモモードパターン採用 | API未接続時もUIを確認可能に |
| @dnd-kit採用 | 軽量で柔軟なD&Dライブラリ |
| タスク3フェーズモデル | 構想→進行→結果で思考プロセスを構造化 |
| AI提案を縦カラム化 | 横バーより多数の提案を表示可能 |
| 構想メモの構造化フォーム | 一定品質のメモを担保（ゴール/内容/懸念/期限） |
| 優先度をテキストバッジに | 絵文字より明確で好み対応 |
| 判断材料の充実化 | 誰から/いつ/何のメッセージか分からないとタスク化判断不可 |
