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
| Phase 3 | 設定画面 / API接続 | ✅ 完了 |
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

## 5. Phase 3 完了サマリー — 設定画面 / API接続

### 設計方針: 2層構造
- **管理者設定（admin）**: API基盤設定（Client ID/Secret, Bot Token, APIキー等）
- **個人設定（personal）**: OAuth認証（各チャネルへのログイン）、プロフィール、表示・通知設定

### 実装済み機能
- 設定ページ（/settings）にタブ切り替え（管理者設定 / 個人設定）
- 管理者タブ:
  - 接続ステータス概要（5サービスのプログレスバー + 状態カード）
  - チャネル連携（Gmail/Slack/Chatwork）アコーディオンフォーム
  - インフラ連携（OpenAI/Supabase）アコーディオンフォーム
  - 接続テスト機能（疎通確認 + レイテンシ表示）
- 個人タブ:
  - チャネルOAuth認証カード（Gmail/Slack/Chatwork）
  - admin未設定時は認証ボタン無効化 + 案内表示
  - 認証済み時はアカウント名表示 + 解除ボタン
  - プロフィール設定（表示名/メール/タイムゾーン）
  - 表示・通知設定（通知ON/OFF, メールダイジェスト, デフォルトフィルタ, AI自動提案）

### 主要ファイル
- `src/app/settings/page.tsx` — 設定ページ（2タブ構成）
- `src/components/settings/ConnectionOverview.tsx` — 接続ステータス概要
- `src/components/settings/ServiceSettingsCard.tsx` — サービス設定カード
- `src/components/settings/ProfileSettings.tsx` — プロフィール設定
- `src/components/settings/ChannelAuthCard.tsx` — チャネル認証カード
- `src/components/settings/UserPreferencesCard.tsx` — ユーザー設定
- `src/services/settings/settingsClient.service.ts` — 設定サービス
- `src/hooks/useSettings.ts` — 設定Hook
- `src/app/api/settings/`, `settings/profile/`, `settings/test/` — APIルート

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
| CP9 | Phase 3 設定画面完了（2層構造: admin/個人） | 2026-02-18 |

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
| 設定を2層構造に | admin(API基盤)と個人(OAuth認証)は分離すべき。admin未設定時は個人認証不可 |
