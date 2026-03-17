# 引き継ぎ書：マルチユーザー対応バグ修正

作成日: 2026-03-17

## 症状

鈴木さん（owner）の環境では全て正常に動作するが、他メンバー（yokota, taniguchi, fukuda）で以下の問題が発生：
- Google認証ができない
- 組織・プロジェクトが表示されない
- タスクが読み込まれない

## 根本原因

NodeMapが「個人ツール」として設計された名残で、APIの多くに `.eq('user_id', userId)` フィルタが残っている。
チーム共有データ（組織・PJ・タスク・ビジネスイベント等）まで個人フィルタがかかっており、作成者以外がアクセスできない。

## 修正方針

**方針A（最小修正）を採用**: user_idフィルタを削除し、全データを全ユーザーに公開。
社内チーム（4名、全員@next-stage.biz）のため、データ分離は不要。

---

## 修正対象一覧（6カテゴリ）

### カテゴリ1: 組織（organizations）— 高優先

| ファイル | 行（目安） | 現在のコード | 修正内容 |
|---|---|---|---|
| `src/app/api/organizations/route.ts` | GET処理 | `.eq('user_id', userId)` | **削除** |
| `src/app/api/organizations/route.ts` | POST処理 | `user_id: userId` をINSERT | 残す（作成者記録として）。ただしGETでフィルタしない |

### カテゴリ2: プロジェクト（projects）— 高優先

| ファイル | 行（目安） | 現在のコード | 修正内容 |
|---|---|---|---|
| `src/app/api/projects/route.ts` | GET処理 | `.eq('user_id', userId)` | **削除** |
| `src/app/api/projects/route.ts` | POST処理 | `user_id: userId` をINSERT | 残す（作成者記録として） |

### カテゴリ3: タスク（tasks）— 高優先

| ファイル | 行（目安） | 現在のコード | 修正内容 |
|---|---|---|---|
| `src/app/api/tasks/route.ts` | GET（project_id指定時） | `.eq('user_id', userId).eq('project_id', ...)` | `.eq('user_id', userId)` を**削除** |
| `src/app/api/tasks/route.ts` | GET（project_id未指定時） | `.eq('user_id', userId)` | **残す**（個人タスク用途） |
| `src/app/api/tasks/route.ts` | PUT処理 | `.eq('user_id', userId)` | **削除**（チームメンバーがステータス変更できるように） |
| `src/app/api/tasks/route.ts` | DELETE処理 | `.eq('user_id', userId)` | **削除** |
| `src/app/api/tasks/my/route.ts` | project_id指定時 | コード確認要 | project_id指定時は全メンバーのタスクを返す |

**タスク作成（Slack/Chatwork経由）の修正**:
- `src/app/api/webhooks/slack/interactions/route.ts` — ボタン押下時のタスク作成で、操作者のSlack user_id → contact_channels → contact_persons.linked_user_id でNodeMapユーザーIDを解決
- `src/app/api/webhooks/chatwork/events/route.ts` — 同様にChatwork account_id → linked_user_id で解決
- `src/services/v4/taskFromMessage.service.ts` — タスク作成時のuser_id解決ロジック確認

### カテゴリ4: ビジネスイベント（business_events）— 高優先

| ファイル | 行（目安） | 現在のコード | 修正内容 |
|---|---|---|---|
| `src/app/api/business-events/route.ts` | GET処理 | `.eq('user_id', userId)` | **削除**（project_idでスコープ） |
| `src/app/api/business-events/route.ts` | DELETE処理 | `.eq('user_id', userId)` | **削除** |
| `src/app/api/business-events/route.ts` | POST処理 | `user_id: userId` をINSERT | 残す（作成者記録として） |

### カテゴリ5: コンタクト（contact_persons）— 中優先

| ファイル | 行（目安） | 現在のコード | 修正内容 |
|---|---|---|---|
| `src/app/api/contacts/route.ts` | GET処理 | `.or('owner_user_id.eq.${userId},owner_user_id.is.null')` | **削除**（全コンタクト表示） |
| `src/app/api/contacts/route.ts` | PUT処理 | `.eq('owner_user_id', userId)` 確認要 | **削除** |

### カテゴリ6: Google OAuth + ENV_TOKEN_OWNER_ID — 中優先

#### OAuth認証フロー（2ファイル）

| ファイル | 現在のコード | 修正内容 |
|---|---|---|
| `src/app/api/auth/gmail/route.ts` | `userId = process.env.ENV_TOKEN_OWNER_ID` | `getServerUserId()` でログインユーザーのIDを取得。stateパラメータにuserIdを含める |
| `src/app/api/auth/gmail/callback/route.ts` | `userId = process.env.ENV_TOKEN_OWNER_ID` | stateパラメータからuserIdを取得。そのユーザーIDでトークン保存 |

#### Cronジョブ（複数ファイル）

現在: `ENV_TOKEN_OWNER_ID` のトークンのみ使用
修正後: `user_service_tokens` から全ユーザーのトークンを取得し、ユーザーごとにループ処理

| ファイル | 用途 |
|---|---|
| `src/app/api/cron/sync-calendar-events/route.ts` | カレンダー同期 |
| `src/app/api/cron/sync-meeting-notes/route.ts` | Gemini会議メモ取り込み |
| `src/app/api/cron/generate-meeting-agendas/route.ts` | アジェンダ生成 |
| `src/app/api/cron/update-meeting-agenda-descriptions/route.ts` | アジェンダ更新 |
| `src/app/api/cron/process-recurring-rules/route.ts` | 繰り返しルール |

※ ただしCronのGoogle API呼び出しは「誰のカレンダーを参照するか」の問題があるため、当面はENV_TOKEN_OWNER_ID（鈴木さん）のトークンで代表アクセスする方式でも可。全員がOAuth認証を完了してから段階的にマルチユーザー化する。

---

## 正常（修正不要）な箇所

| テーブル/API | 理由 |
|---|---|
| inbox_messages の `.eq('user_id', userId)` | CLAUDE.mdルール4。ユーザー個人のメッセージ。正しいフィルタ |
| task_conversations の user_id | 会話の発言者識別。正しい |
| tasks/my（project_id未指定時） | 「自分のタスク」として正しい |
| メール関連（EMAIL_ENABLED=false） | 現在休眠中。対象外 |
| Cronジョブのuser_idなしクエリ | プロジェクト横断処理。正しい |

---

## 修正の優先順

```
Phase 1（高優先 — これで3つのバグが解消）:
  1. organizations/route.ts — GETのuser_idフィルタ削除
  2. projects/route.ts — GETのuser_idフィルタ削除
  3. tasks/route.ts — project_id指定時のuser_idフィルタ削除 + PUT/DELETEのuser_idフィルタ削除
  4. business-events/route.ts — GET/DELETEのuser_idフィルタ削除

Phase 2（中優先 — Google認証のマルチユーザー化）:
  5. auth/gmail/route.ts — getServerUserId()使用に変更
  6. auth/gmail/callback/route.ts — stateからuserId取得に変更

Phase 3（中優先 — コンタクト共有化）:
  7. contacts/route.ts — owner_user_idフィルタ削除

Phase 4（低優先 — Cronのマルチユーザー化）:
  8. 各Cronジョブの全ユーザートークンループ化
```

---

## 参照ファイル

| ファイル | 内容 | 必読 |
|---|---|---|
| CLAUDE.md | 設計SSOT。10のルール・テーブル定義・API仕様 | ★ |
| docs/TABLE_SPECS.md | 全テーブルCREATE文 | ★ |
| docs/ARCHITECTURE_V2.md | V2設計書 | 参考 |
| **本ファイル（HANDOFF_MULTIUSER_FIX.md）** | マルチユーザー修正の引き継ぎ書 | ★ |

## 修正時の注意事項

1. **INSERTのuser_idは残す**: 作成者の記録として有用。GETのフィルタだけ外す
2. **inbox_messagesのuser_idは絶対に外さない**: CLAUDE.mdルール4で規定。外すと他ユーザーのメッセージが漏洩する
3. **ビルド確認必須**: `npm run build` でエラーがないことを確認
4. **テスト方法**: 修正後、yokotaまたはtaniguchiのアカウントでログインし、組織・PJ・タスクが表示されることを確認
