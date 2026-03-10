# 次スレ開始時コメント文

以下をそのままコピーして次スレの最初のメッセージとして貼り付けてください。

---

NodeMap v4.0「タスク管理リアーキテクチャ」の実装を**Phase 5から継続**します。

## 完了済みフェーズ

| Phase | 内容 | ステータス |
|---|---|---|
| 1 | Theme → Goal リネーム（テーブル・UI・API） | ✅ 完了・デプロイ済み |
| 2 | タスク管理ページ新設（/tasks） | ✅ 完了・デプロイ済み |
| 3 | Slack Bot タスク自動生成 | ✅ 完了・デプロイ済み・動作確認済み |
| 4 | Chatwork Bot タスク自動生成 | ✅ 完了・デプロイ済み・動作確認済み |
| **5** | **会議録からの階層一括生成強化** | **⬚ 未着手（ここから）** |
| **6** | **完了通知・双方向同期** | **⬚ 未着手** |

## 作業前に読むべきファイル

1. `CLAUDE.md` — プロジェクトSSOT（10のルール・テーブル・API・配色）
2. `docs/V4_SPEC.md` — v4.0仕様書（全6フェーズの設計。Phase 1-4は完了マーク付き）
3. `docs/V4_HANDOVER.md` — 引き継ぎ書（Phase 1-4の実装サマリー・判明した注意事項）
4. `docs/TABLE_SPECS.md` — DBテーブル現状マスタ

## Phase 5 の概要

会議録AI解析の出力を拡張し、ゴール/マイルストーン/タスクの階層構造を一括提案・承認できるようにする。

```
AI解析の出力（v4.0拡張）:
{
  "topics": [...],           // 既存: 検討ツリーノード用
  "action_items": [...],     // 既存: タスク提案用
  "goal_suggestions": [      // 新規: ゴール提案
    {
      "title": "Phase1: 現状分析",
      "milestones": [
        {
          "title": "競合分析完了",
          "tasks": [
            { "title": "競合3社のLP収集", "due_date": "2026-03-14" }
          ]
        }
      ]
    }
  ]
}
```

必要な実装:
- AI解析プロンプトに `goal_suggestions` 出力を追加
- 承認UIコンポーネント（プレビュー → 一括承認 or 個別編集 → 確定）
- 一括作成API（goals + milestones + tasks を一括INSERT）

## Phase 6 の概要

- タスク完了時にSlack/Chatworkへ通知（元メッセージのスレッドに「✅ タスク完了」を投稿）
- Slack/Chatworkからの完了操作（リアクション or メンションで完了）

## 重要な制約

- ユーザーは非エンジニア。SQL実行・ビルド・デプロイ・Git操作はユーザーが手動実行
- VMディスクがフル。ファイル作成はユーザー側ターミナルで `cat > file << 'EOF'` パターンを使用
- Vercel params: `{ params }: { params: Promise<{ id: string }> }` でPromise受け
- サービス層: `const supabase = getServerSupabase() || getSupabase();`
- tasks.phase CHECK制約: `'ideation'`/`'progress'`/`'result'` のみ（`'plan'` 不可）
- tasks.status CHECK制約: `'todo'`/`'in_progress'`/`'done'` のみ（`'not_started'` 不可）
- Vercel上でAnthropic API接続が不安定（ECONNRESET頻発）。現在はシンプルキーワード抽出で回避中

## 将来の改善案（Phase 5-6完了後に検討）

- Slack Block Kit ボタンUI
- AI抽出の復活（Vercel環境での安定化）
- マルチユーザータスク割当（ENV_TOKEN_OWNER_ID固定→メッセージ送信者ごとに対応）

Phase 5から始めてください。まずV4_SPEC.mdのPhase 5セクションを読み、AI解析プロンプトの拡張から進めてください。
