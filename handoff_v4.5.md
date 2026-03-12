# 次スレッド引き継ぎ文（v4.5〜 ボット強化）

以下をそのまま次のスレッド冒頭に貼り付けてください。

---

## 前提

NodeMapプロジェクトの継続開発です。まず `CLAUDE.md` を必ず読んでください。設計・ルール・テーブル・APIの全情報が記載されています。

補足ドキュメント:
- `docs/ARCHITECTURE_V2.md` — アーキテクチャ詳細
- `docs/TABLE_SPECS.md` — DB現状マスタ（全テーブルCREATE文）

## 現在の状態（2026-03-12時点）

v4.0〜v4.4まで実装済み。直前のスレッドで以下のバグ修正とテストを完了：

### 修正済みバグ（重要な教訓）

1. **Vercelバックグラウンド処理打ち切り**: Webhook処理で `processTaskCreation().catch(...)` のようなfire-and-forgetを使うと、HTTPレスポンス返却後にVercelが関数を終了し、処理が完了しない。**全処理を`await`してからreturnすること**が必須。

2. **Slackリトライ対策**: `X-Slack-Retry-Num` ヘッダーで検知して即200返却。

3. **resolveProjectFromChannel()の戻り値ミス**: この関数は `{ projectId, projectName, organizationId }` オブジェクトを返す。文字列IDではない。以前 `.eq('id', projectId)` にオブジェクトを渡してプロジェクト紐付けが常に失敗していた。

4. **Chatwork BOTトークン**: `CHATWORK_BOT_API_TOKEN` を優先使用。`CHATWORK_API_TOKEN` はフォールバック。

5. **カラム名の間違い**: `project_channels` テーブルは `channel_identifier`（× `identifier`）、`channel_label`（× `channel_name`）。

### 動作確認済み機能

- Slack/Chatworkメンション → 即レス「確認中です...」（1-2秒） → タスク作成完了返信（5-8秒）
- タスク自動生成時にプロジェクト自動紐付け ✅
- 依頼者（requester_contact_id）自動解決 ✅
- 期限キーワード検出（今日/明日/今週/来週） ✅
- 作成元にチャネル名表示（例: "Slack テスト から生成"） ✅

## 次のスレッドでの作業内容

Slack/Chatworkボットの強化を行います：

1. **タスク機能の変更・拡充** — 現在のタスク作成をよりリッチに
2. **リッチカード挿入** — Slack Block Kit / Chatworkのリッチフォーマットでボット返答を装飾
3. **その他ボットの多機能強化** — 詳細は相談しながら決定

## 主要ファイル（ボット関連）

| ファイル | 用途 |
|---|---|
| `src/app/api/webhooks/slack/events/route.ts` | Slack Webhookエントリポイント |
| `src/app/api/webhooks/chatwork/events/route.ts` | Chatwork Webhookエントリポイント |
| `src/services/v43/botIntentClassifier.service.ts` | キーワードベースintent分類（6種） |
| `src/services/v43/botAiClassifier.service.ts` | AI intent分類（Claude Haiku） |
| `src/services/v43/botResponseGenerator.service.ts` | レスポンス生成（公開レベルフィルタ） |
| `src/services/v4/taskFromMessage.service.ts` | メッセージ→タスク自動生成 |
| `src/services/v44/botMessageFormatter.service.ts` | 定期配信メッセージフォーマット |
| `src/services/v44/botScheduledDelivery.service.ts` | 定期配信ロジック |
| `src/components/v4/TaskDetailPanel.tsx` | タスク詳細パネル |
| `src/components/v4/KanbanBoard.tsx` | カンバンボード |

## 注意事項

- 非エンジニアのユーザーです。技術説明は平易に。
- ビルドはローカルターミナル（`~/Desktop/node_map_git`）で実行してもらいます（VM容量制限のため）。
- デプロイはVercel（`git push` で自動デプロイ）。
