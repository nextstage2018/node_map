# v9.0 完了後の引き継ぎ書 — 微調整・クリーンアップ・仕上げ

作成日: 2026-03-16

> v9.0（秘書ダッシュボード化）までの全機能実装が完了。
> 本ドキュメントは次セッションで行う**微調整・レガシー削除・仕上げ**の作業リスト。

---

## 1. レガシーコード削除（安全に削除可能）

### 1-A. 秘書AIチャット関連（v9.0で廃止済み）

page.tsx から一切参照されていない。削除してビルド通ることを確認。

| ファイル | 理由 |
|---|---|
| `src/components/secretary/SecretaryChat.tsx` | 旧秘書AIチャット本体。page.tsxから未参照 |
| `src/components/secretary/WelcomeDashboard.tsx` | 旧ウェルカム画面。SecretaryChatから参照されていたが本体が廃止 |
| `src/components/secretary/ChatCards.tsx` | 旧カード型選択UI。SecretaryChatから参照 |
| `src/components/secretary/QuickActions.tsx` | 旧クイックアクション。SecretaryChatから参照 |
| `src/services/secretary/classifyIntent.ts` | 44 intent分類。/api/agent/chatから参照 |
| `src/services/secretary/formatAssistantMessage.ts` | チャットリッチ表示。SecretaryChatから参照 |

**注意**: 削除前に `grep -r "SecretaryChat\|WelcomeDashboard\|ChatCards\|QuickActions\|classifyIntent\|formatAssistantMessage" src/` で他の参照がないことを確認。

### 1-B. 秘書API（v9.0で廃止済み）

| ファイル/ディレクトリ | 理由 |
|---|---|
| `src/app/api/agent/chat/route.ts` | 秘書AIチャットAPI。ホーム画面から未使用 |
| `src/app/api/agent/conversations/route.ts` | 秘書会話履歴API。同上 |

### 1-C. リダイレクトページ（廃止済みルート）

すべて `/` にリダイレクトするだけのページ。削除しても影響なし。

| ファイル | 旧URL |
|---|---|
| `src/app/thought-map/page.tsx` | /thought-map → / |
| `src/app/jobs/page.tsx` | /jobs → / |
| `src/app/memos/page.tsx` | /memos → / |
| `src/app/contacts/page.tsx` | /contacts → / |
| `src/app/business-log/page.tsx` | /business-log → / |
| `src/app/agent/page.tsx` | /agent → / |
| `src/app/master/page.tsx` | /master → /settings |

**注意**: ブックマーク等で直アクセスするユーザーがいる可能性。即削除 or しばらく残すか判断。

### 1-D. MeetGeek Webhook（v7.0で廃止済み）

| ファイル | 状態 |
|---|---|
| `src/app/api/webhooks/meetgeek/route.ts` | 即時200返却の空実装。削除 or そのまま |

将来復帰予定がなければ削除。復帰予定なら現状維持（害はない）。

---

## 2. コード修正（バグ・不整合）

### 2-A. unified_messages 参照の修正

| ファイル | 問題 | 修正 |
|---|---|---|
| `src/app/api/contacts/[id]/activities/route.ts` | `unified_messages` テーブルを参照（存在しない） | `inbox_messages` に書き換え |

### 2-B. CLAUDE.md の記述不整合

| 項目 | 問題 | 修正 |
|---|---|---|
| seeds テーブル | 「廃止済み」と記載があるが CRUD APIが完全に動作中 | APIを削除するか、記述を「参照のみ」に更新 |
| inbox_messages.user_id | テーブル一覧に「user_idカラムなし」と記載 | 実際にはuser_id TEXT NOT NULLが存在。記述修正 |

---

## 3. テーブルクリーンアップ検討

### 3-A. 削除候補

| テーブル | 理由 | リスク |
|---|---|---|
| `secretary_conversations` | v9.0で秘書チャット廃止。AIコンテキスト用だったが参照元なし | 低（他から参照なし） |
| `seeds` | CLAUDE.mdで「廃止済み」宣言。UIなし | 低（参照のみ） |

### 3-B. 現状維持推奨

| テーブル | 理由 |
|---|---|
| `themes` | FK制約あり。milestones.theme_id が参照。データ削除は危険 |
| `consultations` | 使用頻度は低いが機能として有効 |
| `idea_memos` | 同上 |

---

## 4. UI微調整・仕上げ

### 4-A. ダッシュボード（v9.0）

| 項目 | 内容 | 優先度 |
|---|---|---|
| レスポンシブ確認 | モバイル幅で3カードが縦積みになるか確認 | 中 |
| カレンダー週表示 | 現在月表示のみ。週表示も追加検討 | 低 |
| タスクリマインダーのリンク先 | `/tasks?taskId=X` で正しく詳細パネルが開くか確認 | 高 |
| インボックス返信後のリスト更新 | 返信送信後にリストから消えるか確認 | 高 |
| カレンダー未連携時の表示 | 「設定画面から連携」リンクが正しく動くか確認 | 中 |
| 空状態のデザイン | 各カードで0件時のUI確認 | 中 |

### 4-B. 既存機能の動作確認

| 項目 | 内容 |
|---|---|
| 検討ツリータブ | MilestoneProposalPanel の編集/削除が正常動作するか |
| 定期イベント | カレンダー連携の作成/削除が正しく動くか |
| Slack/Chatwork Bot | メンション応答・タスク作成が正常か |
| Gemini会議メモ取り込み | Cron実行後にパイプラインが正常完了するか |

---

## 5. ビルド確認

前セッションではディスク容量不足（ENOSPC）でビルドが実行できなかった。

```bash
# キャッシュクリア + ビルド
rm -rf .next && npm run build

# 依存関係問題がある場合
rm -rf .next node_modules package-lock.json && npm install && npm run build
```

**最優先**: ビルドが通ることを確認してからデプロイ。

---

## 6. 作業の推奨順序

```
1. ビルド確認（ENOSPC解消後）
2. レガシーコード削除（1-A → 1-B → ビルド確認）
3. コード修正（2-A unified_messages）
4. CLAUDE.md不整合修正（2-B）
5. UI微調整・動作確認（4-A, 4-B）
6. テーブルクリーンアップ（3-A）← 慎重に
7. リダイレクトページ削除判断（1-C）
8. 最終ビルド + デプロイ
```

---

## 7. 現在のファイル構成（v9.0 ホーム画面）

```
src/app/page.tsx                          ← SecretaryDashboard を表示
src/components/secretary/
  ├── SecretaryDashboard.tsx              ← 3カードグリッド（新規）
  ├── InboxReplyCard.tsx                  ← インボックス返信（新規）
  ├── CalendarWidget.tsx                  ← カレンダー（新規）
  ├── TaskReminderCard.tsx                ← タスクリマインダー（新規）
  ├── SecretaryChat.tsx                   ← 【削除候補】旧AIチャット
  ├── WelcomeDashboard.tsx                ← 【削除候補】旧ウェルカム
  ├── ChatCards.tsx                       ← 【削除候補】旧カード選択UI
  └── QuickActions.tsx                    ← 【削除候補】旧クイックアクション
```
