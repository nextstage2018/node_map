# NodeMap 機能仕様書

最終更新: 2026-03-06

> 全機能の現行仕様。各セクションは「概要 → データフロー → ルール → テストチェックリスト」で構成。

---

## 1. カレンダー（CALENDAR）

### 概要
Google Calendar を統合し、タスク・ジョブのスケジューリング、空き時間検索、日程調整返信を実現。OAuth で Gmail/Calendar/Drive スコープを統一取得し、タスク/ジョブ作成時に自動同期。

### データフロー
```
OAuth (gmail service name)
  → Google Calendar API + Google Drive API スコープ共有
    → token_data 保存（access_token + refresh_token）

タスク/ジョブ スケジュール設定
  → scheduled_start / scheduled_end あり
    → syncTaskToCalendar / syncJobToCalendar
      → Google Calendar API POST
        → calendar_event_id 保存 + extendedProperties に NodeMap ID 埋め込み

日程調整返信
  → scheduleMode=true を POST /api/ai/draft-reply に渡す
    → isCalendarConnected() チェック
      → OK: findFreeSlots(7日) で営業時間(10-19)内の空き時間取得
        → AI プロンプトに空き時間テキスト注入
      → NG: フォールバック「相手に候補日を聞く」形式

空き時間出力
  → formatFreeSlotsForContext(slots) でデフォルト maxSlots=50（実質制限なし）
  → 同一日付の空きは1行にグルーピング
  → 出力形式: 「3/6（金） 10:00〜12:00、13:00〜18:00」
```

### 重要ルール / DO NOT

1. **終日予定は除外** - `isAllDay === true` なら busySlots に追加しない
2. **calendar_event_id 二重カウント防止** - NodeMap ブロックで `!b.calendarEventId` でフィルタ
3. **営業時間 10:00-19:00** - `BUSINESS_HOURS.weekdayStart=10`, `weekdayEnd=19`
4. **営業時間終了日除外** - `if (dayEndMs <= nowMs) continue`
5. **現在時刻以降のみ** - `let cursor = Math.max(dayStartMs, nowMs)`
6. **土日は除外** - `dayOfWeek === 0 || 6` でスキップ
7. **祝日は除外** - `isJapaneseHoliday(date)` でスキップ（固定祝日・ハッピーマンデー・春分/秋分・振替休日・国民の休日、2000〜2099年対応）
8. **[NM-Task]/[NM-Job]予定はスキップ** - `isNodeMapEvent(summary)` で判定。NodeMap自身の予定は空きとみなす
9. **カレンダー命名** - タスク: `[NM-Task] タスク名`、ジョブ: `[NM-Job] ジョブ名`
10. **API 失敗がメイン処理をブロックしない** - タスク/ジョブ作成は続行、カレンダーはログのみ
11. **isCalendarConnected() 必須** - Calendar API 前に `token.scope.includes('calendar')` で確認

### テストチェックリスト
- [ ] `getGoogleToken()` トークン取得・キャッシュ確認
- [ ] `refreshTokenIfNeeded()` 期限内→既存返却、期限切れ→更新、失敗→既存返却
- [ ] `isCalendarConnected()` スコープチェック
- [ ] `getTodayEvents()` 終日除外、API エラー → `[]`
- [ ] `findFreeSlots()` 営業時間内のみ、土日除外、祝日除外、現在時刻以降、NodeMap二重カウント防止
- [ ] `isJapaneseHoliday()` 固定祝日・ハッピーマンデー・春分/秋分・振替休日・国民の休日を正しく判定
- [ ] `formatFreeSlotsForContext()` 全候補出力・日付グルーピング
- [ ] 日程調整返信 `scheduleMode=true` で空き時間注入、未接続時フォールバック
- [ ] 秘書AIの日程調整が `findFreeSlots()` を正しく使用
- [ ] グループタスク → 全メンバーに同期

---

## 2. インボックス（INBOX）

### 概要
Slack/Chatwork からメッセージを統一フォーマットで受信、グループ化・既読管理・返信・アクション実行。トークンベース受信で即座に取得開始し、購読設定は表示フィルタのみ。既読は3段階管理（ローカル即時 + DB永続化 + キャッシュ無効化）。メール機能は `EMAIL_ENABLED` フラグで休眠中（UI非表示、ソースコードは維持）。

### データフロー
```
GET /api/messages
  → getChannelCapabilities() 並列実行（5 DB クエリ同時）
    - subscriptions（user_channel_subscriptions）
    - canFetch（環境変数 or DB トークン）
    - syncStates（inbox_sync_state）

初回同期モード: fetchAllFromAPIs() → DB 保存 → スパムチェック → initial_sync_done=true
差分取得モード: DB から高速読み出し → バックグラウンド差分取得（Promise.catch で無視）

既読管理:
  1. クライアント: ローカル状態即時更新
  2. サーバー: POST /api/messages/read で DB 永続化
  3. キャッシュ: invalidateByPrefix('messages:') で無効化

返信フロー:
  ReplyForm（autoAiDraft=true）→ AI 下書き生成 → ユーザー送信 → inbox_messages に direction='sent' 保存

リアルタイム更新:
  ポーリング: INBOX_POLL_INTERVAL（3分間隔）でバックグラウンド自動更新
  ページ復帰: visibilitychange イベントでタブ切り替え・最小化復帰時に自動更新
```

### 重要ルール / DO NOT

1. **unified_messages 使わない** - 常に `inbox_messages` テーブル使用
2. **inbox_messages.user_id なし** - `direction` カラムで送受信区別
3. **既読更新後に cache.invalidateByPrefix** - DB 既読を API で上書きしない
4. **バックグラウンド結果をレスポンスに含めない** - Promise.catch で無視して即座にレスポンス
5. **ローカル既読状態を優先** - サーバーからの古い値で上書きしない
6. **saveMessages() の existingReadIds チェック** - バックグラウンド保存で既読を保護
7. **同期タイムスタンプなしで API 全量取得禁止** - `inbox_sync_state.last_sync_at` で差分判定
8. **hasChannelToken() 確認** - トークン存在を仮定しない

### メール休眠化
- **フラグ**: `NEXT_PUBLIC_EMAIL_ENABLED=false` でメール機能を無効化（デフォルト: true）
- **定数**: `EMAIL_ENABLED`（`src/lib/constants.ts`）
- **影響範囲**: メール取得スキップ（API）、サイドバー/フィルタからメール非表示（UI）、秘書AIブリーフィングからメール除外
- **復帰方法**: 環境変数を `true` に設定するだけで復帰。ソースコード削除なし

### 過去のやり取り変遷パネル
- **API**: `GET /api/messages/history?fromAddress=...&excludeId=...&limit=20`
- **データソース**: `inbox_messages` を `from_address` でグルーピング、送受信両方を時系列表示
- **UI**: メッセージ詳細画面の右カラム（`xl` ブレークポイント以上で表示）
- **コンポーネント**: `ContactHistoryPanel`

### チャネル別返信トーン
- **全チャネル対応済み**: ReplyForm の AI下書きボタン・autoAiDraft は全チャネルで有効
- **チャネル別トーン**: email=フォーマル、slack=カジュアル、chatwork=標準
- **署名**: メールのみ自動付与（Slack/Chatwork は付与しない）

### テストチェックリスト
- [ ] 初回同期フロー: initial_sync_done=false → true、全チャネルから取得
- [ ] 差分取得フロー: 2回目以降 < 100ms で DB 即座、新着5秒以内に表示
- [ ] 既読管理: ローカル即時反映、DB失敗時も保持、再取得で上書きされない
- [ ] バックグラウンド: fetchDiffInBackground 実行中に GET レスポンス返される
- [ ] 返信フロー: To/Cc/Bcc 自動計算、AI文体学習適用、メールアドレスバリデーション
- [ ] メール休眠: EMAIL_ENABLED=false → メール取得なし、フィルタ非表示、ブリーフィング除外
- [ ] リアルタイム更新: 3分ポーリング動作、タブ復帰時に自動更新
- [ ] Chatwork/Slack下書き: 返信ボタン → AI下書き自動生成、チャネル別トーン
- [ ] 変遷パネル: from_address で過去やり取り取得、右カラムに表示

---

## 3. 秘書 AI（SECRETARY_AI）

### 概要
キーワードベース意図分類（< 10ms）で39種 intent を高速判定。データ並列取得で DB/API から必要情報を同時取得し、カード表示。アクション実行は即座に API 呼び出し。

### データフロー
```
秘書チャット入力
  → classifyIntent(text) キーワード判定（優先度順）
    → 対応する intent 決定

fetchDataAndBuildCards() 並列取得
  - messages, tasks, jobs, consultations, drive_files, business_events...

CardRenderer で カード生成
  - briefing_summary / calendar_events / inbox_summary / deadline_alert
  - job_approval / reply_draft / task_form / file_intake / ...

handleCardAction(action, data)
  - API 呼び出し（即座に同期実行）
    → ActionResultCard 表示

UI復元しない（毎回ダッシュボード状態スタート）
secretary_conversations DB保存（AIコンテキスト用のみ、デバウンス1秒）
```

### ウェルカム画面（初期表示）
- サマリーカード4枚（未読数、予定数、タスク数、ジョブ数）を2x2グリッド
- よく使う操作を5つに厳選（チップ形式）
- 挨拶は時間帯で変化（おはよう / こんにちは / お疲れさまです）

### Intent一覧（39種）

| カテゴリ | Intent |
|---|---|
| 情報取得 | `briefing`, `inbox`, `message_detail`, `calendar`, `tasks`, `jobs`, `projects`, `documents`, `thought_map`, `business_log`, `business_summary`, `consultations`, `knowledge_nodes` |
| アクション | `reply_draft`, `create_job`, `schedule`, `create_task`, `task_progress`, `create_calendar_event`, `create_drive_folder`, `create_business_event`, `store_file`, `share_file`, `file_intake`, `link_channel`, `task_external_resource`, `task_negotiation` |
| CRUD | `create_contact`, `search_contact`, `create_organization`, `create_project`, `setup_organization` |
| 分析 | `pattern_analysis`, `knowledge_reuse`, `knowledge_structuring` |
| ナビゲーション | `org_projects`, `project_tasks`, `settings_change` |
| その他 | `general` |

### 重要ルール / DO NOT

1. **意図分類の優先度順を変更しない** - 特に `create_job` → `reply_draft` の順序固定
2. **AI を失敗させない** - API エラー時も HTML レスポンス返却（テンプレートフォールバック）
3. **秘書会話を UI に復元しない** - 毎回ダッシュボード表示のみ
4. **CardRenderer null ガード必須** - `if (!card || !card.type || !card.data) return null`
5. **同期 AI 呼び出し** - `await` で待つこと（fire-and-forget は Vercel で先に終了）
6. **contact_persons / knowledge_master_entries ID 手動生成**
7. **並列 DB 取得** - Promise.all で 3-5 個の SELECT を同時実行
8. **伸二メソッド**: ビジネス相談系intentのみ適用。事務的intent（日程調整等）には非適用

### テストチェックリスト
- [ ] 意図分類: 全39種のintentが正しくマッチ
- [ ] カード表示: ブリーフィング6種すべて表示、メッセージ折りたたみ、ジョブ修正フォーム
- [ ] アクション: select_message → message_detail、approve_job → /api/jobs/[id]/execute
- [ ] UI: ダッシュボード表示、サジェストチップ動作、ファイルアップロード3段階
- [ ] エラー: API タイムアウト時エラーメッセージ表示、AI API なし時テンプレート使用
- [ ] 外部資料intent: 「外部資料を取り込みたい」→ task_external_resource カード表示
- [ ] 設定変更intent: 「メールをオフにして」→ settings_change カード表示
- [ ] 組織PJナビ: 「○○組織のプロジェクト」→ org_projects カード
- [ ] PJタスクナビ: 「○○プロジェクトのタスク」→ project_tasks カード
- [ ] ビジネスログ詳細: 「○○のビジネスログ」→ 直近30日イベント詳細表示

---

## 4. Drive 統合（DRIVE_INTEGRATION）

### 概要
メッセージ添付ファイル・URL を Google Drive に自動保存。4階層フォルダ（組織/プロジェクト/方向/年月）でファイル整理。AI が書類種別・方向・年月を自動分類し、ステージング承認フロー経由で最終配置。

### データフロー
```
ファイル追加:
  POST /api/drive/upload { projectId, fileName, sizeBytes }
    → 4階層フォルダ自動作成 → Resumable Upload Session URL 生成
    → uploadUrl + accessToken 返却

ブラウザ → Google Drive 直接 PUT（Vercel 4.5MB 制限回避）

POST /api/drive/upload/complete { projectId, fileName, driveFileId }
  → AI 分類（documentType / direction / yearMonth / suggestedName）
  → drive_file_staging 登録（status='pending_review'）

FileIntakeCard（秘書UI）
  → ユーザーが AI 分類を確認・修正 → approve / reject

承認時:
  POST /api/drive/files/intake/{id}/approve
    → 4階層フォルダ最終移動 + リネーム
    → drive_documents 登録
    → business_events に document_received/submitted イベント記録

フォルダ構造:
  [NodeMap] A社/
    プロジェクトX/
      受領/2026-03/
      提出/2026-03/
```

### 重要ルール / DO NOT

1. **ファイル内容を読まない** - ファイル名・メール件名・本文先頭200文字のみで判定
2. **service_role_key 使わない** - ユーザーの OAuth トークン使用（drive.file スコープ）
3. **フォルダ直接削除禁止** - drive_folders DB レコードも併せて削除
4. **リネーム後のパス検索依存禁止** - Drive API は ID ベース検索推奨
5. **isDriveConnected() 確認** - `token.scope.includes('drive.file')` で検証
6. **project_id 必須** - ファイルアップロードに project_id なしでは不可

### テストチェックリスト
- [ ] フォルダ作成: 初回時4階層自動作成、2回目以降は既存再利用
- [ ] ファイル分類: AI confidence > 0.7、フォールバック「その他」
- [ ] Resumable Upload: uploadUrl返却 → ブラウザ直接PUT → complete API
- [ ] ステージング承認: pending_review → approved → uploaded
- [ ] チャネル別: Gmail / Slack / Chatwork 添付ファイル自動取得

---

## 5. タスク ライフサイクル（TASK_LIFECYCLE）

### 概要
個人・グループの大型業務。3フェーズ（ideation→progress→result）で段階遷移。AI会話で段階的に構造化し、完了時にビジネスログにアーカイブ。Calendar統合、ファイル添付、思考ノード自動抽出、外部AI資料取り込みを実装。

### データフロー
```
作成時: phase='ideation', status='todo'
  → structureSeedWithAI() で4要素自動生成（goal / content / concerns / dueDate）
  → ideation_summary に保存、ユーザー編集可能

進行フェーズ移行: phase='progress', status='in_progress'
  → AI コーチング、進捗トラッカー表示

完了: phase='result', status='done'
  → AI 事後振返り（initial_goal vs final_landing スナップショット）

ビジネスログ化:
  archiveTaskToBusinessLog()
    → business_events 新規作成
    → ideation_summary + result_summary + 会話ログ + ドキュメントURL 保全
    → tasks レコード削除（FK CASCADE）

Calendar 同期:
  syncTaskToCalendar() → scheduled_start/end あり → Google Calendar POST
  グループタスク: 各メンバーの calendar_event_id 個別追跡

思考ノード自動抽出:
  AI 会話毎に extractAndLink()
    → keyword confidence >= 0.7 → knowledge_master_entries 登録
    → thought_task_nodes で紐づけ、thought_edges で思考動線記録

外部AI資料取り込み:
  task_external_resources テーブルに保存
    → テキスト / ファイル（TXT, PDF, DOCX, MD, CSV, JSON）/ URL
    → 保存時50,000文字上限。AI会話注入時は各資料3,000文字に制限
    → generateTaskChat() のシステムプロンプトに注入
```

### 伸二メソッドの適用
- `getShinjiMethodPrompt()` が `aiClient.service.ts` の `generateTaskChat()` に注入
- 適用範囲: タスクAI会話の全フェーズ（ideation / progress / result）
- フレームワーク: 階層思考（Why×5層）→ 飛び地（横方向連想）→ ストーリー化

### 重要ルール / DO NOT

1. **task_type='group' でも user_id 単一** - グループ = 複数メンバー実行だが作成者が owner
2. **scheduled_start=NOW 避ける** - createdAt より後の時刻指定
3. **resultSummary 手動生成禁止** - タスク完了時 AI 自動生成を待つ
4. **task_conversations 直接削除禁止** - deleteTask の FK CASCADE で自動削除
5. **project_id 必須**（ファイルアップロード時）

### テストチェックリスト
- [ ] フェーズ遷移: 作成時ideation、進行→in_progress、完了→done
- [ ] AI構想: 4要素自動生成、ユーザー再編集可能
- [ ] Calendar: scheduled_start/end → Google Calendar イベント
- [ ] ビジネスログ: 完了時 business_events 作成、タスク削除後も残存
- [ ] 思考ノード: AI会話毎に抽出、thought_task_nodes紐づけ
- [ ] 伸二メソッド: タスクAI会話のシステムプロンプトに含まれている
- [ ] 外部資料追加: テキスト/ファイル/URL → task_external_resources に保存
- [ ] 外部資料コンテキスト: AI会話のシステムプロンプトに注入される
- [ ] 外部資料削除: DB削除、次回AI会話でコンテキストから除外

---

## 6. ジョブと社内相談（JOBS_AND_CONSULTATIONS）

### 概要
インボックスのアクションで即時実行（返信/日程調整/Drive保存/タスク化）。社内相談のみ非同期フロー（consulting→draft_ready→done）で処理。

### データフロー
```
【即時実行フロー】
MessageDetail.tsx
  → 💬 返信 / 📅 日程調整 / 📁 Drive保存 / ✅ タスク化 アクション選択
    → ReplyForm（autoAiDraft=true）→ AI下書き → 送信
    → inbox_messages に direction='sent' 保存

【日程調整】
scheduleMode=true で AI プロンプト注入:
  isCalendarConnected() → findFreeSlots(7日) → formatFreeSlotsForContext()
    → 全空き時間すべて候補として提示

【社内相談フロー】
MessageDetail.tsx → 「💬 社内相談」→ 相談相手選択（linked_user_id紐づけ済みのみ）
  → POST /api/jobs { type: 'consult' }
    → jobs + consultations テーブル両方作成

回答者のジョブページ → 回答入力 → AI返信文面生成 → status='draft_ready'
依頼者が確認・送信 → status='done'
```

### 重要ルール / DO NOT

1. **社内相談を即時実行化しない** - 非同期フロー維持（相談者の思考時間必要）
2. **job_id なしで consultations 作成禁止** - jobs テーブル FK 制約
3. **responder_user_id に contact_id そのまま禁止** - linked_user_id 経由で auth.user_id 変換
4. **過去時間を空き時間に含める禁止** - findFreeSlots で現在時刻以降のみ

### テストチェックリスト
- [ ] 返信アクション: 即座にメール送信・Slack投稿、inbox_messages に direction='sent' 保存
- [ ] 日程調整: scheduleMode=true で空き時間注入、カレンダー未接続時フォールバック
- [ ] 社内相談: jobs + consultations 両方登録、回答者のジョブページに表示、回答で ai_draft 生成
- [ ] linked_user_id 紐づけ: 相談相手選択時 linked_user_id 紐づけ済みのみ表示

---

## 7. 思考マップ（THOUGHT_MAP）

### 概要
ユーザー個人の「知識の全体地形」を力学シミュレーションで可視化。タスクのAI会話で自動抽出されたキーワードノードと思考動線（エッジ）を空間配置し、フェーズを背景ゾーンで表現。Overview（全体）vs Trace（個別トレース）2モード。

### データフロー
```
AI 会話毎に extractKeywords() 実行
  → confidence >= 0.7 のキーワードのみ採用（最大8）
    → knowledge_master_entries に重複なく登録
    → thought_task_nodes で task_id と紐づけ

エッジ記録:
  前ターン最後ノード → 今ターン最初ノード、今ターン内のノード群を順に接続
  → thought_edges 記録（edge_type: 'main' or 'detour'）

スナップショット:
  作成時: initial_goal 記録
  完了時: final_landing 記録

Canvas 描画:
  力学シミュレーション（反発力 + 引力 + フェーズアンカー）
  背景ゾーン: seed→ideation→progress→result

Overview モード: 全ノード + 全エッジ、右パネルでタスクフィルター
Trace モード: 特定タスク思考フロー、タイムスライダーで時系列再生
```

### 重要ルール / DO NOT

1. **ノード位置を固定化しない** - 力学シミュレーションで毎回異なる（設計通り）
2. **thought_task_nodes 手動削除禁止** - deleteTask の FK CASCADE で自動削除
3. **信頼度 < 0.7 ノード化禁止** - ノイズ増加、0.7以上に統一
4. **turn_id なし会話ジャンプ禁止** - createdAt タイムスタンプでフォールバック

### テストチェックリスト
- [ ] ノード抽出: AI会話毎に keyword 抽出、信頼度 >= 0.7
- [ ] エッジ記録: ターン内のノード群が順に接続、thought_edges UNIQUE制約
- [ ] 力学シミュレーション: 反発・引力で自動配置、パン・ズーム動作
- [ ] スナップショット: 作成時 initial_goal、完了時 final_landing
- [ ] 会話ジャンプ: ノードクリック → 「会話を見る」→ turn_id で会話取得

---

## 8. コンタクト（CONTACTS）

### 概要
メッセージ送受信相手を一元管理。同一人物のメール・Slack・Chatworkアカウントを統合、過去やり取り・関連タスク・所属組織を紐づけ。重複検出・マージで一元化。組織・プロジェクト画面内のメンバータブとして表示。

### データフロー
```
contact_persons.id 手動生成（必須）: team_${Date.now()}_${random}

contact_channels（UNIQUE: contact_id + channel + address）

重複検出 GET /api/contacts/duplicates → マージ POST /api/contacts/merge

Enrichment POST /api/contacts/enrich
  → Slack users.info / Chatwork contacts API でプロフィール取得

linked_user_id 紐づけ（自社組織のみ）
  → /api/users で Supabase auth.users 取得
  → 社内相談で responder_user_id に利用
```

### 重要ルール / DO NOT

1. **contact_persons.id 自動生成頼らない** - TEXT型・手動生成必須
2. **contact_channels UNIQUE 制約無視** - マージ前に重複チャネル削除
3. **linked_user_id を他 user_id と混同** - auth.user_id（UUID）として使用
4. **organization_id なしメンバー扱い禁止** - NULL は「独立」扱い

### テストチェックリスト
- [ ] ID 生成: `team_${Date.now()}_${random}` で生成、重複なし
- [ ] チャネル管理: UNIQUE制約で重複登録禁止
- [ ] 重複検出: 同名・同メール・同Slack user_id 検出
- [ ] マージ: source 削除、channels 付け替え、tags マージ
- [ ] linked_user_id: 自社メンバーのみドロップダウン、社内相談で使用

---

## 9. ナレッジ マスタ（KNOWLEDGE_MASTER）

### 概要
タスク・メッセージ・ビジネスイベントから自動抽出されたキーワードを一元管理。蓄積は全ユーザー共有だが表示は個人フィルタ。週次AIクラスタリングで領域・分野を自動提案。思考マップ画面のナレッジタブ（/thought-map?tab=knowledge）として表示。

### データフロー
```
キーワード自動抽出: extractKeywords()
  → confidence >= 0.7 のみ採用（最大8）
  → knowledge_master_entries 新規作成（id: me_auto_${Date.now()}_${random}）
  → is_confirmed=false で待機状態

未確認ノード管理（UnconfirmedPanel）
  → 一括承認: 全件を同じ category / domain / field に設定

週次 AI クラスタリング（毎週月曜 2:30）
  → 未確認50個以上で対象
  → knowledge_clustering_proposals 提案保存

期間別ノード表示（マイナレッジパネル）
  → 「今日」「今週」「今月」「全期間」の4タブフィルター（デフォルト: 今日）
  → API: /api/nodes/my-keywords?period=today|week|month|all

秘書AI対応:
  → knowledge_nodes intent: 「今日のノード」「今週のナレッジ」等で発火
  → ユーザーメッセージから期間を自動推定
```

### 重要ルール / DO NOT

1. **knowledge_master_entries.id 自動生成頼らない** - TEXT型・手動生成必須
2. **信頼度 < 0.7 キーワード採用禁止** - 0.7以上統一
3. **同週に複数提案実行禁止** - ISO週ベースで1度のみ
4. **AI提案すべて承認禁止** - 不要な領域は手動削除で対応

### テストチェックリスト
- [ ] ID 生成: `me_auto_` or `me_manual_` で生成
- [ ] 未確認ノード: is_confirmed=false 表示、一括承認で全件 true
- [ ] AIクラスタリング: 毎週月曜実行、50+未確認で提案
- [ ] 期間別ノード: today フィルタが正しく当日のみ表示、デフォルト=today
- [ ] 秘書AI: 「今日のノード」等で knowledge_nodes intent 発火
- [ ] CRUD: 領域・分野・キーワード作成・編集・削除

---

## 10. 組織・プロジェクト（ORGANIZATIONS）

### 概要
組織 > プロジェクト > タスク | ドキュメント | ビジネスログ の階層を1画面で操作。サイドメニューの「組織・プロジェクト」（/organizations）から遷移。コンタクト・ビジネスログはこの画面内に統合。

### 組織詳細ページ構成
```
組織詳細（/organizations/[id]）
  タブ1: 基本情報
  タブ2: チャネル
  タブ3: メンバー（コンタクト）
  タブ4: プロジェクト
    → PJ選択後のサブタブ: タスク / ドキュメント / ビジネスログ（タイムライン）
```

### 未紐づけチャネル通知
- 組織チャネルのうち `project_channels` に未登録のSlack/CWチャネルを警告表示
- API: `GET /api/organizations/[id]/unlinked-channels`
- プロジェクトタブ上部に紐づけUIを表示

### ビジネスログ タイムラインUI
- プロジェクト配下のタブとして、時間軸で変遷を辿れるUI
- 月ごとのグルーピング、種別フィルター（会議/意思決定/メッセージ/ファイル等）
- 自動蓄積イベント（メッセージ・タスク完了・ファイル）はグレーアウトで区別
- 手動イベント追加可能

### テストチェックリスト
- [ ] 組織一覧: カード形式表示
- [ ] 組織詳細: 4タブ正常表示（基本情報/チャネル/メンバー/PJ）
- [ ] PJ配下: タスク/ドキュメント/ビジネスログのサブタブ表示
- [ ] 未紐づけチャネル: 警告表示、プロジェクト選択→即紐づけ
- [ ] タイムライン: 月別グルーピング、種別フィルター、手動追加

---

## クロスフィーチャー共通ルール

### 認証・権限
- **getServerSupabase()** をサービス層で使用（service role キー、キャッシュ付き）
- **getSupabase()** はフォールバック・クライアント側のみ
- **getServerUserId()** でユーザーID確認（401なら即座に返却）

### キャッシュ無効化
- 既読更新・mutation直後に **cache.invalidateByPrefix** 実行

### AIパーソナライズ
- **buildPersonalizedContext()** で性格タイプ・応答スタイル・思考傾向・オーナー方針を注入
- **getUserWritingStyle()** で過去送信10件から文体学習
- すべてのAIエンドポイントに適用

---

## 環境変数（必須）

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET
ENV_TOKEN_OWNER_ID
NEXT_PUBLIC_EMAIL_ENABLED
EMAIL_USER
SLACK_BOT_TOKEN
CHATWORK_API_TOKEN
GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI
```
