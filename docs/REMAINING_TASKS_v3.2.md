# NodeMap v3.2 残課題一覧

最終更新: 2026-03-09
前スレッドで実施: カレンダー修正、タスクカード無限ループ修正、秘書チャットUI改善（テキスト構造化・動的選択肢・MS開閉式カード）

---

## 優先度: 高

### 1. `formatAssistantMessage()` が `#` マークダウン見出しに未対応

**現状**: AIレスポンスが `# 見出し` や `## 小見出し` を使って返すことがあるが、`formatAssistantMessage()`は `【見出し】` 形式のみ対応。`#` がそのまま表示される。

**対応箇所**: `src/components/secretary/SecretaryChat.tsx` — `formatAssistantMessage()` 関数内

**修正方針**: `#` / `##` / `###` のパースを追加。または、APIのシステムプロンプト側で `#` ではなく `【】` 形式を使うよう指示する（後者の方がシンプル）。

---

### 2. 秘書AIのシステムプロンプトに出力フォーマット指示が不足

**現状**: AIレスポンスのフォーマットが不統一。`#` 見出しを使ったり、`【】` を使ったり、プレーンテキストだったり。

**対応箇所**: `src/app/api/agent/chat/route.ts` — システムプロンプト構築部分（`conversationHistory` のsystem message）

**修正方針**: 以下のフォーマットルールをシステムプロンプトに追加:
```
回答フォーマット:
- 見出しは【】で囲む（例: 【タスク状況】）
- 箇条書きは「・」を使う
- 強調は **太字** を使う
- #マークダウン記法は使わない
- 簡潔に、長くても200文字以内で回答する
```

---

### 3. `/api/calendar/debug` デバッグエンドポイントの削除

**現状**: カレンダーデバッグ用に作った `src/app/api/calendar/debug/route.ts` が本番環境にデプロイされたまま。

**対応**: ファイル削除のみ。

---

## 優先度: 中

### 4. MilestoneSection.tsx の projectId 未渡し問題（既知バグ）

**現状**: `MilestoneSection.tsx` で `MilestoneCard` に `projectId` が渡されていない。展開時にエラー。

**対応箇所**: `src/components/organizations/MilestoneSection.tsx`

---

### 5. 秘書チャットの動的選択肢をよりコンテキストに敏感にする

**現状**: `getSuggestions()` は intent のみで選択肢を決定。会話内容やカードの有無で微調整していない。

**対応箇所**: `src/app/api/agent/chat/route.ts` — `getSuggestions()` 関数

**例**:
- MSが0件の時 →「マイルストーンを作成して」を提案
- タスクが多い時 →「優先度の高いタスクを教えて」を提案

---

### 6. QuickActionBar と動的suggestions の使い分け最適化

**現状**: 最後のアシスタントメッセージにsuggestionsがあればそちら、なければ QuickActionBar を表示。ただし、ユーザーが追加メッセージを送ると古いsuggestionsが残る場合がある。

**対応箇所**: `src/components/secretary/SecretaryChat.tsx` — suggestions表示ロジック

---

### 7. TaskResumeCard の「チャットで相談」ボタンの動作確認

**現状**: `resume_task` ハンドラを `setInput()` + `inputRef.focus()` に変更。タスク名がinputに入るだけでメッセージは送信されない。UX的にワンクリックで相談開始できる方がいい可能性。

**対応方針**: 実際のユーザーフィードバックを見て判断。

---

## 優先度: 低

### 8. カレンダー接続の `isCalendarConnected()` API フォールバック最適化

**現状**: `scope` フィールドが空の場合にAPI呼び出しでフォールバック確認している。毎回APIを叩くのは非効率。

**対応箇所**: `src/services/calendar/calendarClient.service.ts`

**修正方針**: 一度API確認が成功したらscopeを更新保存する。

---

### 9. 秘書チャットメッセージのタイムスタンプ表示

**現状**: メッセージに `timestamp` フィールドはあるがUIに表示していない。長い会話では時間の流れがわかりにくい。

---

### 10. 思考マップ・ジョブ詳細ページが秘書チャットからアクセスしにくい

**現状**: プロジェクト詳細ページの思考マップタブ・ジョブタブへの直接リンクが秘書チャットから出せない。

---

## v3.2 で修正済み（参考）

| 問題 | 修正コミット | 内容 |
|---|---|---|
| カレンダー空き時間が常に0 | `ff721dd` | `getAllCalendarEvents` をprimaryのみに変更 |
| `isCalendarConnected` 常にfalse | `bab9922` | TokenData.scope追加 + APIフォールバック |
| タスクカード無限ループ | `1b7aa0b` | `sendMessage`除去、プロジェクトリンクに変更 |
| マイルストーンintent誤分類 | `4c20ce3`以降 | `milestone_status`を`project_status`より前に移動 |
| テキスト構造化・選択肢 | `4c20ce3` | `formatAssistantMessage` + `suggestions` 追加 |
| MS開閉式カード | `4c20ce3` | `milestone_overview` カードタイプ追加 |

---

## 次スレッドで最初に確認すべきこと

1. `npm run build` が通ること
2. 「マイルストーンの進捗を教えて」で `milestone_overview` カードが出ること（DBにMSデータがある前提）
3. 「今日の状況を教えて」で動的suggestionsチップが表示されること
4. テキスト表示で `#` が生表示にならないこと（→ 残課題1 or 2 で対応）
