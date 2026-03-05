# NodeMap 機能仕様書

> 全機能の現行仕様。各セクションは「概要 → データフロー → ルール → チェックリスト」で構成。

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
```

### 重要ルール / DO NOT

1. **終日予定は除外** - `isAllDay === true` なら busySlots に追加しない（時刻情報がないため）
2. **calendar_event_id 二重カウント防止** - NodeMap ブロックで `!b.calendarEventId` でフィルタ
3. **営業時間 10:00-19:00（Phase A）** - `BUSINESS_HOURS.weekdayStart=10`, `weekdayEnd=19`。AI出力でもこの範囲のみ候補に出す
4. **営業時間終了日除外** - `if (dayEndMs <= nowMs) continue` で当日営業時間終了済みならスキップ
5. **現在時刻以降のみ** - `let cursor = Math.max(dayStartMs, nowMs)` で過去時間を除外
6. **土日は除外** - `dayOfWeek === 0 || 6` でスキップ
7. **[NM-Task]/[NM-Job]予定はスキップ（Phase A）** - `isNodeMapEvent(summary)` で判定。NodeMap自身が作った予定は空きとみなす
8. **カレンダー命名ルール（Phase A）** - タスク予定は `[NM-Task] タスク名`、ジョブ予定は `[NM-Job] ジョブ名` で作成
9. **API 失敗がメイン処理をブロックしない** - タスク/ジョブ作成は続行、カレンダーはログのみ
10. **トークン リフレッシュ失敗は許容** - 既存トークン返却で処理継続
11. **isCalendarConnected() 必須** - Calendar API 前に `token.scope.includes('calendar')` で確認

### Phase C: 祝日除外
- **祝日判定関数**: `isJapaneseHoliday(date)` / `getJapaneseHolidays(year)`（`src/lib/constants.ts`）
- **対象祝日**: 固定祝日（元日〜勤労感謝の日）+ ハッピーマンデー（成人の日・海の日・敬老の日・スポーツの日）+ 春分の日・秋分の日 + 振替休日 + 国民の休日
- **適用箇所**: `findFreeSlots()` で土日に加え祝日もスキップ
- **範囲**: 2000〜2099年対応（天文学的近似式による春分・秋分計算）

### Phase C: 複数候補の全出力
- **改善前**: `formatFreeSlotsForContext(slots, maxSlots)` でスロット数を制限（秘書: 8件、インボックス: 20件）
- **改善後**: デフォルト maxSlots=50（実質制限なし）、同一日付の空きは1行にグルーピング
- **出力形式**: `- 3/6（金） 10:00〜12:00、13:00〜18:00`（同じ日の全空き時間をカンマ区切り）
- **秘書AI・インボックス共通**: 両方とも `formatFreeSlotsForContext(freeSlots)` でデフォルト呼び出し（同一ロジック）

### テストチェックリスト
- [ ] `getGoogleToken()` トークン取得・キャッシュ確認
- [ ] `refreshTokenIfNeeded()` 期限内→既存返却、期限切れ→更新、失敗→既存返却
- [ ] `isCalendarConnected()` スコープチェック
- [ ] `getTodayEvents()` 終日除外、API エラー → `[]`
- [ ] `findFreeSlots()` 営業時間内のみ、土日除外、現在時刻以降、NodeMap 二重カウント防止
- [ ] `findFreeSlots()` 祝日除外（Phase C）: 祝日の日を空き時間に含めない
- [ ] `isJapaneseHoliday()` 固定祝日・ハッピーマンデー・春分/秋分・振替休日・国民の休日を正しく判定
- [ ] `formatFreeSlotsForContext()` 全候補出力・日付グルーピング（Phase C）
- [ ] 日程調整返信 `scheduleMode=true` で空き時間注入、未接続時フォールバック
- [ ] 秘書AIの日程調整が `findFreeSlots()` を正しく使用（祝日除外・全候補出力）
- [ ] グループタスク → 全メンバーに同期

---

## 2. インボックス（INBOX）

### 概要
Gmail/Slack/Chatwork からメッセージを統一フォーマットで受信、グループ化・既読管理・返信・アクション実行。トークンベース受信（環境変数 or DB トークン）で即座に取得開始し、購読設定は表示フィルタのみ。既読は 3 段階管理（ローカル即時 + DB 永続化 + キャッシュ無効化）。

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

### Phase B: メール休眠化
- **フラグ**: `NEXT_PUBLIC_EMAIL_ENABLED=false` でメール機能を無効化（デフォルト: true）
- **定数**: `EMAIL_ENABLED`（`src/lib/constants.ts`）
- **影響範囲**: メール取得スキップ（API）、サイドバー/フィルタからメール非表示（UI）、秘書AIブリーフィングからメール除外
- **復帰方法**: 環境変数を `true` に設定（または削除）するだけで復帰
- **ソースコード**: 削除なし。フラグによる条件分岐のみ

### Phase B: リアルタイム更新
- **ポーリング**: `INBOX_POLL_INTERVAL`（3分間隔）でバックグラウンド自動更新
- **ページ復帰**: `visibilitychange` イベントでタブ切り替え・最小化復帰時に自動更新
- **SWR パターン**: キャッシュを表示しつつバックグラウンドで最新化（ローディング表示なし）
- **実装**: `useMessages.ts` の useEffect で interval + visibilitychange リスナー

### Phase B: Chatwork/Slack 返信下書き対応
- **全チャネル対応済み**: ReplyForm の AI 下書きボタン・autoAiDraft は既に全チャネルで有効
- **チャネル別トーン**: email=フォーマル、slack=カジュアル、chatwork=標準（`generateReplyDraft` で自動調整）
- **署名**: メールのみ自動付与（Slack/Chatwork は付与しない）
- **グループチャネル判定**: Slack チャネル / Chatwork ルームで全体向けトーン調整

### Phase B: 過去のやり取り変遷パネル
- **API**: `GET /api/messages/history?fromAddress=...&excludeId=...&limit=20`
- **データソース**: `inbox_messages` を `from_address` でグルーピング、送受信両方を時系列表示
- **UI**: メッセージ詳細画面の右カラム（`xl` ブレークポイント以上で表示、幅 72）
- **コンポーネント**: `ContactHistoryPanel`（`src/components/inbox/ContactHistoryPanel.tsx`）
- **注意書き**: 「最新の受信は反映されていない場合があります」を表示
- **AI活用**: `getRecentMessages()` が既に返信下書きAIのコンテキストに過去やり取りを注入済み

### テストチェックリスト
- [ ] 初回同期フロー: initial_sync_done=false → true、全チャネルから取得
- [ ] 差分取得フロー: 2 回目以降 < 100ms で DB 即座、新着 5 秒以内に表示
- [ ] 既読管理: ローカル即時反映、DB 失敗時も保持、再取得で上書きされない
- [ ] バックグラウンド: fetchDiffInBackground 実行中に GET レスポンス返される
- [ ] 返信フロー: To/Cc/Bcc 自動計算、AI 文体学習適用、メールアドレスバリデーション
- [ ] 購読フィルタ: subscriptions 登録なし＋トークン有 → 全メッセージ表示
- [ ] メール休眠: EMAIL_ENABLED=false → メール取得なし、フィルタ非表示、ブリーフィング除外
- [ ] リアルタイム更新: 3分ポーリング動作、タブ復帰時に自動更新
- [ ] Chatwork/Slack下書き: 返信ボタン → AI下書き自動生成、チャネル別トーン
- [ ] 変遷パネル: from_address で過去やり取り取得、右カラムに表示、xl以上で表示

---

## 3. 秘書 AI（SECRETARY_AI）

### 概要
キーワードベース意図分類（< 10ms）で 41 種 intent を高速判定。データ並列取得で DB/API から必要情報を同時取得し、カード表示。アクション実行は即座に API 呼び出し（ジョブ化廃止）。

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
    → /api/jobs/[id]/execute / /api/messages/reply / /api/tasks POST...
      → ActionResultCard 表示

UI 復元しない（毎回ダッシュボード状態スタート）
secretary_conversations DB 保存（AI コンテキスト用のみ、デバウンス 1 秒）
```

### 重要ルール / DO NOT

1. **意図分類の優先度順を変更しない** - 特に `create_job` → `reply_draft` の順序固定（衝突回避）
2. **AI を失敗させない** - API エラー時も HTML レスポンス返却（テンプレートフォールバック）
3. **秘書会話を UI に復元しない** - 毎回ダッシュボード表示のみ。DB は AI コンテキスト用
4. **CardRenderer null ガード必須** - `if (!card || !card.type || !card.data) return null`
5. **同期 AI 呼び出し** - `await` で待つこと（fire-and-forget は Vercel で先に終了）
6. **contact_persons / knowledge_master_entries ID 手動生成** - `team_${Date.now()}_${random}` / `me_auto_${Date.now()}_${random}`
7. **既読更新後に cache.invalidateByPrefix** - サーバーキャッシュが古い値を返さない
8. **並列 DB 取得** - Promise.all で 3-5 個の SELECT を同時実行

### テストチェックリスト
- [ ] 意図分類: briefing / reply_draft / create_job / calendar / schedule / tasks / jobs
- [ ] カード表示: ブリーフィング 6 種すべて表示、メッセージ折りたたみ、ジョブ修正フォーム
- [ ] アクション: select_message → message_detail、approve_job → /api/jobs/[id]/execute、submit_task_form → task_created
- [ ] UI: ダッシュボード表示、サジェストチップ動作、ファイルアップロード 3 段階
- [ ] エラー: API タイムアウト時エラーメッセージ表示、AI API なし時テンプレート使用

---

## 4. Drive 統合（DRIVE_INTEGRATION）

### 概要
メッセージ添付ファイル・URL を Google Drive に自動保存。4 階層フォルダ（組織/プロジェクト/方向/年月）でファイル整理。AI が書類種別・方向・年月を自動分類し、ステージング承認フロー（pending_review → approved → uploaded）経由で最終配置。

### データフロー
```
ファイル追加:
  POST /api/drive/upload { projectId, fileName, sizeBytes }
    → 4 階層フォルダ自動作成（getOrCreate～ DB マッピング）
    → Google Drive Resumable Upload Session URL 生成
    → uploadUrl + accessToken 返却

ブラウザ → Google Drive 直接 PUT
  fetch(uploadUrl, { method: 'PUT', body: fileBlob })
    → Vercel 4.5MB 制限回避

POST /api/drive/upload/complete { projectId, fileName, driveFileId }
  → AI 分類（documentType / direction / yearMonth / suggestedName）
  → drive_file_staging 登録（status='pending_review'）

FileIntakeCard（秘書UI）
  → ユーザーが AI 分類を確認・修正
  → approve / reject

承認時:
  POST /api/drive/files/intake/{id}/approve
    → 4 階層フォルダ最終移動 + リネーム
    → drive_documents 登録
    → business_events に document_received/submitted イベント記録
```

### 重要ルール / DO NOT

1. **ファイル内容を読まない** - ファイル名・メール件名・メール本文先頭 200 文字のみで判定
2. **service_role_key 使わない** - ユーザーの OAuth トークン使用（drive.file スコープ）
3. **フォルダ直接削除禁止** - drive_folders DB レコードも併せて削除（FK CASCADE）
4. **リネーム後のパス検索依存禁止** - Drive API は ID ベース検索推奨（パスはユーザー操作で変わる）
5. **isDriveConnected() 確認** - `token.scope.includes('drive.file')` で検証
6. **project_id 必須** - ファイルアップロードに project_id なしでは不可

### テストチェックリスト
- [ ] フォルダ作成: 初回時 4 階層自動作成、2 回目以降は既存フォルダ再利用、drive_folders DB 記録確認
- [ ] ファイル分類: AI confidence > 0.7、フォールバック「その他」判定、yearMonth 'YYYY-MM' 形式
- [ ] Resumable Upload: Step 1 uploadUrl 返却、Step 2 ブラウザ直接 PUT、Step 3 complete API で ファイル検出
- [ ] ステージング承認: pending_review → approved → uploaded、reject で 一時ファイル削除
- [ ] チャネル別: Gmail / Slack / Chatwork 添付ファイル自動取得

---

## 5. タスク ライフサイクル（TASK_LIFECYCLE）

### 概要
個人・グループの大型業務。3 フェーズ（ideation→progress→result）で段階遷移。AI 会話で段階的に構造化し、完了時にビジネスログにアーカイブ。Calendar 統合、ファイル添付、思考ノード自動抽出を実装。

### データフロー
```
作成時: phase='ideation', status='todo'
  → structureSeedWithAI() で 4 要素自動生成（goal / content / concerns / dueDate）
  → ideation_summary に保存、ユーザー編集可能

進行フェーズ移行: phase='progress', status='in_progress'
  → AI コーチング、進捗トラッカー表示（2/4 完了等）

完了: phase='result', status='done'
  → AI 事後振返り（initial_goal vs final_landing スナップショット）

ビジネスログ化:
  archiveTaskToBusinessLog()
    → business_events 新規作成
    → ideation_summary + result_summary + 会話ログ + ドキュメント URL 保全
    → tasks レコード削除（FK CASCADE）

Calendar 同期:
  syncTaskToCalendar() → scheduled_start/end あり → Google Calendar POST
  グループタスク: 各メンバーの calendar_event_id 個別追跡

思考ノード自動抽出:
  AI 会話毎に extractAndLink()
    → keyword confidence >= 0.7 → knowledge_master_entries 登録
    → thought_task_nodes で紐づけ、thought_edges で思考動線記録
```

### 重要ルール / DO NOT

1. **task_type='group' でも user_id 単一** - グループ = 複数メンバー実行だが作成者が owner
2. **scheduled_start=NOW 避ける** - createdAt より後の時刻指定（空き時間検索混乱防止）
3. **resultSummary 手動生成禁止** - タスク完了時 AI 自動生成を待つ
4. **task_conversations 直接削除禁止** - deleteTask の FK CASCADE で自動削除
5. **drive_documents の task_id 直接 NULL 禁止** - PATCH /api/tasks/{id}/files/{fileId} 経由
6. **project_id 必須**（ファイルアップロード時）

### テストチェックリスト
- [ ] フェーズ遷移: 作成時 ideation、進行→ status='in_progress'、完了→ status='done'
- [ ] AI 構想: 4 要素自動生成、ユーザー再編集可能、保存のみで AI 送信なし
- [ ] 進捗トラッカー: 4 項目プログレスバー、全完了で「進行フェーズへ」表示
- [ ] Calendar: scheduled_start/end → Google Calendar イベント、グループで各メンバーに個別
- [ ] ビジネスログ: 完了時 business_events 作成、summary + 会話ログ保全、タスク削除後も events 残存
- [ ] 思考ノード: AI 会話毎に抽出、thought_task_nodes 紐づけ、thought_edges 形成

---

## 6. ジョブと社内相談（JOBS_AND_CONSULTATIONS）

### 概要
秘書に委ねる日常の簡易作業。type 別に即時実行フロー（reply/schedule/check）または社内相談フロー（consulting→draft_ready→done）で処理。Phase 62 で ジョブの即座実行化を廃止し、返信・日程調整・タスク化・Drive 保存を MessageInlineActions で同期実行。

### データフロー
```
【即時実行フロー】
MessageDetail.tsx
  → 💬 返信 / 📅 日程調整 / 📁 Drive 保存 / ✅ タスク化 アクション選択
    → ReplyForm（autoAiDraft=true）→ AI 下書き生成
      → ユーザー「送信」
        → POST /api/messages/reply（即座に同期実行）
        → inbox_messages に direction='sent' 保存
        → ActionResultCard 表示

【日程調整】
scheduleMode=true で AI プロンプト注入:
  isCalendarConnected() → findFreeSlots(7 日) → formatFreeSlotsForContext()
    → "3/6（金） 10:00〜12:00、13:00〜18:00"形式で AI に注入
      → 全空き時間すべて候補として提示

【社内相談フロー】
MessageDetail.tsx
  → 「💬 社内相談」選択
    → 相談相手（linked_user_id 紐づけ済みメンバーのみ）選択
      → POST /api/jobs { type: 'consult', ... }
        → jobs + consultations テーブル両方作成（status='consulting'）

回答者のジョブページ
  → 「あなた宛ての相談」バナー表示
    → 回答入力 → POST /api/consultations { answer }
      → スレッド要約生成（元メッセージ + 相談内容 + 回答）
      → AI 返信文面生成、status='draft_ready'

依頼者が確認・送信
  → execution_log に成功ログ、status='done'
```

### 重要ルール / DO NOT

1. **社内相談を即時実行化しない** - consulting→draft_ready→done の非同期フロー維持（相談者の思考時間必要）
2. **job_id なしで consultations 作成禁止** - jobs テーブル FK 制約
3. **responder_user_id に contact_id そのまま禁止** - linked_user_id 経由で auth.user_id 変換
4. **過去時間を空き時間に含める禁止** - findFreeSlots で現在時刻以降のみフィルタ必須
5. **calendar_event_id あるのに findFreeSlots 含める禁止** - 二重カウント防止、設定済みは除外

### テストチェックリスト
- [ ] 返信アクション: 即座にメール送信・Slack 投稿、inbox_messages に direction='sent' 保存
- [ ] 日程調整: scheduleMode=true で空き時間注入、カレンダー未接続時フォールバック
- [ ] 社内相談: 作成時 jobs + consultations 両方登録、回答者のジョブページに表示、回答で ai_draft 生成
- [ ] linked_user_id 紐づけ: 相談相手選択時 linked_user_id 紐づけ済みのみ表示、未紐づけはグレーアウト

---

## 7. 思考マップ（THOUGHT_MAP）

### 概要
ユーザー個人の「知識の全体地形」を力学シミュレーションで可視化。タスク・種の AI 会話で自動抽出されたキーワードノードと思考動線（エッジ）を空間配置し、フェーズを背景ゾーンで表現。Overview（全体）vs Trace（個別トレース）2 モード。

### データフロー
```
AI 会話毎に extractKeywords() 実行
  → confidence >= 0.7 のキーワードのみ採用（最大 8）
    → knowledge_master_entries に重複なく登録（id: me_auto_${Date.now()}_${random}）
    → thought_task_nodes で task_id / seed_id と紐づけ

エッジ記録:
  前ターン最後ノード → 今ターン最初ノード、今ターン内のノード群を順に接続
  → thought_edges 記録（edge_type: 'main' or 'detour'）

スナップショット:
  作成時: initial_goal（種のノード）記録
  完了時: final_landing（結果フェーズ到達ノード）記録

Canvas 描画:
  力学シミュレーション（反発力 + 引力 + フェーズアンカー）
  背景ゾーン: seed（左上緑）→ ideation（右上青）→ progress（右下紫）→ result（左下藍）

Overview モード: 全ノード + 全エッジ、右パネルでタスクフィルター
Trace モード: 特定タスク思考フロー、タイムスライダーで時系列再生
```

### 重要ルール / DO NOT

1. **ノード位置を固定化しない** - 力学シミュレーションで毎回異なる（設計通り）
2. **thought_task_nodes 手動削除禁止** - deleteTask の FK CASCADE で自動削除
3. **信頼度 < 0.7 ノード化禁止** - ノイズ増加、0.7 以上に統一
4. **seed_id なしに種→タスクエッジ統合禁止** - seed_id チェックで判定
5. **turn_id なし会話ジャンプ禁止** - source_conversation_id NULL の場合は createdAt タイムスタンプで フォールバック

### テストチェックリスト
- [ ] ノード抽出: AI 会話毎に keyword 抽出、信頼度 >= 0.7、knowledge_master_entries 重複なく登録
- [ ] エッジ記録: ターン内のノード群が順に接続、前→今ターン接続、thought_edges UNIQUE 制約で重複なし
- [ ] 力学シミュレーション: 反発・引力で自動配置、フェーズアンカーで 4 ゾーン分散、パン・ズーム動作
- [ ] スナップショット: 作成時 initial_goal、完了時 final_landing、UI で差分比較
- [ ] 会話ジャンプ: ノードクリック → 「会話を見る」→ turn_id で会話取得、キーワードハイライト

---

## 8. コンタクト（CONTACTS）

### 概要
メッセージ送受信相手を一元管理。同一人物のメール・Slack・Chatwork アカウントを統合、過去やり取り・関連タスク・所属組織を紐づけ。重複検出・マージで一元化、AI がコンテキスト自動生成。linked_user_id で NodeMap アカウント紐づけ（社内相談用）。

### データフロー
```
contact_persons.id 手動生成（必須）: team_${Date.now()}_${random}

contact_channels（UNIQUE: contact_id + channel + address）
  → Email / Slack user_id / Chatwork account_id 記録

重複検出 GET /api/contacts/duplicates
  → 同名、同メールアドレス、同 Slack user_id を duplicateGroups に集約

マージ POST /api/contacts/merge
  → source channels を target に付け替え
  → source tags を target にマージ
  → source 削除（FK CASCADE）

Enrichment POST /api/contacts/enrich
  → Slack users.info / Chatwork contacts API で プロフィール取得
  → real_name / title / department / company 自動入力

AI Context 自動生成（Phase 36）
  → 過去やり取り分析
  → ai_context フィールドに「月 2-3 回のペース...」形式で保存

linked_user_id 紐づけ（Phase 58b、自社組織のみ）
  → /api/users で Supabase auth.users 取得
  → ドロップダウンで選択 → PATCH /api/organizations/{id}/members で保存
  → 社内相談で responder_user_id に利用
```

### 重要ルール / DO NOT

1. **contact_persons.id 自動生成頼らない** - TEXT 型・自動生成なし、手動生成で POST 必須
2. **contact_channels UNIQUE 制約無視** - マージ前に重複チャネル削除またはマージ
3. **linked_user_id を他 user_id と混同** - auth.user_id（UUID）として使用
4. **organization_id なしメンバー扱い禁止** - NULL の場合は「独立」扱い
5. **ai_context 手動編集後上書き禁止** - 定期実行で上書きされる。notes フィールドに手動修正記入

### テストチェックリスト
- [ ] ID 生成: `team_${Date.now()}_${random}` で生成、重複なし
- [ ] チャネル管理: UNIQUE 制約で重複登録禁止、削除で contact_channels 自動削除
- [ ] 重複検出: 同名・同メール・同 Slack user_id 検出
- [ ] マージ: source 削除、channels 付け替え、tags マージ
- [ ] Enrichment: Slack real_name 取得、Chatwork name 取得
- [ ] AI Context: 自動生成、返信下書き AI に注入
- [ ] linked_user_id: 自社メンバーのみドロップダウン、社内相談で使用

---

## 9. ナレッジ マスタ（KNOWLEDGE_MASTER）

### 概要
タスク・メッセージ・ビジネスイベントから自動抽出されたキーワードを一元管理。蓄積は全ユーザー共有（同キーワード 1 レコード）だが表示は個人フィルタ。週次 AI クラスタリングで領域・分野を自動提案。未確認ノード一括承認、手動 CRUD 対応。

### データフロー
```
キーワード自動抽出: extractKeywords()
  → confidence >= 0.7 のみ採用（最大 8）
  → knowledge_master_entries 新規作成（id: me_auto_${Date.now()}_${random}）
  → is_confirmed=false で待機状態

未確認ノード管理（UnconfirmedPanel）
  → is_confirmed=false 一覧表示
  → 一括承認: 全件を同じ category / domain / field に設定

週次 AI クラスタリング（毎週月曜 2:30）
  → 未確認 50 個以上で対象
  → knowledge_clustering_proposals 提案保存

クラスタリング承認:
  POST /api/knowledge/proposals/{id}/apply
    → domain / field 自動作成（存在チェック）
    → エントリ field_id / domain_id / is_confirmed=true 一括更新

TagCloud UI（This Week）
  → /api/nodes/this-week で週間キーワード取得
  → frequency に比例したフォントサイズ表示

My Knowledge Panel
  → period フィルタ（week/month/all）
  → ドメイン別ツリー、relatedTaskCount / relatedMessageCount バッジ表示

手動 CRUD（DomainTree）
  → 新規領域・分野・キーワード作成、編集、削除
  → FK CASCADE で子レコード自動削除
```

### 重要ルール / DO NOT

1. **knowledge_master_entries.id 自動生成頼らない** - TEXT 型・自動生成なし、手動生成で POST 必須
2. **field_id なしエントリを表示禁止** - 未分類フォルダに表示するが、クラスタリング承認まで待つ
3. **信頼度 < 0.7 キーワード採用禁止** - ノイズ増加、0.7 以上統一
4. **同週に複数提案実行禁止** - ISO 週ベースで 1 度のみ、複数は自動却下
5. **AI 提案すべて承認禁止** - ユーザー却下した提案は後続週で再提案。不要な領域は手動削除で対応

### テストチェックリスト
- [ ] ID 生成: `me_auto_` or `me_manual_` で生成、自動・手動で異なるプレフィックス
- [ ] 抽出・紐づけ: AI 会話毎に keyword 抽出、信頼度 >= 0.7、thought_task_nodes 紐づけ
- [ ] 未確認ノード: UnconfirmedPanel に is_confirmed=false 表示、一括承認で全件 true
- [ ] AI クラスタリング: 毎週月曜実行、50+ 未確認で提案、proposal status='pending' で秘書に表示
- [ ] 提案承認: domain/field 自動作成、エントリ field_id / domain_id 更新、同週の別提案自動却下
- [ ] TagCloud: /api/nodes/this-week から週間キーワード、frequency でフォントサイズ
- [ ] My Knowledge: period フィルタ、ドメイン別ツリー、relatedTaskCount バッジ
- [ ] CRUD: 領域・分野・キーワード作成・編集・削除、FK CASCADE で子自動削除

---

## クロスフィーチャー共通ルール

### 認証・権限
- **getServerSupabase()** をサービス層で使用（service role キー、キャッシュ付き）
- **getSupabase()** はフォールバック・クライアント側のみ（anon key、RLS 有効）
- **getServerUserId()** で ユーザーID 確認（401 なら即座に返却）

### 送信サービス関数
```typescript
sendEmail(to, subject, body, inReplyTo?, cc?)         // → Promise<boolean>
sendSlackMessage(channelId, text, threadTs?, userId?) // → Promise<boolean>
sendChatworkMessage(roomId, body)                     // → Promise<boolean>
```

### キャッシュ無効化
- 既読更新・mutation 直後に **cache.invalidateByPrefix** 実行
- キャッシュキー: `messages:page:${page}` / `tasks:${userId}` 等

### AI パーソナライズ
- **buildPersonalizedContext()** で性格タイプ・応答スタイル・思考傾向・オーナー方針を注入
- **getUserWritingStyle()** で過去送信 10 件から文体学習
- すべての AI エンドポイントに適用

### Phase A: 営業時間ルール
- **営業日**: 平日のみ（土日祝は除外）
- **営業時間**: 10:00〜19:00（`BUSINESS_HOURS` 定数で管理）
- **AI出力制限**: 10:00より前、19:00以降の時間帯を候補に出さない
- **ユーザー裁量**: 出力後にユーザーが手動変更するのは自由
- **適用箇所**: `findFreeSlots()` / 秘書AI日程調整 / 返信下書き（scheduleMode）/ タスク予定登録

### Phase A: カレンダー命名ルール
- **タスク予定**: `[NM-Task] タスク名`（`CALENDAR_PREFIX.task`）
- **ジョブ予定**: `[NM-Job] ジョブ名`（`CALENDAR_PREFIX.job`）
- **空き検索時**: `[NM-Task]`/`[NM-Job]` プレフィックス付き予定はスキップ（空きとみなす）
- **判定関数**: `isNodeMapEvent(summary)` で判定（`src/lib/constants.ts`）

### Phase A: 1チャンネル＝1プロジェクト
- **原則**: 1つのチャットグループ/チャンネル = 1つのプロジェクト
- **対象**: Slack/Chatworkのグループチャンネル
- **例外**: メール・LINEなど1:1のやり取りは手動紐づけ
- **実装**: `resolveProjectFromChannel()` で `project_channels` テーブルを検索
- **秘書intent**: `link_channel` で「このチャンネルを○○プロジェクトに紐づけて」に対応

### Phase A: 伸二メソッド思考プリセット
- **getShinjiMethodPrompt()** で思考フレームワークを生成
- **適用対象**: タスクAI会話（全フェーズ）、秘書チャット（ビジネス相談系intentのみ）
- **非適用**: 事務的intent（日程調整・インボックス要約等）
- **フレームワーク**: 階層思考（Why×5層）→ 飛び地（横方向連想）→ ストーリー化
- **対話スタイル**: 壁打ち型。「そもそも」「構造で見ると」等の表現

---

## 環境変数（必須）

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET
ENV_TOKEN_OWNER_ID
EMAIL_USER
SLACK_BOT_TOKEN
CHATWORK_API_TOKEN
GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI
```

---

## まとめ

NodeMap の 9 機能は密結合。タスク（TASK）が中核で、それを支えるカレンダー・インボックス・秘書 AI・Drive・思考マップ・コンタクト・ナレッジが衛星機能。各機能の重要ルール（DO NOT）を厳守し、テストチェックリストで検証を完全に。このドキュメントは **SSOT（Single Source of Truth）**。矛盾があれば報告してください。
