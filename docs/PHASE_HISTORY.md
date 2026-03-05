# フェーズ実装履歴（アーカイブ）

> このドキュメントは過去の実装記録です。現行仕様は docs/features/ を参照してください。

このドキュメントは CLAUDE.md より、全フェーズの実装内容をアーカイブとして抽出したものです。
Git考古学やコミット履歴の参照に用いてください。

---

## 実装済みフェーズ（コミット履歴）

| Phase | 内容 | コミット |
|---|---|---|
| 30a+30b | マスターデータ基盤・簡単登録UI | 20fec1b |
| 30c+30d | 自動マッチング・ビジネスログ基盤 | f2d2b81 |
| 31 | 種AI会話強化 | f8b1195 |
| 32 | パーソナル秘書エージェント | 03ed3a7 |
| 33 | ビジネスログ強化（議事録・参加者） | 86b5ccf |
| 34 | コンタクト強化・組織ページ | ceb958d |
| 35 | コンタクトマージ・重複解消・チャンネル統合 | mainにマージ済み |
| 36 | AIコミュニケーション分析（コンタクトnotes自動生成） | mainにマージ済み |
| 37 | 組織チャネル連携・メンバー管理・自動検出 | mainにマージ済み |
| 37b | 組織関係性・詳細情報・コンタクト連動・ラベル統一 | 39b676e |
| 38 | 送信メッセージDB保存・スレッド統合表示・送信済みフィルタ | mainにマージ済み |
| 38b | 返信修正・送信文字色改善・宛先サジェスト機能 | mainにマージ済み |
| 39 | AIコミュニケーション分析を双方向（受信＋送信）対応に拡張 | 6cbc3c8 |
| 39b | 外部サービス送信検出＋AI分析ルーム/チャンネルマッチング | 82ecfdb |
| 40 | タスク・種ボックス・ノードマップ修正 | mainにマージ済み |
| 40b | 種AI会話DB保存・プロジェクト選択・インボックスAI種化 | mainにマージ済み |
| 40c | 組織→プロジェクト→チャネル階層・種プロジェクト自動検出・バグ修正 | abbaf17 |
| 41 | 種・タスクRLSバグ修正＋AI構造化タスク変換＋伴走支援AI会話 | 7c202f2 |
| 42a | AI会話キーワード自動抽出→ナレッジマスタ登録→thought_task_nodes紐づけ | 14fd589 |
| 42d+42f | 思考動線記録（thought_edges）＋チーム向け思考マップ可視化UI | 81abb4b |
| 42-fix | classifyKeywordバグ修正＋linkToTaskOrSeed SELECT-INSERT化＋パイプライン安定化 | eee93d5 |
| 42f強化 | 思考マップ「地形ビュー」化: 力学シミュレーション空間配置・全体マップ/個別トレース2モード・フェーズゾーン背景・種→タスクノード統合・パン＆ズーム＋タイムスライダー | mainにマージ済み |
| 42f残り | 会話ジャンプ（ノードクリック→元の会話表示）＋飛地→種化ボタン＋turn_idによる会話追跡基盤 | mainにマージ済み |
| 42b | 送受信メッセージからのノード抽出（Cronバッチ）＋thought_task_nodesにmessage_id追加 | mainにマージ済み |
| 42e | スナップショット（出口想定・着地点）＋思考マップUIにスナップショット比較パネル | mainにマージ済み |
| 42g | ノード重なり検索API＋思考マップUI検索パネル＋関連タスク表示＋詳細タブ→変遷タブ転換 | mainにマージ済み |
| 42h | 比較モード（2人の思考動線重ね・共有ノード・分岐点可視化）＋リプレイモード（完了タスクAI対話） | mainにマージ済み |
| Restructure | ジョブ・アイデアメモ・タスク種別の再設計。jobs/idea_memos/memo_conversationsテーブル新設。タスクページからジョブ分離 | 0058180 |
| Inbox改善 | インボックスアクションボタン再定義（返信AI下書き自動・ジョブ種別選択・タスクAIフォーム）。返信プロンプトにコンタクト情報/過去やり取り/スレッド文脈を反映 | df71c96 |
| 秘書Phase A | 秘書メインチャットUI（SecretaryChat.tsx）＋インラインカードシステム（ChatCards.tsx）＋秘書AI会話API（意図分類＋カード生成） | mainにマージ済み |
| 秘書Phase B | インラインカード統合（InboxSummary/TaskResume/JobApproval/Navigate/ActionResult）＋実データ連携 | mainにマージ済み |
| 秘書Phase C | 返信下書きカード（ReplyDraftCard）＋送信実行＋コンタクト情報連携 | mainにマージ済み |
| Phase B拡張 | ジョブ自律実行（pending→approved→executing→done/failed）＋AI下書き生成＋承認カード編集＋自動送信エンジン | b69dead |
| Calendar連携 | Gmail OAuthにカレンダースコープ追加＋calendarClient.service.ts＋/api/calendar＋秘書AIカレンダーコンテキスト＋日程調整ジョブでカレンダー予定自動作成 | b69dead |
| ブリーフィング強化 | ブリーフィングサマリーカード＋カレンダー予定カード＋期限アラートカード＋AIプロンプト改善 | b69dead |
| Calendar×タスク/ジョブ統合 | タスク/ジョブのスケジュール時刻＋Googleカレンダー自動同期＋task_membersテーブル＋findFreeSlots拡張（NodeMap作業ブロック考慮）＋extendedPropertiesメタデータ | mainにマージ済み |
| Google Drive連携 | OAuth drive.fileスコープ＋drive_folders/drive_documentsテーブル＋DriveClientService＋フォルダ/ドキュメントAPI＋添付自動同期Cron＋秘書AIドキュメントintent/card＋ビジネスログドキュメントタブ＋設定Drive再認証バナー | 23f9b4e |
| Drive実運用対応 | 4階層フォルダ（組織/プロジェクト/方向/年月）＋drive_file_stagingテーブル＋AI自動分類＋秘書ファイル確認フロー（FileIntakeCard）＋承認/却下/一括API＋ステージングクリーンアップCron＋ブリーフィング未確認ファイル数 | mainにマージ済み |
| Phase 45a | URL検出（Google Docs/Sheets/Drive）＋Slack/Chatwork添付ファイル自動取り込み＋全チャネルCron対応 | mainにマージ済み |
| Phase 45b | 秘書ファイル格納指示（store_file intent＋StorageConfirmationCard＋store-file API） | mainにマージ済み |
| Phase 45c | ビジネスイベント自動蓄積Cron＋AI週間要約Cron＋ファイル承認時イベント記録＋business_summary intent＋BusinessSummaryCard | mainにマージ済み |
| Phase 46 | ビジネスログページ改善（コンポーネント分割・AI区別・フィルタ・ダッシュボード）＋ナレッジページ改善（CRUD UI・未確認ノード管理・キーワード詳細） | mainにマージ済み |
| Phase 47 | ナレッジ自動構造化（AIクラスタリング提案＋秘書KnowledgeProposalCard＋提案履歴タブ＋週次Cron） | caa30d6 |
| Phase 48 | バグ修正・機能強化: セットアップウィザード修正＋秘書サジェスト改善＋Drive/Calendarスコープチェック＋カレンダー予定作成intent＋Driveフォルダ作成intent（プロジェクト紐付け＋命名規則＋drive_folders登録）＋URLリンク化＋プロジェクトメンバー表示＋コンタクトプロジェクト表示＋秘書ファイルアップロード（resumable upload方式＋CORS対応サーバー検索） | mainにマージ済み |
| Phase 49 | タスクページ改善（削除・完了アーカイブ・2カラムカンバン・アイコン修正・AI会話入力改善）＋秘書チャットからタスク作成・進行（create_task/task_progress intent＋TaskFormCard/TaskProgressCard） | mainにマージ済み |
| Phase 50 | タスクファイル添付（Resumable Upload）＋ビジネスログにドキュメントURL記載＋AI構想会話の進行状況検出＋プロンプト改善＋構想→進行フェーズ移行時status自動変更＋タスク完了アーカイブに会話ログ保全 | mainにマージ済み |
| Phase 51 | データ連携強化: contact_patternsテーブル＋ContactPatternService（連絡頻度・推奨アクション）＋日次Cron compute-patterns＋メモ→種変換＋コンタクトタスク表示 | mainにマージ済み |
| Phase 52 | 組織自動レコメンド: OrgRecommendationService（ドメイン集計→未登録組織候補検出）＋auto-setup API＋OrgRecommendationCard＋ブリーフィング連携 | mainにマージ済み |
| Phase 53 | 秘書AI総合改善: secretary_conversations永続化＋コンテキスト15→30拡大＋新規intent（create_contact/search_contact/create_organization/create_project）＋インラインCRUDカード＋/api/contacts POST＋ダッシュボード初期画面＋カレンダー終日除外＋メッセージ詳細DB直接取得＋MessageDetailCard折りたたみ | mainにマージ済み |
| Phase 57 | ナレッジページ改善（個人知識地図＋自動整理）: 今週のタグクラウド＋マイナレッジパネル＋/api/nodes/this-week＋/api/nodes/my-keywords＋ビジネスイベントキーワード抽出＋統計カード解説文 | mainにマージ済み |
| Phase 58 | ジョブ再設計: 社内相談機能（consultationsテーブル＋相談→回答→AI返信生成フロー）＋ジョブ種別拡張（consult/todo追加）＋ジョブステータス拡張（consulting/draft_ready追加）＋ジョブページUI改善（相談回答パネル・フィルタ・統計）＋カレンダー/スケジュール機能バグ修正 | mainにマージ済み |
| Phase 58a | メール署名機能＋AI文体学習: 設定プロフィールにメール署名欄追加＋メール返信時に署名自動付与（Slack/CWは付与しない）＋getUserWritingStyle()による過去送信スタイルリアルタイム参照＋全AI下書き生成パスに文体学習統合 | mainにマージ済み |
| Phase 58b | 組織メンバー↔NodeMapアカウント紐づけ: contact_persons.linked_user_id追加＋/api/users（auth.admin.listUsers）＋組織詳細ページにアカウント紐づけUI＋社内相談でlinked_user_idをresponder_user_idに使用 | mainにマージ済み |
| Phase 59 | UX改善・インボックス高速化: ジョブ完了アーカイブタブ＋メモ→タスク直接変換（AI自動生成）＋インボックス受信条件改善（トークンベース取得）＋既読判定バグ修正（サーバーキャッシュ無効化＋クライアント既読保持）＋インボックス読み込み高速化（DBクエリ並列化＋差分取得バックグラウンド化＋重複既読チェック削除） | mainにマージ済み |
| Phase 61 | AI会話パーソナライズ: 全AIエンドポイントにパーソナライズコンテキスト注入（性格タイプ・応答スタイル・思考傾向・オーナー方針）＋user_thinking_tendenciesテーブル＋日次Cron分析 | mainにマージ済み |
| Phase 62 | インボックス即時実行UX: ジョブ不要の即時実行方式（返信/日程調整/Drive保存/タスク化）＋グループ=バブルクリック・メール=下部固定チップ＋日程調整にカレンダー空き時間自動注入（findFreeSlots→AI）＋Drive添付ファイル即時保存API（/api/drive/save-attachments）＋findFreeSlots過去時間フィルタ修正 | mainにマージ済み |

---

## Phase 59 実装内容（UX改善・インボックス高速化）

### 概要
ジョブ完了アーカイブ、メモ→タスク直接変換、インボックス受信条件改善、既読判定バグ修正、インボックス読み込み高速化の5つの改善を実施。

### 1. ジョブ完了アーカイブタブ

#### 変更ファイル
- `src/app/jobs/page.tsx` — ジョブページを「進行中」「完了」2タブ構成に変更。完了タブにキーワード検索＋種別フィルタ＋詳細展開表示を追加

#### 機能
- 完了ジョブ（status='done'/'failed'）を「完了」タブにアーカイブ表示
- キーワード検索（タイトル・説明・AI下書き内を検索）
- 種別フィルタ（reply/schedule/check/consult/todo/other）
- 詳細展開（完了日・送信内容・実行ログ・相談内容表示）
- 「進行中に戻す」ボタン（status='pending'に復帰）
- 個別削除ボタン

### 2. メモ→タスク直接変換（AI自動生成）

#### 変更ファイル
- `src/app/api/memos/[id]/convert/route.ts` — 種（seed）作成からタスク直接作成に変更。Claude APIでタイトル・説明・優先度を自動生成
- `src/app/memos/page.tsx` — UIを種化モーダルからタスク変換モーダルに変更。タスク種別・プロジェクト・期限日を人間が選択

#### 処理フロー
```
メモ詳細 → 「📋 タスクにする」ボタン
  → タスク種別（個人/グループ）＋プロジェクト＋期限日を選択
  → POST /api/memos/[id]/convert
    → Claude API でメモ内容＋AI会話履歴からタスク情報を自動生成
      - タイトル（30文字以内・動詞始まり）
      - 説明（3-5行・背景と具体的アクション）
      - 優先度（high/medium/low）
    → TaskService.createTask() でタスク作成
    → メモに converted_task_id を記録
  → 結果表示（タイトル・説明・優先度バッジ）
  → 「タスクを見る」リンクで /tasks へ遷移
```

### 3. インボックス受信条件改善（トークンベース取得）

#### 変更ファイル
- `src/app/api/messages/route.ts` — 購読チャネル必須からトークンベース取得に変更

#### 設計思想
- **旧**: 購読チャネル（user_channel_subscriptions）に登録がないと取得しない → 初期設定が面倒
- **新**: トークン（環境変数 or user_service_tokens）があれば**全メッセージを自動取得してDBに保存**
- **表示フィルタ**: 購読チャネル登録なし→全表示、登録あり→登録チャネルのみ表示
- つまり「接続＝即動作」。購読は任意の絞り込み機能

#### hasChannelToken() 関数
```typescript
async function hasChannelToken(serviceName: string, userId: string): Promise<boolean> {
  // 1. 環境変数チェック（EMAIL_USER / SLACK_BOT_TOKEN / CHATWORK_API_TOKEN）
  // 2. DBトークンチェック（user_service_tokens）
}
```

### 4. 既読判定バグ修正

#### 原因
- ユーザーが既読にする → DBは更新される
- 次回取得時にサーバーサイドキャッシュ（3分TTL）がヒット → **古い未読状態を返す**
- クライアントがサーバー応答で上書き → 既読が未読に戻る

#### 修正（3ファイル）
- `src/app/api/messages/read/route.ts` — 既読更新後に `cache.invalidateByPrefix('messages:')` でサーバーキャッシュ無効化
- `src/hooks/useMessages.ts` — バックグラウンド更新・強制更新時にローカルの既読状態をサーバー応答で上書きしない保護ロジック追加
- `src/app/api/messages/route.ts` — `saveMessages` をfire-and-forgetから `await` に変更（レースコンディション解消）

### 5. インボックス読み込み高速化

#### 変更ファイル
- `src/app/api/messages/route.ts` — 全面最適化

#### 高速化ポイント（3つ）

**① DBクエリ一括並列化（旧：直列7回 → 新：並列1回）**
- `getChannelCapabilities()` 関数に統合
- 購読チャネル＋トークンチェック＋同期状態3チャネル分 = 5クエリを `Promise.all` で同時実行
- 以前は購読取得→トークン3回→同期状態3回の直列7回

**② 差分取得をバックグラウンドに戻す**
- 通常ページ表示ではDBから即レスポンス（数百ms）
- Gmail/Slack/Chatwork APIへの差分取得は `fetchDiffInBackground()` としてレスポンス後に実行
- 新着はDB保存＋キャッシュ無効化 → 次回アクセスで表示
- 既読上書き問題は `saveMessages` 側のexistingReadIds チェックで解決済み

**③ 重複DB既読チェック削除**
- 差分取得モード: `loadMessages()` がDB値（正しいis_read）を返すので追加チェック不要
- 初回同期・強制更新のときだけ既読チェックを実行

#### getChannelCapabilities() の設計
```typescript
// 1回のawaitで5つのDBクエリを並列実行
const [subsResult, tokenResult, emailSync, slackSync, cwSync] = await Promise.all([
  supabase.from('user_channel_subscriptions')...,  // 購読チャネル
  supabase.from('user_service_tokens')...,          // トークン（環境変数で揃っていない場合のみ）
  supabase.from('inbox_sync_state').eq('channel', 'email')...,
  supabase.from('inbox_sync_state').eq('channel', 'slack')...,
  supabase.from('inbox_sync_state').eq('channel', 'chatwork')...,
]);
// → subscriptions + canFetch + syncStates を一括返却
```

### 重要な実装ノート
- **メモ→タスク変換のAIフォールバック**: ANTHROPIC_API_KEYなし時はメモ内容をそのままタスクタイトル・説明に使用
- **トークンベース取得**: 環境変数（EMAIL_USER等）とDBトークン（user_service_tokens）の両方をチェック。どちらかがあれば取得可能
- **差分取得バックグラウンド化の安全性**: `saveMessages` が既存の `is_read=true` を保持する（Phase 25の既存ロジック）ため、バックグラウンド保存で既読が上書きされることはない
- **サーバーキャッシュ無効化のタイミング**: 既読API（/api/messages/read）と差分取得バックグラウンド（fetchDiffInBackground）の両方でキャッシュを無効化

---

## Phase 58/58a/58b 実装内容（ジョブ再設計・署名・文体学習・アカウント紐づけ）

### Phase 58: ジョブ再設計・社内相談

#### 概要
ジョブ機能を再設計し、社内相談（consult）とToDoの種別を追加。社内相談はメッセージを読んで社内メンバーに相談→回答を受けてAIが返信文面を自動生成する一連のフローを実装。

#### DBマイグレーション（Supabase実行済み）
```sql
-- consultations テーブル（Supabase上で直接作成）
CREATE TABLE consultations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL,
  responder_user_id TEXT NOT NULL,
  responder_contact_id TEXT,
  source_message_id TEXT,
  source_channel TEXT,
  thread_summary TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 060_jobs_ai_draft_column.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_draft TEXT;
```

#### 新規ファイル
- `src/app/api/consultations/route.ts` — 社内相談API（GET: 相談一覧、POST: 回答＋AI返信文面自動生成）
- `supabase/migrations/060_jobs_ai_draft_column.sql` — jobs.ai_draftカラム追加

#### 変更ファイル
- `src/app/api/jobs/route.ts` — consult/todo種別対応、consulting/draft_readyステータス追加、相談作成時にconsultationsテーブル登録
- `src/app/jobs/page.tsx` — 社内相談回答パネル（あなた宛ての相談バナー＋回答入力）、consult/todoフィルタ、consulting/draft_readyステータス表示
- `src/components/inbox/MessageDetail.tsx` — 社内相談フォーム（自社組織メンバーのプルダウン選択＋相談内容入力）
- `src/app/api/agent/chat/route.ts` — consultations intent追加（秘書ブリーフィングに未回答相談数表示）
- `src/components/secretary/ChatCards.tsx` — ConsultationCard追加（相談内容表示＋回答入力＋AI下書きプレビュー）
- `src/components/secretary/SecretaryChat.tsx` — 相談関連アクション追加

### Phase 58a: メール署名 + AI文体学習

#### 概要
メール返信時に署名を自動付与する機能と、過去の送信メッセージからユーザーの文体を学習してAI生成文面に反映する機能を実装。

#### メール署名
- `src/app/settings/page.tsx` — プロフィールタブにメール署名テキストエリア追加
- `src/app/api/settings/profile/route.ts` — `emailSignature` フィールド追加（user_metadata.email_signature に保存）
- `src/lib/serverAuth.ts` — `getServerUserEmailSignature()` 関数追加
- **ルール**: メール → 署名自動付与 / Slack・Chatwork → 署名なし＋末尾に名前を書かない

#### AI文体学習（getUserWritingStyle）
```typescript
// src/services/ai/aiClient.service.ts
export async function getUserWritingStyle(userId: string, channel?: string): Promise<string>
// - inbox_messages から direction='sent' の送信メッセージを最大10件取得
// - チャネル指定時はそのチャネルのみフィルタ
// - 5件以上使えるメッセージがあればスタイルサンプルとしてプロンプトに注入
// - 「ユーザーの過去の送信スタイルに合わせた文体で書くこと（最重要）」指示付き
```

#### 文体学習の適用箇所（全AI下書き生成パス）
- `src/app/api/ai/draft-reply/route.ts` — 返信下書き生成
- `src/app/api/agent/chat/route.ts` — 秘書チャットからのジョブ作成
- `src/app/api/ai/structure-job/route.ts` — スケジュール系ジョブのAI下書き
- `src/app/api/consultations/route.ts` — 社内相談回答後のAI返信生成

### Phase 58b: 組織メンバー↔NodeMapアカウント紐づけ

#### 概要
組織メンバー（contact_persons）にNodeMapのユーザーアカウント（Supabase auth UID）を紐づけることで、社内相談が相手の秘書ブリーフィングに正しく表示されるようにする。

#### DBマイグレーション（Supabase実行済み）
```sql
-- 061_contact_linked_user_id.sql
ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS linked_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_contact_persons_linked_user_id ON contact_persons(linked_user_id);
```

#### 新規ファイル
- `supabase/migrations/061_contact_linked_user_id.sql` — linked_user_idカラム追加
- `src/app/api/users/route.ts` — NodeMapユーザー一覧API（auth.admin.listUsers()使用）

#### 変更ファイル
- `src/app/api/organizations/[id]/members/route.ts` — linked_user_id をSELECTに追加、PATCHハンドラー追加（紐づけ更新）
- `src/app/organizations/[id]/page.tsx` — メンバー一覧にNodeMapアカウント紐づけドロップダウン追加（自社組織のみ表示）
- `src/app/api/jobs/route.ts` — 相談作成時に linked_user_id を responder_user_id として使用
- `src/components/inbox/MessageDetail.tsx` — 相談メンバー選択でlinked_user_id紐づけ済みのみ選択可、未紐づけはグレーアウト表示

---

## Phase 57 実装内容（ナレッジページ改善）

### 概要
ナレッジページ（/master）を「管理用CRUDページ」から「個人の知識地図」に改善。タスク・メッセージ・ビジネスイベントから自動抽出されたキーワードを、今週のタグクラウド＋カテゴリ別マイナレッジとして表示。蓄積は全ユーザー共有、表示は個人フィルタ。

### 設計思想
- **蓄積は共有**: `knowledge_master_entries` は全ユーザー共通。同じキーワードは1レコード
- **表示は個人**: `thought_task_nodes.user_id` でフィルタし、個人の知識地図として表示
- **構造化は半自動**: キーワード50個超で週次AIクラスタリング提案 → 秘書から承認するだけ

### 新規ファイル
- `src/app/api/nodes/this-week/route.ts` — 今週のキーワードAPI（月曜起算、frequency・category・color付き）
- `src/app/api/nodes/my-keywords/route.ts` — マイナレッジAPI（period=week/month/all、domain/field階層集計）
- `src/components/master/ThisWeekTagCloud.tsx` — 今週のタグクラウドUI（頻度ベースフォントサイズ、クリックで詳細表示）
- `src/components/master/MyKnowledgePanel.tsx` — マイナレッジパネルUI（ドメイン別折りたたみツリー、NodeChipにタスク/メッセージバッジ）
- `supabase/migrations/058_business_events_keywords.sql` — business_events.keywords_extracted追加

### APIエンドポイント
```
GET /api/nodes/this-week
→ { weekStart, weekEnd, nodes: [{id, label, frequency, relatedTaskIds, relatedSeedIds, category, color}] }

GET /api/nodes/my-keywords?period=week|month|all
→ { nodes: [{id, label, domainId, domainName, domainColor, fieldId, fieldName, relatedTaskCount, relatedMessageCount}], domainStats: [{domainId, domainName, domainColor, nodeCount, fields}], totalNodes, period }
```

---

## Phase 53 実装内容（秘書AI総合改善）

### 概要
秘書AIを「自然会話で全操作が完結する」主要インターフェースに強化。会話永続化・コンテキスト拡張・CRUD操作のインライン化・UI改善を実施。

### 新規ファイル
- `supabase/migrations/042_secretary_conversations.sql` — 秘書チャット会話永続化テーブル
- `src/app/api/agent/conversations/route.ts` — 会話保存/読込/クリアAPI（GET/POST/DELETE）
- `src/services/analytics/contactPattern.service.ts` — Phase 51: コンタクトパターン分析サービス
- `src/services/analytics/orgRecommendation.service.ts` — Phase 52: 組織自動レコメンドサービス
- `src/app/api/cron/compute-patterns/route.ts` — Phase 51: パターン計算日次Cron
- `src/app/api/organizations/auto-setup/route.ts` — Phase 52: 組織候補取得＋ワンクリック作成API

### 秘書ダッシュボード（初期画面）
```
/agent ページ読込時
  → ダッシュボード表示（自動ブリーフィングしない）
  → メインアクション4つ（大きめカード: 今日やること/プロジェクト確認/タスク作成/タスク進める）
  → その他アクション（小チップ: メッセージ/ジョブ/予定/ファイル/ナレッジ等）
  → ユーザーがチップ選択 or 自由入力で会話開始
```

---

## Phase 52 実装内容（組織自動レコメンド）

### 概要
メッセージ履歴のメールドメインを集計し、未登録の組織候補を自動検出。秘書ブリーフィングまたは「組織を整理」で候補を表示し、ワンクリックで組織セットアップ。

### 新規ファイル
- `src/services/analytics/orgRecommendation.service.ts` — ドメイン集計→未登録組織候補検出→候補スコアリング
- `src/app/api/organizations/auto-setup/route.ts` — GET: 候補一覧、POST: ワンクリック組織作成（organizations + organization_channels + コンタクト紐づけ）

---

## Phase 51 実装内容（データ連携強化）

### 概要
使うほど賢くなるシステムの基盤。コンタクトパターン分析（連絡頻度・推奨アクション）、メモ→種変換、コンタクト関連タスク表示。

### 新規ファイル
- `src/services/analytics/contactPattern.service.ts` — パターン計算（メッセージ頻度・最終連絡・推奨アクション生成）
- `src/app/api/cron/compute-patterns/route.ts` — 日次Cron（毎日3:00）
- `src/app/api/contacts/[id]/tasks/route.ts` — コンタクト関連タスク取得
- `src/app/api/memos/[id]/convert/route.ts` — メモ→種変換API

---

## Phase 50 実装内容（タスクファイル添付・AI構想会話改善）

### 概要
タスク詳細画面からファイルをアップロードしてプロジェクトのGoogleDriveフォルダに格納する機能を追加。タスク完了時のビジネスログアーカイブにドキュメントURLも記載。また、AI構想会話の品質向上（進行状況検出・プロンプト改善）とフェーズ遷移時のステータス自動変更を実装。

### 新規ファイル
- `supabase/migrations/040_task_file_linking.sql` — drive_documentsにtask_idカラム追加
- `src/app/api/tasks/[id]/files/route.ts` — タスクファイル一覧(GET) + 切り離し(PATCH)
- `src/components/tasks/TaskFileUploadPanel.tsx` — タスク用コンパクトファイルアップロードUI（Resumable Upload方式）

### AI構想会話の改善
- **進行状況検出**: 会話履歴からキーワードマッチで議論済み項目（ゴール/内容/気になる点/期限）を自動検出
- **プロンプト注入**: 「会話の進行状況」セクションをシステムプロンプトに動的追加。既に議論した項目を繰り返さない指示
- **プログレスバーUI**: 4項目の達成状況を視覚的に表示。全項目完了で「進行フェーズへ」ボタン表示
- **フェーズ遷移時status変更**: 構想→進行フェーズ移行時にstatus='in_progress'を自動設定（カンバンの「進行中」列に移動）

---

## Phase 49 実装内容（タスクページ改善・秘書タスク連携）

### 概要
タスクページのUX改善（削除機能・完了アーカイブ・カンバン2カラム化・アイコン修正・AI会話入力欄改善）と、秘書チャットからのタスク作成・進行機能を実装。

### タスクページ改善

**タスク削除機能**:
- `TaskService.deleteTask()` メソッド追加（FK CASCADE で関連データも削除）
- `DELETE /api/tasks` エンドポイント追加
- TaskDetail に削除ボタン＋確認モーダル

**完了時アーカイブ**:
- `TaskService.archiveTaskToBusinessLog()` メソッド追加（business_eventsに記録）
- タスク完了（status='done'）時にビジネスログへアーカイブ → タスク削除
- カンバンから「完了」列を除去（2カラム: todo / in_progress）

**アイコン修正**:
- `TASK_PHASE_CONFIG` アイコン: SVGパス → 絵文字（💡構想 / 🔧進行 / 📊結果）
- `IDEATION_MEMO_FIELDS` アイコン: SVGパス → 絵文字（🎯ゴール / 📝内容 / ⚠️懸念 / 📅期限）

**AI会話入力欄改善（TaskAiChat.tsx）**:
- Enter送信を無効化 → 送信ボタンのみで送信（IME変換確定の誤送信防止）
- テキストエリア自動リサイズ（scrollHeight連動、最大160px）

---

## Phase 48 実装内容（バグ修正・機能強化・ファイルアップロード）

### 概要
複数のバグ修正と機能強化を実施。セットアップウィザード修正、秘書チャットの各種intent追加（カレンダー予定作成・Driveフォルダ作成・プロジェクト一覧）、URLリンク化、プロジェクトメンバー表示、秘書チャットからのファイルアップロード機能を実装。

### 主な変更点

**新規intent追加（agent/chat/route.ts）**:
- `projects`: プロジェクト一覧表示（「プロジェクト一覧」「プロジェクトを確認」）
- `create_calendar_event`: カレンダー予定作成（「予定+追加/登録/入れて」）。Claude APIで自然言語から日時パース
- `create_drive_folder`: Driveフォルダ作成（「フォルダ/ドライブ+作成/追加」）。プロジェクト自動検出、`[NodeMap] 組織名 / プロジェクト名` 命名、`drive_folders`登録、共有リンク設定

**URLリンク化（SecretaryChat.tsx）**:
- `linkifyText()` 関数: Markdown形式 `[text](url)` と 生URL の両方に対応
- 末尾の日本語記号（。、）等）を除去して正しいURLを生成

**秘書ファイルアップロード（Resumable Upload方式）**:
- 📎ボタンからアップロードパネルを開く
- ドラッグ&ドロップ or クリックでファイル選択
- プロジェクト / 書類種別（提案書・見積書・契約書 etc.）/ 方向（提出・受領）/ メモ
- 命名規則: `YYYY-MM-DD_種別_元ファイル名.拡張子`

---

## Phase 47 実装内容（ナレッジ自動構造化）

### 概要
蓄積されたキーワード（knowledge_master_entries）をAIが週次でクラスタリングし、領域/分野の構造を自動提案。秘書チャットまたは/masterページから承認/却下するフロー。手動での領域/分野設定を不要にする。

### 処理フロー
```
【蓄積（既存）】
AI会話/メッセージCron/ビジネスイベント → extractKeywords() → knowledge_master_entries (is_confirmed=false)

【週次クラスタリング（新規）】
Cron cluster-knowledge-weekly（毎週月曜2:30）
  → 未確認キーワード50個以上のユーザー対象
  → Claude Sonnetでキーワード群を意味的クラスタリング
  → knowledge_clustering_proposals に提案保存

【秘書から確認（新規）】
ブリーフィング or 「ナレッジ提案を見せて」
  → KnowledgeProposalCard表示（ツリー構造＋信頼度＋AI説明）
  → 承認 → 領域/分野自動作成 + キーワードconfirmed
  → 却下 → 次回再提案
```

---

## Phase 46 実装内容（ビジネスログ + ナレッジ ページ改善）

### 概要
/business-log と /master の2ページを実用レベルに改善。ビジネスログはpage.tsxを750行から250行に分割し、AI自動イベント区別・フィルタ・ダッシュボードを追加。ナレッジはCRUD UI・未確認ノード管理・キーワード詳細パネルを追加。

### ビジネスログ改善

**コンポーネント分割**:
- `src/components/business-log/types.ts` — 共有型定義・定数・ユーティリティ・EventFilter型
- `src/components/business-log/ProjectSidebar.tsx` — プロジェクトサイドバー（一覧・作成フォーム）
- `src/components/business-log/EventTimeline.tsx` — イベントタイムライン（フィルタ・AI区別・週間要約カード）
- `src/components/business-log/EventForm.tsx` — イベント作成フォーム（種別・参加者・議事録・意思決定ログ）
- `src/components/business-log/EventDetail.tsx` — イベント詳細パネル（編集・削除・AI生成表示・コンタクト・ソース）
- `src/components/business-log/ChannelPanel.tsx` — チャネル設定・メッセージ一覧・ドキュメント一覧
- `src/components/business-log/Dashboard.tsx` — 全体ダッシュボード（統計カード・週間要約・プロジェクト別アクティビティ・直近イベント）

**新機能**:
- AI自動生成イベント（ai_generated=true）にBotラベル表示
- AI週間要約（summary_period付きイベント）を折りたたみサマリーカードで表示
- イベント種別・日付範囲・AI生成のみフィルタ
- プロジェクト未選択時に全プロジェクト横断の全体ダッシュボード表示

---

## Phase 45a-45c 実装内容（マルチチャネル・URL・格納指示・ビジネスログ自動蓄積）

### 概要
Drive連携を全チャネル（Email/Slack/Chatwork）に拡張し、本文中のGoogle Docs/Sheets/Drive URLも自動検出・記録。秘書から「このURLを格納して」と指示できるフロー。ビジネスイベントをメッセージ・ドキュメント・会議から自動蓄積し、AI週間要約を自動生成。

### Phase 45a: URL検出 + 全チャネル対応
- `drive_documents` に `link_type TEXT` / `link_url TEXT` カラム追加
- `drive_file_staging` に `source_channel TEXT DEFAULT 'email'` 追加
- URL検出パターン: Google Sheets, Google Docs, Google Drive open, Google Drive file

### Phase 45b: 秘書ファイル格納指示
- `src/app/api/drive/store-file/route.ts` — URLを受け取り → リンク情報抽出 → drive_documents登録
- `store_file` intent追加（キーワード: 格納/保存+ドライブ/フォルダ、入れて+フォルダ/ドライブ）
- StorageConfirmationCard コンポーネント追加（組織/プロジェクト選択、書類種別、方向、年月ピッカー、格納ボタン）

### Phase 45c: ビジネスイベント自動蓄積 + AI週間要約
- `src/app/api/cron/sync-business-events/route.ts` — 日次Cron。過去24時間のinbox_messagesからビジネスイベント自動生成（source_message_idで重複防止）
- `src/app/api/cron/summarize-business-log/route.ts` — 週次Cron（毎週月曜）。プロジェクトごとに過去1週間のイベントをClaude APIで要約
- `business_summary` intent追加（活動+要約/まとめ/サマリー、週間+レポート/報告、プロジェクト+状況/進捗）

---

## Drive実運用対応（Phase 44a-44d）実装内容

### 概要
Google Drive連携を実運用に耐える形に拡張。受領/提出の区別、月別フォルダ、AI自動分類、秘書確認フロー、一括承認を実装。

**フォルダ構造**:
```
[NodeMap] A社/
  プロジェクトX/
    受領/
      2026-03/
        2026-03-01_見積書_original-filename.pdf
    提出/
      2026-03/
        2026-03-01_発注書_purchase-order.pdf
```

### AI分類の仕様
- ファイル名 + メール文脈（件名/本文/送信者）のみで判定（PDF中身は読まない: 軽量設計）
- 書類種別: 見積書/契約書/請求書/発注書/納品書/仕様書/議事録/報告書/提案書/企画書/その他
- 方向: received/submitted（メールのdirectionから自動判定）
- リネーム候補: `YYYY-MM-DD_種別_元ファイル名.拡張子`
- 信頼度(confidence): 0.0-1.0（AI判定結果に付与）
- Claude API使用不可時はキーワードベースのフォールバック分類

### ファイル取り込みフロー
```
【メール受信→自動取り込み】
Cron sync-drive-documents（毎日23:00）
  → drive_synced=false のメッセージ取得
  → 添付ファイルDL → [NodeMap]一時保管フォルダにアップロード
  → fileClassification.service.ts でAI分類（ファイル名+メール文脈）
  → drive_file_staging に登録（status=pending_review）

【秘書AI確認フロー】
ブリーフィング or「届いたファイル確認して」
  → file_intake カード表示（AI分類結果プレビュー）
  → ユーザーが確認・編集（書類種別/方向/年月）
  → 承認 → 4階層フォルダ作成+リネーム移動+drive_documents登録
  → 却下 → 一時ファイル削除

【クリーンアップ】
Cron clean-drive-staging（毎日0:30）
  → 14日放置 → expired
  → 30日超 rejected/expired → Driveファイル削除+DB削除
```

---

## Google Drive連携 実装内容

### 概要
メッセージの添付ファイルを組織→プロジェクトの2階層Google Driveフォルダに自動保存。秘書AIからドキュメント閲覧・検索・共有リンク生成が可能。

### 新規ファイル
- `supabase/migrations/033_google_drive_integration.sql` — DBスキーマ
- `src/services/drive/driveClient.service.ts` — Google Drive APIラッパー（フォルダ/ファイルCRUD・共有・Gmail添付ダウンロード）
- `src/app/api/drive/folders/route.ts` — フォルダ管理API
- `src/app/api/drive/documents/route.ts` — ドキュメントCRUD API
- `src/app/api/drive/documents/[id]/route.ts` — ドキュメント詳細API
- `src/app/api/drive/documents/[id]/share/route.ts` — 共有リンク生成/メール共有API
- `src/app/api/drive/search/route.ts` — ドキュメント検索API
- `src/app/api/cron/sync-drive-documents/route.ts` — 添付ファイル自動同期Cronジョブ

### 重要な実装ノート
- **drive.fileスコープ**: アプリが作成・開いたファイルのみ管理可能（安全）
- **トークン再利用**: Gmail/Calendar/Driveは同じOAuthトークン（service_name='gmail'）
- **Cronバッチ**: Gmail添付のみ対応（Slack/Chatworkは将来対応）。組織/プロジェクトはfrom_addressからコンタクト→組織→プロジェクトを自動推定
- **GCP設定が必要**: Google Drive APIの有効化 + OAuth同意画面にdrive.fileスコープ追加

---

## Calendar×タスク/ジョブ統合 実装内容

### 概要
タスク/ジョブの作成・更新・完了時にGoogleカレンダーと自動同期。空き時間検索もNodeMap内の作業ブロックを考慮するよう拡張。グループタスクのメンバー管理基盤を新設。

### カレンダー同期フロー
```
【タスク/ジョブ作成時】
scheduledStart + scheduledEnd あり
  → syncTaskToCalendar() / syncJobToCalendar()
    → Google Calendar API POST（extendedProperties.private に nodeMapType/nodeMapId）
    → calendar_event_id をDB保存
    → グループタスク: task_members全員にも予定作成

【タスク/ジョブ更新時】
スケジュール変更 → Google Calendar PATCH で更新
status='done' → Google Calendar DELETE で削除

【空き時間検索】
findFreeSlots()
  → Google Calendar events 取得
  → NodeMap tasks/jobs の scheduled_start/end を取得
  → calendar_event_id 設定済みは除外（二重カウント防止）
  → 全busyスロットを統合して空き時間計算
```

### 重要な実装ノート
- **extendedProperties**: Google Calendar API の extendedProperties.private に `nodeMapType`（task/job）と `nodeMapId`（UUID）を埋め込み
- **二重カウント防止**: NodeMap で calendar_event_id が設定済み = 既にGoogleカレンダーに登録済みなので、findFreeSlots では除外
- **トークン再利用**: calendarSync.service.ts は user_service_tokens の gmail トークンを直接使用
- **エラー許容**: カレンダー同期の失敗はログのみで、タスク/ジョブの作成・更新処理には影響しない

---

## 秘書ファースト実装内容（Phase A〜C + B拡張 + Calendar + ブリーフィング強化）

### 概要
NodeMapのメイン画面を秘書AIチャット中心に再設計。「秘書に話しかけるだけで全機能にアクセスできる」UIを実現。

### アーキテクチャ
```
ユーザー → SecretaryChat.tsx（チャットUI）
  → POST /api/agent/chat（意図分類 + データ取得 + カード生成 + AI応答）
    → classifyIntent()（キーワードベース高速分類）
    → fetchDataAndBuildCards()（Supabase + Calendar API）
    → Claude API（コンテキスト付き応答生成）
  ← { reply: string, cards: CardData[] }
  → ChatCards.tsx（カードレンダリング）
  → handleCardAction()（カード内アクション実行）
```

### ジョブ自律実行フロー（Phase B拡張）
```
秘書チャット「○○さんに返信しておいて」
  → classifyIntent → create_job
  → handleCreateJobIntent()
    → 対象メッセージ特定（名前マッチ or 直近未読）
    → ジョブ種別判定（reply/schedule/check）
    → AI下書き生成（コンタクト情報＋過去やり取り反映）
    → DBにジョブ登録（status=pending）
    → job_approval カード返却
  → ユーザーが承認（インライン編集可）
  → POST /api/jobs/[id]/execute
    → Email/Slack/Chatwork 自動送信
    → 送信メッセージDB保存
    → 元メッセージstatus更新
    → schedule タイプ: Google Calendar 予定作成
  → action_result カード（成功/失敗）
```

---

## Phase 42h 実装内容（比較モード + リプレイモード）

### 概要
思考マップに2つの新モードを追加:
1. **比較モード**: 2人のユーザーのタスクの思考動線を重ねて表示。共有ノード（両者が通った知識）と分岐点（認識のズレ）を可視化。
2. **リプレイモード**: 完了済みタスクの思考を再現し、過去の意思決定についてAIに質問できるチャットUI。

### APIエンドポイント
```
GET /api/nodes/thought-map/compare?userAId=xxx&taskAId=yyy&userBId=xxx&taskBId=zzz
→ { success: true, data: { userA: { nodes, edges, taskTitle }, userB: { nodes, edges, taskTitle }, sharedNodeIds, divergencePoints } }

POST /api/thought-map/replay
body: { taskId, message, conversationHistory }
→ { success: true, data: { reply: string } }
```

---

## Phase 42e 実装内容（スナップショット: 出口想定・着地点）

### 概要
タスク作成時（initial_goal）とタスク完了時（final_landing）にスナップショットを自動記録し、「最初に何を目指していたか」と「最終的にどこに着地したか」の比較を可能にする。思考マップUIにスナップショット比較パネルを追加。

### 処理フロー
```
【initial_goal 記録】
confirmSeed() → タスク作成完了
  → ThoughtNodeService.getLinkedNodes({ seedId }) で種のノード取得
  → captureSnapshot({ taskId, snapshotType: 'initial_goal', summary: goal+content, seedId })

【final_landing 記録】
updateTask(status='done') → DB更新完了
  → ThoughtNodeService.getLinkedNodes({ taskId }) で現在のノード取得
  → getSnapshots() で初期ゴールを取得
  → captureSnapshot({ taskId, snapshotType: 'final_landing', summary: 比較サマリー })
```

---

## Phase 42f残り 実装内容（会話ジャンプ + 飛地→種化ボタン）

### 概要
思考マップのノードをクリックした際に「元の会話を見る」「このキーワードを種にする」の2つのアクションを追加。
また、会話ターンIDの追跡基盤（turn_id）を整備し、ノード→会話の紐づけを可能にした。

### 処理フロー
```
【会話ジャンプ】
ノードクリック → サイドパネル「会話を見る」ボタン
  → ConversationModal が /api/conversations?turnId=xxx で取得
  → 該当ターンの前後の会話を表示、キーワードをハイライト
  → turnId がない場合は createdAt で時刻フォールバック検索

【飛地→種化】
ノードクリック → サイドパネル「種にする」ボタン
  → 種作成確認モーダル表示
  → POST /api/seeds でノードラベル+元フェーズ情報を含む種を作成
```

---

## Phase 42a 実装内容（思考マップ基盤: ノード自動抽出）

### 概要
DESIGN_THOUGHT_MAP.md のPhase 42aに対応。種・タスクのAI会話で使われたキーワードを自動抽出し、ナレッジマスタ（knowledge_master_entries）に登録、thought_task_nodes でタスク/種との紐づけを記録する。

### 処理フロー
```
ユーザーがAI会話 → seeds/chat or tasks/chat API
  → AI応答生成＋DB保存（既存）
  → await ThoughtNodeService.extractAndLink()（同期実行 ※Vercel対応）
    → extractKeywords()（Claude sonnetによるキーワード抽出）
    → ensureMasterEntry()（ナレッジマスタに存在チェック→新規作成、id手動生成）
    → linkToTaskOrSeed()（SELECT→INSERT方式で重複防止）
    → createThoughtEdges()（Phase 42d: ノード間の思考動線を記録）
```

---

## Phase 42d+42f 実装内容（思考動線記録 + 思考マップUI「地形ビュー」）

### 概要
Phase 42d: AI会話でノードが出現するたびに、前のノードとの間に「思考の流れ」（thought_edges）を自動記録する。
Phase 42f: 思考マップの可視化UIページ。力学シミュレーションによる空間配置＋パン＆ズーム＋タイムスライダー。

### 思考マップの核心概念

**「個人の知識の全体地図」が基本**: 思考マップが表示するのは、1つのタスクの思考だけでなく、そのユーザーの全タスク・全種にわたるナレッジノードの全体像。同じキーワード（ノード）が複数のタスクで使われていればそれは1つのノードとして統合される。これがその人の「知識の地形」を形作る。

**2つの閲覧モード**:
- **全体マップ（Overview）**: ユーザーの全ノードが1つのマップに表示される。ノードが大きいほど多くのタスク/種で使われている（＝その人の中心的な知識）。右側パネルでタスクを選択すると、そのタスクに関連するノードがハイライトされる。
- **個別トレース（Trace）**: 特定のタスク/種を選んで、その中での思考の流れ（エッジの順序）を追う。種からタスクへの一連の流れを統合表示する。

**フェーズのライフサイクル**: ノードの出現フェーズは以下の4段階で管理する。
- **種（seed）**: 種のAI会話で生まれたノード。曖昧なアイデアの段階。
- **構想（ideation）**: タスク化後、まだ実行に入っていない段階。
- **進行（progress）**: タスクが進行中の段階。
- **結果（result）**: タスクが完了した段階。

### Canvas描画の主要機能
- **力学シミュレーション**: ノード反発力 + エッジ引力 + フェーズ別アンカー（外部ライブラリなし）
- **パン＆ズーム**: マウスドラッグでパン、ホイールでズーム（0.3〜3.0倍）
- **タイムスライダー**: ノードが出現順に徐々に現れる（フェーズラベル連動: 種→構想→進行→結果→全体）
- **ノードスタイル**: メインルート=アンバーグロー、飛地=ピンク破線、通常=フェーズ別カラー
- **エッジ描画**: ベジェ曲線 + 方向矢印ヘッド、メインルート=太い線、飛地=破線
- **インタラクション**: ホバーでツールチップ、クリックでサイドパネル詳細
- **DPR対応**: devicePixelRatio でCanvas解像度を調整、リサイズ対応
- **全体マップモード**: ノードサイズが relatedTaskCount に比例（多くのタスクで使われる知識ほど大きい）

---

## Phase 41 実装内容（種→タスク強化・AI伴走支援）

### バグ修正
- **種ボックス保存不可（致命的）**: `TaskService` 全メソッドが `getSupabase()`（anon key）を使用していたため RLS で INSERT/SELECT 失敗 → `getServerSupabase() || getSupabase()` に統一
- **種一覧が空になる**: `getSeeds()` の `.select('*, projects(name)')` が `project_id` カラム未追加時に JOIN エラー → フォールバック（JOINなし再試行）を追加
- **種→タスク変換失敗**: `confirmSeed` に `user_id` が渡されていない → confirm API ルートから userId を渡すよう修正
- **seed_conversations のRLS**: `getSupabase()` → `getServerSupabase()` に修正

### AI構造化タスク変換
- `confirmSeed` を全面改修: 種の内容＋AI会話履歴を Claude API に渡して構造化情報（タイトル・ゴール・内容・懸念・期限・メモ・優先度）を自動生成
- `convert` API も `confirmSeed` 経由に統一（AI構造化が両ルートで動作）
- 種の会話履歴（`seed_conversations`）→ タスクの会話履歴（`task_conversations`）に引き継ぎ
- `due_date` カラムにAI推定の期限を保存

### AI会話の伴走支援化（aiClient.service.ts）
- システムプロンプトを「伴走パートナー」に改定（構想・進行・結果の各フェーズ）
- 種から生まれたタスクは構想メモ＋種の経緯をコンテキストに含める
- モデルを `claude-sonnet-4-5-20250929` に統一（コスト最適化）

---

## Phase 40c 実装内容（組織-プロジェクト-チャネル階層）

### 組織→プロジェクト紐づけ
- `projects` テーブルに `organization_id UUID` カラム追加
- `/api/projects` GET: `organizations(name)` を JOIN して取得
- `/api/projects` POST: `organizationId` で組織紐づけ
- `/api/projects` PUT: 新規追加（プロジェクト更新）
- ビジネスログ画面: プロジェクト作成時に組織を選択可能

### プロジェクト→チャネル紐づけ
- `project_channels` テーブル新設
- `/api/projects/[id]/channels` GET/POST/DELETE
- `/api/projects/[id]/messages` GET: 紐づけチャネルの inbox_messages を取得
- ビジネスログ画面: チャネル設定パネル、チャネルメッセージタブ

### 種のプロジェクト自動検出
- インボックスから種化する際、チャネル情報（slackChannel/chatworkRoomId）で `project_channels` を検索
- 1件マッチ → 自動紐づけ、複数マッチ → モーダルで選択
- `/api/seeds` POST: `detectProjectFromChannel()` 関数で自動検出
- `/api/seeds` PUT: `projectId` のみの部分更新をサポート

---

## Phase 61 実装内容（AI会話パーソナライズ）

### 概要
全AIエンドポイントにユーザー個別のパーソナライズコンテキストを注入。①プロフィール（性格タイプ・応答スタイル）、②社内相談結果、③思考傾向分析＋オーナー方針の3つを統合。

### パーソナライズ注入の仕組み
```
buildPersonalizedContext(userId)
  → 1. プロフィール: auth.admin.getUserById → personality_type / ai_response_style
  → 2. 思考傾向: user_thinking_tendencies → tendency_summary（最新1件）
  → 3. オーナー方針: ENV_TOKEN_OWNER_ID != userId → owner_policy_text 注入
  → 返り値: "## パーソナライズコンテキスト..." テキスト（空なら空文字列）
```

### 注入対象エンドポイント（10箇所）
| エンドポイント | 注入方式 |
|---|---|
| generateReplyDraft | userId→systemPrompt末尾 |
| generateTaskChat | TaskChatContext.personalizedContext→systemPrompt末尾 |
| /api/tasks/chat | chatContext + 相談コンテキスト② |
| /api/agent/chat | buildSystemPrompt第4引数 |
| /api/seeds/chat | systemPrompt末尾 |
| /api/consultations | system末尾 |
| /api/ai/structure-job | schedule handler system末尾 |
| /api/memos/[id]/convert | system末尾 |
| /api/thought-map/replay | systemPrompt末尾 |
| /api/cron/analyze-thinking-tendency | 分析実行（注入元データ生成） |

---

## Phase 62 実装内容（インボックス即時実行UX・カレンダー日程調整・Drive添付保存）

### 概要
インボックスのアクションをジョブ（非同期）から即時実行（同期）に全面転換。日程調整の返信にGoogleカレンダーの空き時間を実データで注入。Drive保存ボタンでメッセージ添付ファイルを実際にDriveステージングに保存。

### 設計思想
- **即時実行化**: 返信・日程調整・Drive保存・タスク化は全てその場で完了する。ジョブ（後回し）にする必要がない
- **UXの分岐**: グループチャット（Slack/CW）= バブルクリックでアクション表示、メール/単発メッセージ = 下部固定チップ
- **社内相談のみジョブ維持**: 相談→回答→AI返信の非同期フローはジョブとして残す

### MessageInlineActions（即時実行アクションチップ）
```
function MessageInlineActions({ message, onReply, onScheduleReply, compact })
  → 💬 返信: onReply() → ReplyForm表示（通常AI下書き）
  → 📅 日程調整: onScheduleReply() → ReplyForm表示（scheduleMode=true → カレンダー空き時間注入）
  → 💬 相談: ジョブ作成（type='consult'、社内相談は非同期のまま）
  → 📁 Drive: saveToDrive() → POST /api/drive/save-attachments（添付ファイル即時保存）
  → ✅ タスク: createTask() → POST /api/ai/structure-task → POST /api/tasks（即時タスク作成）
```

### 日程調整の返信フロー
```
「📅 日程調整」ボタンクリック
  → scheduleMode=true + draftHint設定
  → ReplyForm表示（autoAiDraft=true）
  → POST /api/ai/draft-reply { scheduleMode: true }
    → isCalendarConnected() チェック
    → findFreeSlots(userId, now, now+7日, 30分)
      → 今日の過去時間はスキップ（nowMs以降のみ）
      → 営業時間終了日はスキップ
    → formatFreeSlotsForContext(freeSlots, 20)
    → AIプロンプトに全空き時間を注入
      「各日の空き時間をすべて候補として提示すること」
      「1日1枠ではなく、空いている時間帯をそのまま書く」
    → Claude API で返信文面生成
  → ReplyFormに下書き表示（編集→送信）
```

### Drive添付保存フロー
```
「📁 Drive」ボタンクリック
  → POST /api/drive/save-attachments { messageId }
    → isDriveConnected() チェック
    → inbox_messages からメッセージ取得
    → チャネル判定（email/slack/chatwork）
    → チャネル別にファイルダウンロード:
      - Email: getGmailAttachments() → downloadGmailAttachment()
      - Slack: metadata.files → downloadSlackFile()
      - Chatwork: metadata.file_info → downloadChatworkFile()
    → 組織/プロジェクト自動推定（from_address→コンタクト→組織 or チャネル→project_channels）
    → processSingleAttachment():
      1. 一時フォルダにアップロード（uploadFile）
      2. AI分類（classifyFile: 書類種別/方向/年月/リネーム候補）
      3. ステージング登録（saveStagingFile）
    → drive_synced=true に更新
  → 秘書の「届いたファイル確認」で承認→最終フォルダに配置
```

---

## 終わりに

このアーカイブは NodeMap プロジェクトの全フェーズ実装記録を網羅しています。
新しい機能開発時は、関連する過去フェーズを参照して設計思想を理解することを推奨します。
