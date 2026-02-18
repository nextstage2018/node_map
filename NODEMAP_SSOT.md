# NodeMap（仮）SSOT - Single Source of Truth

> **このファイルは各フェーズ間の引き継ぎ資料です。**
> 新しい会話を始めるとき、設計書（.docx）とこのファイルをエージェントに渡してください。
> 各フェーズ完了時にエージェントがこのファイルを更新します。

---

## 基本情報

| 項目 | 内容 |
|------|------|
| サービス名 | NodeMap（仮） |
| オーナー | sjinji |
| 開発方法 | v0.dev（デザイン）+ Claude Cowork（実装）|
| リポジトリ | https://github.com/nextstage2018/node_map |
| デプロイ先 | https://node-map-eight.vercel.app |
| ホスティング | Vercel |
| 設計書 | NodeMap_設計書_v1.docx |
| 定型文 | PROMPT_TEMPLATE.md |

---

## 現在のステータス

| フェーズ | ステータス | 完了日 | 備考 |
|----------|-----------|--------|------|
| 設計書作成 | ✅ 完了 | 2026-02-18 | v1.0（セクション7追加済み） |
| Phase 1：統合インボックス | ✅ 完了 | 2026-02-18 | デモモード動作確認済み |
| Phase 2：タスクボード + AI会話 | ✅ 完了 | 2026-02-18 | D&D・AI提案・構造化メモ対応済み |
| Phase 3：設定画面 / API接続 ※追加 | ✅ 完了 | 2026-02-18 | 2層構造（admin/個人）で実装 |
| Phase 4：データ収集基盤（設計書Phase 3） | ✅ 完了 | 2026-02-18 | キーワード抽出・ノード蓄積・理解度判定・エッジ/クラスター管理 |
| Phase 5：思考マップUI（設計書Phase 4） | ⬜ 未着手 | - | ネットワークグラフ・比較モード |

> **注意：** 設計書のPhase 3（データ収集基盤）の前に「設定画面」を追加実装したため、
> 設計書のPhase番号と実装のPhase番号に1つズレがあります。
> 設計書Phase 3 = 実装Phase 4、設計書Phase 4 = 実装Phase 5。

---

## 技術スタック（確定）

| 領域 | 技術 | 確定度 |
|------|------|--------|
| フロントエンド | Next.js 14 (App Router) + React + TypeScript | ✅ 確定 |
| CSS | Tailwind CSS 3 | ✅ 確定 |
| ホスティング | Vercel | ✅ 確定 |
| データベース | Supabase（PostgreSQL） | ✅ 確定（スキーマ作成済・未接続） |
| AI | Anthropic Claude API（claude-opus-4-5） | ✅ 確定（デモモード対応） |
| D&D | @dnd-kit/core + @dnd-kit/sortable | ✅ 確定 |
| グラフ表示 | D3.js / React Flow | 提案中（Phase 5で確定予定） |
| API連携 | Gmail API / Slack API / Chatwork API | ✅ 確定（デモモード対応） |

---

## API連携の準備状況

| サービス | APIキー取得 | 備考 |
|----------|-----------|------|
| Gmail / メール | ⬜ 未取得 | Gmail APIまたはIMAP/SMTP。設定画面のadmin設定で入力可能 |
| Slack | ⬜ 未取得 | Bot Token。設定画面のadmin設定で入力可能 |
| Chatwork | ⬜ 未取得 | APIトークン。設定画面のadmin設定で入力可能 |
| Anthropic | ⬜ 未取得 | APIキー。設定画面のadmin設定で入力可能 |
| Supabase | ⬜ 未取得 | URL + Anon Key。設定画面のadmin設定で入力可能 |

> 全サービスがデモモードで動作中。API情報を設定すれば実接続に切り替わる設計。

---

## チェックポイント履歴

### CP1：コンセプト確認
- **結果：** ✅ 承認（修正なし）
- **日付：** 2026-02-18
- **決定事項：** 表の層（集約・補助）と裏の層（思考可視化）の二層構造で進める

### CP6：Phase 1完了確認（統合インボックス）
- **結果：** ✅ 承認
- **日付：** 2026-02-18
- **確認事項：**
  - 3チャネル（Gmail/Slack/Chatwork）の受信メッセージ一覧表示 → OK
  - AI返信下書き生成機能 → OK
  - チャネルフィルタ・検索 → OK
  - スレッド履歴表示 → OK
  - 公式ロゴSVGアイコン・ステータスバッジ → OK

### CP7：Phase 2完了確認（タスクボード + AI会話）
- **結果：** ✅ 承認（複数回の改善フィードバック後）
- **日付：** 2026-02-18
- **確認事項：**
  - カンバンボード（D&D対応）→ OK
  - AI提案カラム（判断材料・却下ボタン付き）→ OK
  - タスク3フェーズ（構想→進行→結果）→ OK
  - 構造化構想メモ（ゴール/主な内容/気になる点/期限日）→ OK
  - 進行フェーズAI補助クイックアクション → OK
  - 結果フェーズ自動要約 → OK
  - 優先度テキストバッジ（高/中/低）→ OK

### CP追加：Phase 3完了確認（設定画面）
- **結果：** ✅ 承認
- **日付：** 2026-02-18
- **確認事項：**
  - 設定画面2層構造（管理者設定 / 個人設定）→ OK
  - admin: API基盤設定（Gmail/Slack/Chatwork/OpenAI/Supabase）→ OK
  - admin: 接続テスト機能 → OK
  - 個人: チャネルOAuth認証カード → OK
  - 個人: プロフィール設定 → OK
  - 個人: 表示・通知設定 → OK

### CP8：Phase 4完了確認（データ収集基盤）
- **結果：** ⏳ 確認待ち
- **日付：** 2026-02-18
- **確認事項：**
  - キーワード抽出エンジン（AI/デモモード両対応）→ 実装済み
  - ノード（点）蓄積・頻出度カウント → 実装済み
  - 理解度レベル自動判定（認知/理解/習熟）→ 実装済み
  - エッジ（線）記録（共起/順序/因果の3タイプ）→ 実装済み
  - クラスター（面）管理（構想面/結果面/差分計算）→ 実装済み
  - 既存フローへの統合（メッセージ取得・タスク会話）→ 実装済み

### CP9
- （Phase 5完了時に追記）

---

## 決定事項ログ

| 日付 | 決定内容 | 理由 |
|------|---------|------|
| 2026-02-18 | サービス名は「NodeMap」（仮） | 点・線・面のコンセプトに合致 |
| 2026-02-18 | 初期ソースはメール・Slack・Chatworkの3つ | 将来LINE・メッセンジャー等に拡張 |
| 2026-02-18 | チーム間でタスク・ノードマップを覗き合える設計 | 上司→部下の指導、部下→上司の学び、同僚間の相互学習 |
| 2026-02-18 | まず自社利用 → ゆくゆく外販（SaaS） | 自社で検証してから展開 |
| 2026-02-18 | 開発はGitHub + Vercel構成 | 非エンジニアがv0.dev + Claude Coworkで構築 |
| 2026-02-18 | SSOTはMarkdownでローカル保持 | 各フェーズ間の引き継ぎに使用 |
| 2026-02-18 | フォルダ構成・命名規則・格納ルールを設計書セクション7に定義 | ファイル無秩序化を防止 |
| 2026-02-18 | 定型文テンプレート（PROMPT_TEMPLATE.md）を運用 | 毎回の個別指示を不要にする |
| 2026-02-18 | デモモードパターン採用 | API未接続時もUIを確認可能に |
| 2026-02-18 | @dnd-kit採用 | 軽量で柔軟なD&Dライブラリ |
| 2026-02-18 | タスク3フェーズモデル | 構想→進行→結果で思考プロセスを構造化 |
| 2026-02-18 | AI提案を縦カラム化 | 横バーより多数の提案を表示可能 |
| 2026-02-18 | 構想メモの構造化フォーム | 一定品質のメモを担保（ゴール/内容/懸念/期限） |
| 2026-02-18 | 優先度をテキストバッジに | 絵文字(🔴🟡🟢)より明確。高/中/低の文字表記 |
| 2026-02-18 | 判断材料の充実化 | 誰から/いつ/何のメッセージか分からないとタスク化判断不可 |
| 2026-02-18 | 設計書Phase 3の前に設定画面を追加 | 実運用にはAPI接続設定が必要 |
| 2026-02-18 | 設定を2層構造に | admin(API基盤)と個人(OAuth認証)は分離すべき。admin未設定時は個人認証不可 |
| 2026-02-18 | キーワード抽出はAI（gpt-4o-mini）+ルールベースのハイブリッド | API未接続時はルールベース（カタカナ・漢字・人名パターン）で動作 |
| 2026-02-18 | 理解度3段階の判定ロジック確定 | received only=認知、sent/self=理解、sent×2+received=習熟 |
| 2026-02-18 | エッジは3タイプ（共起/順序/因果） | 共起=同時出現、順序=進行フェーズの経路、因果=AI文脈解析 |
| 2026-02-18 | クラスターは構想面と結果面の2種類 | 差分で「思考の広がり」を計測。discoveredOnPath=経路上の発見 |
| 2026-02-18 | 既存フローに非同期統合 | メッセージ取得・タスク会話時にバックグラウンドでノード蓄積。エラーは無視 |
| 2026-02-19 | AI基盤をOpenAIからAnthropic Claudeに全面移行 | ユーザー指示。claude-opus-4-5-20251101を使用。openaiパッケージ削除、@anthropic-ai/sdk採用 |

---

## 実装済みファイル構成

```
node_map/
├── NODEMAP_SSOT.md
├── docs/
│   └── README.md
├── public/
│   └── icons/                         ← チャネル公式ロゴSVG
│       ├── gmail.svg
│       ├── slack.svg
│       └── chatwork.svg
├── src/
│   ├── app/
│   │   ├── layout.tsx                 ← ルートレイアウト
│   │   ├── page.tsx                   ← トップ（/inbox にリダイレクト）
│   │   ├── globals.css
│   │   ├── inbox/page.tsx             ← 画面①統合インボックス
│   │   ├── tasks/page.tsx             ← 画面②タスクボード（DndContext）
│   │   ├── settings/page.tsx          ← 設定画面（2タブ構成）
│   │   └── api/
│   │       ├── messages/
│   │       │   ├── route.ts           ← メッセージ一覧取得
│   │       │   └── reply/route.ts     ← 返信送信
│   │       ├── ai/
│   │       │   └── draft-reply/route.ts ← AI返信下書き
│   │       ├── tasks/
│   │       │   ├── route.ts           ← タスクCRUD
│   │       │   ├── chat/route.ts      ← AI会話・要約生成
│   │       │   └── suggestions/route.ts ← タスク提案
│   │       ├── settings/
│   │       │   ├── route.ts           ← 設定取得・保存
│   │       │   ├── profile/route.ts   ← プロフィール更新
│   │       │   └── test/route.ts      ← 接続テスト
│   │       ├── nodes/
│   │       │   ├── route.ts           ← ノードCRUD
│   │       │   ├── extract/route.ts   ← キーワード抽出→ノード蓄積
│   │       │   └── stats/route.ts     ← ノード統計
│   │       ├── edges/
│   │       │   └── route.ts           ← エッジCRUD
│   │       └── clusters/
│   │           ├── route.ts           ← クラスターCRUD
│   │           └── diff/route.ts      ← クラスター差分計算
│   ├── components/
│   │   ├── inbox/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageDetail.tsx
│   │   │   ├── ReplyForm.tsx
│   │   │   └── ThreadView.tsx
│   │   ├── tasks/
│   │   │   ├── TaskCard.tsx           ← カンバンカード（useSortable）
│   │   │   ├── TaskColumn.tsx         ← ドロップ可能カラム
│   │   │   ├── TaskDetail.tsx         ← 詳細パネル（AI会話/詳細タブ）
│   │   │   ├── TaskAiChat.tsx         ← AI会話UI
│   │   │   ├── TaskSuggestions.tsx     ← AI提案カラム+詳細モーダル
│   │   │   └── CreateTaskModal.tsx    ← タスク作成モーダル
│   │   ├── settings/
│   │   │   ├── ConnectionOverview.tsx  ← 接続ステータス概要
│   │   │   ├── ServiceSettingsCard.tsx ← サービス設定カード（admin）
│   │   │   ├── ProfileSettings.tsx    ← プロフィール設定
│   │   │   ├── ChannelAuthCard.tsx    ← チャネル認証カード（個人）
│   │   │   └── UserPreferencesCard.tsx ← ユーザー設定
│   │   ├── shared/
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── ChannelBadge.tsx
│   │   │   └── StatusBadge.tsx
│   │   └── nodemap/                   ← Phase 5で使用予定
│   ├── hooks/
│   │   ├── useMessages.ts
│   │   ├── useTasks.ts
│   │   ├── useSettings.ts
│   │   └── useNodes.ts              ← ノード・エッジ・クラスター取得Hook
│   ├── lib/
│   │   ├── types.ts                   ← 全型定義
│   │   ├── constants.ts               ← 全定数
│   │   ├── utils.ts
│   │   └── supabase.ts
│   └── services/
│       ├── email/emailClient.service.ts
│       ├── slack/slackClient.service.ts
│       ├── chatwork/chatworkClient.service.ts
│       ├── ai/
│       │   ├── aiClient.service.ts
│       │   └── keywordExtractor.service.ts ← キーワード抽出エンジン
│       ├── task/taskClient.service.ts
│       ├── settings/settingsClient.service.ts
│       └── nodemap/
│           ├── nodeClient.service.ts      ← ノード（点）管理
│           ├── edgeClient.service.ts      ← エッジ（線）管理
│           └── clusterClient.service.ts   ← クラスター（面）管理
├── supabase/
│   ├── 001_initial_schema.sql
│   ├── 002_tasks_schema.sql
│   └── 003_nodemap_schema.sql        ← ノード・エッジ・クラスターDB
└── package.json
```

---

## 各フェーズの引き継ぎメモ

### Phase 1 → Phase 2 への引き継ぎ
- **実装したファイル構成：** 上記ファイル構成のinbox系ファイル全て
- **使用した技術の最終決定：** Next.js 14 (App Router), TypeScript, Tailwind CSS 3, Supabase, Anthropic Claude API
- **注意点・課題：**
  - 全サービスはデモモードで動作（API未設定時はダミーデータ返却）
  - Supabaseは接続未実施（スキーマのみ作成）
  - 同一案件スレッド化は未実装（将来対応）
  - 公式ロゴSVGはpublic/iconsに格納済み

### Phase 2 → Phase 3（設定画面）への引き継ぎ
- **実装したファイル構成：** tasks系ファイル全て + @dnd-kit関連
- **改善フィードバック対応：**
  - D&D対応（@dnd-kit、8pxの活性化閾値でクリック/ドラッグ区別）
  - AI提案をカラム化（未着手の左側に縦スクロール配置）
  - 判断材料の追加（sourceFrom/sourceDate/sourceSubject/sourceExcerpt）
  - 却下ボタン追加（却下/あとで/タスクに追加の3ボタン）
  - 優先度をテキストバッジに変更（高/中/低）
  - 構想メモの構造化フォーム（ゴール/主な内容/気になる点/期限日）
  - 進行フェーズのAI補助クイックアクション（4種）
  - 詳細タブの再設計

### Phase 3（設定画面）→ Phase 4（データ収集基盤）への引き継ぎ
- **実装したファイル構成：** settings系ファイル全て
- **2層構造の設計：**
  - admin設定: API基盤（Client ID/Secret, Bot Token, APIキー, Supabase URL等）
  - 個人設定: OAuth認証（各チャネルへのログイン）+ プロフィール + 表示・通知設定
  - admin未設定時は個人の認証ボタンが無効化される
- **注意点：**
  - 設定は現在インメモリ保存（本番はSupabase暗号化保存が必要）
  - OAuth認証フローはシミュレーション（本番は実際のOAuth2実装が必要）
  - 接続テストもシミュレーション

### Phase 4（データ収集基盤）→ Phase 5（思考マップUI）への引き継ぎ
- **実装したファイル構成：** nodemap系サービス全て + ノードAPI + キーワード抽出エンジン
- **データ収集基盤の設計：**
  - ノード（点）: keyword/person/projectの3タイプ。頻出度カウント・理解度自動判定付き
  - エッジ（線）: co_occurrence/sequence/causalの3タイプ。重み（weight）で太さを表現
  - クラスター（面）: ideation/resultの2タイプ。差分計算でdiscoveredOnPathを算出
  - キーワード抽出: Anthropic Claude API使用。デモモードではルールベース抽出
- **既存フローとの統合：**
  - メッセージ取得時（GET /api/messages）→ 全メッセージからキーワード自動抽出
  - タスクAI会話時（POST /api/tasks/chat）→ 会話内容からキーワード抽出 + フェーズに応じたエッジ/クラスター生成
  - タスク要約生成時（PUT /api/tasks/chat）→ 要約から結果クラスターを自動構築
- **注意点：**
  - 全データはインメモリ保存（本番はSupabase。003_nodemap_schema.sql準備済み）
  - デモ用の初期データ（12ノード・8エッジ・4クラスター）が組み込み済み
  - キーワード抽出のエラーは既存フローに影響させない（非同期・エラー無視パターン）
  - useNodesフックでフロントから全データにアクセス可能

---

## 次にやること

1. **Phase 5（設計書Phase 4）：思考マップUIを実装する**
   - ネットワークグラフの表示画面（D3.js or React Flow）
   - タスク選択 → 構想・経路・結果の段階表示
   - 人物切り替え機能
   - 比較モード（2人並列表示）

2. **APIキーの準備**（実運用開始前に必要）
   - Gmail API / Slack Bot Token / Chatwork APIトークン / Anthropic Claude APIキー / Supabase

---

## 運用ルール（要約）

> 詳細は設計書セクション7を参照

| ルール | 内容 |
|--------|------|
| フォルダ構成 | 設計書7-1の固定ツリーに従う |
| 命名規則 | 設計書7-2の表に従う |
| 格納ルール | 設計書7-3の7項目を厳守 |
| コミット | 日本語、[種別] 形式、1機能1コミット |
| フェーズ完了時 | SSOTを更新→不要ファイル削除→構成確認→コミット→CHECKPOINT提示 |

---

## ローカルに保持するファイル一覧

| ファイル | 説明 |
|----------|------|
| `NodeMap_設計書_v1.docx` | サービス全体の設計仕様 |
| `NODEMAP_SSOT.md` | このファイル。進捗・決定事項・引き継ぎ情報 |
| `PROMPT_TEMPLATE.md` | 毎回の会話開始時に使う定型文 |

---

> **運用ルール**
> - 各フェーズの完了時、エージェントはこのファイルを必ず更新する
> - CHECKPOINTの結果と決定事項を記録する
> - 次のフェーズへの引き継ぎメモを記入する
> - sjinjiさんはCHECKPOINTの確認結果を口頭でエージェントに伝えればOK
