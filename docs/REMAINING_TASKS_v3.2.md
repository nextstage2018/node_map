# NodeMap v3.2 残課題一覧

最終更新: 2026-03-09
前スレッドで実施: カレンダー修正、タスクカード無限ループ修正、秘書チャットUI改善（テキスト構造化・動的選択肢・MS開閉式カード）

**必読ドキュメント（作業前に必ず確認）**:
- `CLAUDE.md` — 設計SSOT（10のルール・配色・テーブル・API・全intentリスト）
- `docs/ARCHITECTURE_V2.md` — V2設計書
- `docs/TABLE_SPECS.md` — 全テーブルCREATE文

---

## 優先度: 高

### 1. `formatAssistantMessage()` が `#` マークダウン見出しに未対応

**現状**: AIレスポンスが `# 見出し` や `## 小見出し` を返すが、`formatAssistantMessage()` は `【見出し】` 形式のみ対応。`#` がそのまま生テキストで表示される。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/secretary/SecretaryChat.tsx` | L407 | `formatAssistantMessage()` 関数定義 |
| `src/components/secretary/SecretaryChat.tsx` | L459〜 | `【セクション見出し】` パース処理（ここに `#` パースを追加） |
| `src/components/secretary/SecretaryChat.tsx` | L2032 | 呼び出し箇所（アシスタントメッセージ表示） |

**修正方針A（推奨）**: 課題2と合わせてAIプロンプト側で `#` を使わず `【】` を指示する。
**修正方針B**: L459付近に `#`/`##`/`###` パースを追加する。

---

### 2. 秘書AIのシステムプロンプトに出力フォーマット指示が不足

**現状**: AIレスポンスのフォーマットが不統一（`#` / `【】` / プレーン混在）。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/app/api/agent/chat/route.ts` | L3870 | `buildSystemPrompt()` 関数定義 |
| `src/app/api/agent/chat/route.ts` | L4148 | `buildSystemPrompt()` 呼び出し |
| `src/app/api/agent/chat/route.ts` | L4156 | Claude APIへのsystem prompt送信箇所 |

**修正方針**: `buildSystemPrompt()` の返却文字列に以下を追加:
```
【回答フォーマットルール】
- 見出しは【】で囲む（例: 【タスク状況】）。# マークダウン記法は使わない
- 箇条書きは「・」を使う
- 強調は **太字** を使う
- 簡潔に回答する（目安200文字以内）
```

---

### 3. `/api/calendar/debug` デバッグエンドポイントの削除

**対応**: 以下のファイルを削除するだけ:
```
src/app/api/calendar/debug/route.ts
```

---

## 優先度: 中

### 4. MilestoneSection.tsx の projectId 未渡し問題（既知バグ）

**現状**: `MilestoneCard` に `projectId` が渡されていない。展開時にエラー。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/organizations/ProjectsTab.tsx` | — | `MilestoneCard` / `MilestoneSection` を含む |

---

### 5. 秘書チャットの動的選択肢をコンテキストに敏感にする

**現状**: `getSuggestions()` は intent のみで選択肢を決定。カードの有無やデータ件数で微調整していない。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/app/api/agent/chat/route.ts` | L4190 | `getSuggestions()` 関数定義 |
| `src/app/api/agent/chat/route.ts` | L4114, L4128, L4180 | レスポンスで`suggestions`を返す3箇所 |

**例**: MSが0件の時 →「マイルストーンを作成して」を提案、タスクが多い時 →「優先度の高いタスクを教えて」を提案

---

### 6. QuickActionBar と動的suggestions の使い分け最適化

**現状**: 最後のアシスタントメッセージにsuggestionsがあればそちらを表示、なければ QuickActionBar。古いsuggestionsが残る場合がある。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/secretary/SecretaryChat.tsx` | L2074〜2091 | suggestions / QuickActionBar 切り替えロジック |
| `src/components/secretary/QuickActions.tsx` | 全体 | QuickActionBar 定義（固定アクション） |

---

### 7. TaskResumeCard の「チャットで相談」ボタンの動作確認

**現状**: `resume_task` を `setInput()` + `inputRef.focus()` に変更済み。メッセージは自動送信されない。

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/secretary/SecretaryChat.tsx` | L922 | `resume_task` ハンドラ |
| `src/components/secretary/ChatCards.tsx` | L523〜 | `TaskResumeCard` コンポーネント |
| `src/components/secretary/ChatCards.tsx` | L750〜 | `TaskProgressCard` コンポーネント |

**対応方針**: ユーザーフィードバックを見て判断。

---

## 優先度: 低

### 8. カレンダー接続の `isCalendarConnected()` 最適化

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/services/calendar/calendarClient.service.ts` | — | `isCalendarConnected()`, `getAllCalendarEvents()`, `findFreeSlots()` |

**修正方針**: API確認成功後にscopeをDB保存してフォールバック不要にする。

---

### 9. 秘書チャットメッセージのタイムスタンプ表示

**参照ファイル**:
| ファイル | 行 | 内容 |
|---|---|---|
| `src/components/secretary/ChatCards.tsx` | L155 | `SecretaryMessage` 型定義（`timestamp` フィールドあり） |
| `src/components/secretary/SecretaryChat.tsx` | L2015〜2050 | メッセージ表示ループ |

---

### 10. 思考マップ・ジョブ詳細ページへのリンク不足

**参照**: プロジェクト詳細ページは `/organizations/[orgId]?project=[pjId]&tab=thought-map` でアクセス可能。秘書チャットのカードからのリンクが未実装。

---

## v3.2 実装済みの主要変更マップ

秘書チャットUI関連ファイルの構造（次スレッドで最初に読むべき）:

```
src/components/secretary/
├── SecretaryChat.tsx      ← メインチャット画面
│   ├── L407  formatAssistantMessage()  ← テキスト構造化表示
│   ├── L922  resume_task ハンドラ      ← タスク相談（入力プリセット）
│   └── L2074 suggestions表示ロジック   ← 動的選択肢 or QuickActionBar
├── ChatCards.tsx           ← 全カードコンポーネント
│   ├── L140  CardType定義（milestone_overview追加済み）
│   ├── L155  SecretaryMessage型（suggestions追加済み）
│   ├── L523  TaskResumeCard           ← 「チャットで相談」+「タスク一覧」
│   ├── L750  TaskProgressCard         ← 情報表示のみ（ボタン削除済み）
│   ├── L2155 milestone_overview レンダリング
│   └── L3919 MilestoneOverviewCard    ← 開閉式MSカード
├── QuickActions.tsx        ← 固定クイックアクションチップ
└── WelcomeDashboard.tsx    ← 初期ダッシュボード

src/app/api/agent/chat/
└── route.ts               ← 秘書API（4000行超）
    ├── L115  classifyIntent()         ← intent分類（キーワードベース）
    ├── L162  milestone関連intent判定   ← v3.2で前方移動済み
    ├── L2840 milestone_status処理     ← milestone_overviewカード生成
    ├── L3870 buildSystemPrompt()      ← AIシステムプロンプト構築
    ├── L4009 メインPOSTハンドラ       ← intent判定→データ取得→AI生成
    └── L4190 getSuggestions()         ← 動的選択肢生成

src/services/calendar/
└── calendarClient.service.ts ← カレンダー統合（primaryのみ修正済み）
```

---

## v3.2 で修正済み（コミット参照）

| 問題 | コミット | 内容 |
|---|---|---|
| カレンダー空き時間が常に0 | `ff721dd` | `getAllCalendarEvents` をprimaryのみに |
| `isCalendarConnected` 常にfalse | `bab9922` | TokenData.scope + APIフォールバック |
| タスクカード無限ループ | `1b7aa0b` | `sendMessage` 除去、リンクに変更 |
| MS intent誤分類 | 最新commit | `milestone_status` を `project_status` より前に |
| テキスト構造化・選択肢 | `4c20ce3` | `formatAssistantMessage` + `suggestions` |
| MS開閉式カード | `4c20ce3` | `milestone_overview` カードタイプ |

---

## 次スレッドで最初に確認すべきこと

1. `npm run build` が通ること
2. 「マイルストーンの進捗を教えて」で `milestone_overview` カードが出ること（DBにMSデータがある前提）
3. 「今日の状況を教えて」で動的suggestionsチップが表示されること
4. テキスト表示で `#` が生表示にならないこと（→ 残課題1 or 2 で対応）
