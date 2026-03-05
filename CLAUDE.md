# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-05（秘書ファースト Phase A〜C + Phase B拡張 + Calendar連携 + ブリーフィング強化 + Calendar×タスク/ジョブ統合 + Google Drive連携 + Drive実運用対応（Phase 44a-44d）+ マルチチャネル・URL・格納指示・ビジネスログ自動蓄積（Phase 45a-45c）+ ナレッジ自動構造化（Phase 47）+ バグ修正・機能強化（Phase 48）+ タスクページ改善・秘書タスク連携（Phase 49）+ タスクファイル添付・AI構想会話改善（Phase 50）+ データ連携強化（Phase 51）+ 組織自動レコメンド（Phase 52）+ 秘書AI総合改善（Phase 53）+ ナレッジページ改善（Phase 57）+ ジョブ再設計・社内相談・署名・文体学習・アカウント紐づけ（Phase 58/58a/58b）+ UX改善・インボックス高速化（Phase 59）まで反映）

---

## プロジェクト概要

**NodeMap** は「情報を受け取り → 整理し → 活用する」個人・チーム向けコミュニケーション＆ビジネスログツール。

- **フレームワーク**: Next.js 14 / TypeScript / Tailwind CSS
- **DB**: Supabase（PostgreSQL）
- **AI**: Claude API（claude-sonnet-4-5-20250929）
- **デプロイ**: Vercel（本番: https://node-map-eight.vercel.app）
- **リポジトリ**: https://github.com/nextstage2018/node_map.git
- **ローカル**: ~/Desktop/node_map_git

---

## 重要なテーブル仕様（必ず守ること）

| テーブル名 | 備考 |
|---|---|
| `contact_persons` | コンタクト本体。id は TEXT型（自動生成なし）→ 必ず `'team_${Date.now()}_${random}'` 等で生成して渡す。Phase 58b: linked_user_id UUID（NodeMapアカウントとの紐づけ。Supabase auth UID） |
| `contact_channels` | コンタクトの連絡先。UNIQUE(contact_id, channel, address) 制約あり |
| `inbox_messages` | メッセージ本体（受信＋送信）。user_id カラムは存在しない。direction カラムで送受信を区別（received/sent） |
| `unified_messages` | 現在は空。inbox_messages を使うこと |
| `organizations` | 自社・取引先組織。domain で重複チェック。relationship_type / address / phone / memo カラムあり |
| `organization_channels` | 組織に紐づくチャネル（Slack/CW/Email）。UNIQUE(organization_id, service_name, channel_id) |
| `projects` | プロジェクト。organization_id で組織に紐づく |
| `project_channels` | プロジェクトとチャネルの紐づけ。UNIQUE(project_id, service_name, channel_identifier) |
| `seeds` | 種ボックス（段階的廃止予定）。project_id で紐づけ可。user_id カラムあり |
| `tasks` | タスク。id は UUID型（DEFAULT gen_random_uuid()）。seed_id / project_id / task_type('personal'\|'group') カラムあり |
| `jobs` | ジョブ（AIに委ねる日常の簡易作業）。type='schedule'\|'reply'\|'check'\|'consult'\|'todo'\|'other'。status='pending'\|'approved'\|'executing'\|'consulting'\|'draft_ready'\|'done'\|'failed'。Phase B拡張: approved_at / executed_at / execution_log / reply_to_message_id / target_contact_id / target_address / target_name / execution_metadata カラム追加。Phase 58: ai_draft TEXT（AI生成下書き保存）追加 |
| `idea_memos` | アイデアメモ。断片的な思いつきを記録。tags TEXT[]。タスク変換機能なし |
| `memo_conversations` | メモのAI会話。turn_id で会話ターン管理 |
| `thought_task_nodes` | タスク/種とナレッジノードの紐づけ。UNIQUE(task_id, node_id) / UNIQUE(seed_id, node_id) |
| `thought_edges` | 思考動線。from_node_id→to_node_idの順序付きエッジ。UNIQUE(task_id, from_node_id, to_node_id) |
| `knowledge_master_entries` | ナレッジマスタ。Phase 42aで category / source_type / is_confirmed 等のカラム追加 |
| `drive_file_staging` | ファイル一時保管ステージング。status: pending_review→approved→uploaded / rejected / expired。AI分類結果（ai_document_type/ai_direction/ai_year_month/ai_suggested_name/ai_confidence）。ユーザー確定値（confirmed_*）。final_drive_file_id で最終配置追跡 |
| `drive_folders` | DriveフォルダマッピングPhase 44拡張: hierarchy_level 1-4（組織/プロジェクト/方向/年月）、direction/year_month カラム追加 |
| `drive_documents` | DriveドキュメントPhase 44拡張: direction/document_type/year_month/original_file_name カラム追加 |
| `thought_snapshots` | Phase 42e: タスクのスナップショット。snapshot_type = 'initial_goal' / 'final_landing'。node_ids TEXT[] |
| `task_members` | グループタスクのメンバー管理。UNIQUE(task_id, user_id)。role='owner'/'member'。calendar_event_idでメンバーごとのカレンダー予定を追跡 |
| `contact_patterns` | Phase 51: コンタクトパターン分析。連絡頻度・最終連絡・推奨アクション。日次Cron compute-patterns で自動計算 |
| `secretary_conversations` | Phase 53: 秘書チャット会話永続化。role='user'/'assistant'。cards JSONB。AIコンテキスト用（UI復元はしない） |
| `consultations` | Phase 58: 社内相談。job_id / requester_user_id / responder_user_id / responder_contact_id / source_message_id / source_channel / thread_summary / question / answer / status('pending'\|'answered') / answered_at。回答時にAI返信文面を自動生成 |

---

## 画面・ルート一覧

| 画面 | URL | 主なテーブル |
|---|---|---|
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks / task_conversations |
| ジョブ | /jobs | jobs / consultations |
| アイデアメモ | /memos | idea_memos / memo_conversations |
| 思考マップ | /thought-map | thought_task_nodes / thought_edges / knowledge_master_entries |
| コンタクト | /contacts | contact_persons / contact_channels |
| 組織 | /organizations | organizations / organization_channels |
| 組織詳細 | /organizations/[id] | organizations / organization_channels / contact_persons |
| ナレッジ | /master | knowledge_domains / knowledge_fields / knowledge_master_entries |
| ビジネスログ | /business-log | projects / business_events / project_channels |
| 秘書 | /agent | tasks / seeds / user_nodes（読み取り専用） |
| 種ボックス（廃止予定） | /seeds | seeds |
| 設定 | /settings | organizations / contact_persons / projects |

---

## API パターン（既存コードに必ず合わせること）

```typescript
// 認証
import { getServerUserId } from '@/lib/serverAuth';
const userId = await getServerUserId();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// レスポンス
return NextResponse.json({ success: true, data: result });
return NextResponse.json({ error: 'message' }, { status: 400 });
```

### Supabase クライアントの使い分け（重要）
```typescript
import { getSupabase, getServerSupabase, createServerClient } from '@/lib/supabase';

// getServerSupabase() → service role key（キャッシュ付きシングルトン）。★ サービス層では基本これを使う
// getSupabase() → anon key。RLSの影響を受ける。クライアントサイドやフォールバック用
// createServerClient() → service role key（毎回新規生成）。特殊ケースのみ

// ★重要: TaskService など サーバーサイドのサービス層では getServerSupabase() || getSupabase() を使用
// Phase 41 で全メソッドをこのパターンに統一済み（RLSバイパス）
```

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

### 変更ファイル一覧
- `src/app/jobs/page.tsx` — 完了アーカイブタブ
- `src/app/api/memos/[id]/convert/route.ts` — メモ→タスク変換API
- `src/app/memos/page.tsx` — メモページUI
- `src/app/api/messages/route.ts` — 受信条件改善＋高速化
- `src/app/api/messages/read/route.ts` — 既読キャッシュ無効化
- `src/hooks/useMessages.ts` — クライアント既読保持

### 重要な実装ノート
- **メモ→タスク変換のAIフォールバック**: ANTHROPIC_API_KEYなし時はメモ内容をそのままタスクタイトル・説明に使用
- **トークンベース取得**: 環境変数（EMAIL_USER等）とDBトークン（user_service_tokens）の両方をチェック。どちらかがあれば取得可能
- **差分取得バックグラウンド化の安全性**: `saveMessages` が既存の `is_read=true` を保持する（Phase 25の既存ロジック）ため、バックグラウンド保存で既読が上書きされることはない
- **サーバーキャッシュ無効化のタイミング**: 既読API（/api/messages/read）と差分取得バックグラウンド（fetchDiffInBackground）の両方でキャッシュを無効化

---


---

## コンタクトAPI完成（Phase 35完了）

### 概要
コンタクトページのUIに対応する不足API 5件を実装し、全機能を動作可能にした。

### 新規ファイル
- `src/app/api/contacts/duplicates/route.ts` — 重複検出API（同名・同アドレスでグループ化）
- `src/app/api/contacts/merge/route.ts` — コンタクトマージAPI（チャンネル統合→元コンタクト削除）
- `src/app/api/contacts/[id]/channels/route.ts` — チャネル追加API（UNIQUE制約で重複防止）
- `src/app/api/contacts/[id]/tasks/route.ts` — 関連タスク取得API（組織→プロジェクト→タスク経由）
- `src/app/api/contacts/enrich/route.ts` — プロフィール自動取得API（Slack users.info / Chatwork contacts）

### AI コンテキストへの影響
| 項目 | 影響 |
|---|---|
| コンタクトチャンネル統合 | マージにより1人のコンタクトに全チャンネルが集約 → 返信下書きAIが全チャネルの過去やり取りを参照可能に |
| プロフィール自動取得 | Slack/Chatworkから名前・部署・会社名を補完 → AI返信の宛名・敬称が正確に |
| 関連タスク表示 | コンタクト→組織→プロジェクト→タスクの紐づけ → 秘書AIのブリーフィングでコンタクト文脈が豊かに |

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

#### 社内相談フロー
```
インボックスでメッセージ閲覧 → 「💬 社内相談」選択
  → 相談相手（自社組織メンバー）をプルダウン選択
  → 相談内容を入力 → 送信
  → AI structure-job でスレッド要約自動生成
  → jobs(type='consult', status='consulting') + consultations(status='pending') 登録
  → 相談相手のジョブページに「あなた宛ての相談」バナー表示
  → 相談相手が回答入力 → POST /api/consultations
    → AIが回答を踏まえた返信文面を自動生成
    → jobs.ai_draft に保存、status='draft_ready'
    → 依頼者がジョブページで下書きを確認・編集・送信
```

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

#### 紐づけフロー
```
組織詳細ページ（自社組織）→ メンバー一覧
  → 各メンバーに「NodeMapアカウント」ドロップダウン表示
  → Supabase authのユーザー一覧から選択
  → PATCH /api/organizations/[id]/members で linked_user_id 保存
  → 社内相談時に linked_user_id → consultations.responder_user_id に使用
  → 相手の秘書ブリーフィングに相談が表示される
```

#### 重要な実装ノート
- **auth.admin.listUsers()**: SUPABASE_SERVICE_ROLE_KEY が必要（createClient で直接使用）
- **自社組織のみ**: アカウント紐づけUIは relationship_type='self' の組織のみ表示
- **未紐づけメンバー**: 相談相手として選択不可（disabled表示 +「アカウント未紐づけ」注記）

---

## Phase 57 実装内容（ナレッジページ改善）

### 概要
ナレッジページ（/master）を「管理用CRUDページ」から「個人の知識地図」に改善。タスク・メッセージ・ビジネスイベントから自動抽出されたキーワードを、今週のタグクラウド＋カテゴリ別マイナレッジとして表示。蓄積は全ユーザー共有、表示は個人フィルタ。

### 設計思想
- **蓄積は共有**: `knowledge_master_entries` は全ユーザー共通。同じキーワードは1レコード
- **表示は個人**: `thought_task_nodes.user_id` でフィルタし、個人の知識地図として表示
- **構造化は半自動**: キーワード50個超で週次AIクラスタリング提案 → 秘書から承認するだけ

### DBマイグレーション（Supabase実行済み）
```sql
-- 058_business_events_keywords.sql
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS keywords_extracted BOOLEAN DEFAULT false;
```

### 新規ファイル
- `src/app/api/nodes/this-week/route.ts` — 今週のキーワードAPI（月曜起算、frequency・category・color付き）
- `src/app/api/nodes/my-keywords/route.ts` — マイナレッジAPI（period=week/month/all、domain/field階層集計）
- `src/components/master/ThisWeekTagCloud.tsx` — 今週のタグクラウドUI（頻度ベースフォントサイズ、クリックで詳細表示）
- `src/components/master/MyKnowledgePanel.tsx` — マイナレッジパネルUI（ドメイン別折りたたみツリー、NodeChipにタスク/メッセージバッジ）
- `supabase/migrations/058_business_events_keywords.sql` — business_events.keywords_extracted追加

### 変更ファイル
- `src/app/master/page.tsx` — ThisWeekTagCloud＋MyKnowledgePanelを既存タブの上に配置、subtitleを「個人の知識地図」に変更
- `src/components/master/MasterStats.tsx` — 4つの統計カードに解説文追加
- `src/app/api/cron/sync-business-events/route.ts` — イベント作成後にキーワード抽出追加＋既存未抽出イベントのバッチ処理（最大20件/回）

### ページ構成（上から順に）
```
/master ページ
  → 今週のタグクラウド（ThisWeekTagCloud）
    - 頻度ベースのフォントサイズ（11px〜25px）
    - ドメインカラーで色分け
    - クリックで出現回数・関連タスク/種数を表示
  → マイナレッジ（MyKnowledgePanel）
    - 週間/月間/全期間の期間フィルタ
    - ドメイン別折りたたみツリー → フィールド → キーワードチップ
    - チップにタスク数（青）/メッセージ数（緑）バッジ
  → 未確認ノードパネル（既存）
  → 階層構造（管理）タブ / AI提案履歴タブ（既存）
    - 統計カード4枚に解説文追加
```

### APIエンドポイント
```
GET /api/nodes/this-week
→ { weekStart, weekEnd, nodes: [{id, label, frequency, relatedTaskIds, relatedSeedIds, category, color}] }

GET /api/nodes/my-keywords?period=week|month|all
→ { nodes: [{id, label, domainId, domainName, domainColor, fieldId, fieldName, relatedTaskCount, relatedMessageCount}], domainStats: [{domainId, domainName, domainColor, nodeCount, fields}], totalNodes, period }
```

### 重要な実装ノート
- **getUserOverviewMapパターン再利用**: my-keywords APIはthought-map APIの `nodeMap` + `nodeTaskMap` パターンでノード重複排除＋集計
- **ビジネスイベントキーワード抽出**: `ThoughtNodeService.extractAndLinkFromMessage()` を再利用。新規イベント作成時＋既存未抽出イベント（20件/回）の両方を処理
- **keywords_extracted フラグ**: 再処理防止。NULLまたはfalseのイベントのみ抽出対象

---

## Phase 53 実装内容（秘書AI総合改善）

### 概要
秘書AIを「自然会話で全操作が完結する」主要インターフェースに強化。会話永続化・コンテキスト拡張・CRUD操作のインライン化・UI改善を実施。

### DBマイグレーション（Supabase実行済み）
```sql
-- 042_secretary_conversations.sql
CREATE TABLE IF NOT EXISTS secretary_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  cards JSONB,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 新規ファイル
- `supabase/migrations/042_secretary_conversations.sql` — 秘書チャット会話永続化テーブル
- `src/app/api/agent/conversations/route.ts` — 会話保存/読込/クリアAPI（GET/POST/DELETE）
- `src/services/analytics/contactPattern.service.ts` — Phase 51: コンタクトパターン分析サービス
- `src/services/analytics/orgRecommendation.service.ts` — Phase 52: 組織自動レコメンドサービス
- `src/app/api/cron/compute-patterns/route.ts` — Phase 51: パターン計算日次Cron
- `src/app/api/organizations/auto-setup/route.ts` — Phase 52: 組織候補取得＋ワンクリック作成API

### 変更ファイル
- `src/app/api/agent/chat/route.ts` — 新規intent追加（create_contact/search_contact/create_organization/create_project/message_detail/pattern_analysis/knowledge_reuse/setup_organization）＋コンテキスト15→30拡大＋カレンダー終日予定除外＋message_detail DBハンドラー
- `src/app/api/contacts/route.ts` — POST ハンドラー追加（秘書からのコンタクト新規作成＋組織自動マッチング＋チャネル登録）
- `src/app/api/messages/route.ts` — ID指定の単一メッセージ取得追加（DB直接参照）
- `src/components/secretary/ChatCards.tsx` — 新カード: ContactFormCard/ContactSearchResultCard/OrgFormCard/ProjectFormCard/OrgRecommendationCard＋CardRenderer防御強化（null/undefinedガード）＋MessageDetailCard折りたたみUI
- `src/components/secretary/SecretaryChat.tsx` — ダッシュボード初期画面（自動ブリーフィング廃止）＋会話DB保存（AIコンテキスト用）＋smartTruncateHistory＋select_message DB直接取得＋linkifyText防御＋新アクション（submit_contact_form/submit_project_form/submit_org_form）
- `vercel.json` — compute-patterns Cron追加

### 秘書ダッシュボード（初期画面）
```
/agent ページ読込時
  → ダッシュボード表示（自動ブリーフィングしない）
  → メインアクション4つ（大きめカード: 今日やること/プロジェクト確認/タスク作成/タスク進める）
  → その他アクション（小チップ: メッセージ/ジョブ/予定/ファイル/ナレッジ等）
  → ユーザーがチップ選択 or 自由入力で会話開始
```

### メッセージ詳細の表示フロー
```
InboxSummaryCard でメッセージをクリック
  → select_message アクション発火
  → GET /api/messages?id=xxx でDB直接取得
  → MessageDetailCard をチャットに追加（返信/ジョブ化/タスク化ボタン付き）
  → 長文は折りたたみ表示（200文字/6行以上で省略＋「全文を表示」ボタン）
  → 既読マーク自動付与
```

### カレンダー終日予定の除外
- ブリーフィングのcalendar_eventsカード: 終日予定を除外（時刻付き予定のみ表示）
- todayEventCount: 終日予定を除外してカウント
- nextEvent計算: 既に終日予定は除外済み（変更なし）
- findFreeSlots: 既に終日予定は除外済み（変更なし）

### 新規intent一覧（Phase 51-53追加分）
| Intent | トリガーキーワード | 生成されるカード/動作 |
|---|---|---|
| create_contact | コンタクト+登録/追加、連絡先+登録 | contact_form カード |
| search_contact | コンタクト+検索/情報、○○さんの情報 | contact_search_result カード |
| create_organization | 組織+新規/新しい | org_form カード |
| create_project | プロジェクト+作成/追加/新規 | project_form カード |
| message_detail | メッセージID:xxx、詳細+見せて | message_detail カード（DB直接取得） |
| pattern_analysis | 傾向/パターン/振り返り | テキスト応答 |
| knowledge_reuse | 前回/この前/以前/似たような | テキスト応答 |
| setup_organization | 組織+設定/登録/整理 | org_recommendation カード |

### 重要な実装ノート
- **会話永続化はAIコンテキスト用**: DBに保存するがUI復元はしない。毎回ダッシュボードからスタート
- **smartTruncateHistory**: 30メッセージ超の場合、古い会話を1行要約に圧縮してトークン節約
- **CardRenderer防御**: card/type/dataがnullの場合にnullを返す（クラッシュ防止）
- **/api/contacts POST**: contact_persons.idはTEXT型→手動生成必須。メールドメインから組織自動マッチング

---

## Phase 52 実装内容（組織自動レコメンド）

### 概要
メッセージ履歴のメールドメインを集計し、未登録の組織候補を自動検出。秘書ブリーフィングまたは「組織を整理」で候補を表示し、ワンクリックで組織セットアップ。

### 新規ファイル
- `src/services/analytics/orgRecommendation.service.ts` — ドメイン集計→未登録組織候補検出→候補スコアリング
- `src/app/api/organizations/auto-setup/route.ts` — GET: 候補一覧、POST: ワンクリック組織作成（organizations + organization_channels + コンタクト紐づけ）

### 変更ファイル
- `src/app/api/agent/chat/route.ts` — setup_organization intent＋ブリーフィングにorgRecommendations追加
- `src/components/secretary/ChatCards.tsx` — OrgRecommendationCard（候補一覧＋関係性選択＋セットアップボタン）
- `src/components/secretary/SecretaryChat.tsx` — create_org/skip_org アクション

---

## Phase 51 実装内容（データ連携強化）

### 概要
使うほど賢くなるシステムの基盤。コンタクトパターン分析（連絡頻度・推奨アクション）、メモ→種変換、コンタクト関連タスク表示。

### DBマイグレーション（Supabase実行済み）
```sql
-- 051a_data_connectivity.sql
-- contact_patterns テーブル（連絡頻度・パターン分析結果）
```

### 新規ファイル
- `src/services/analytics/contactPattern.service.ts` — パターン計算（メッセージ頻度・最終連絡・推奨アクション生成）
- `src/app/api/cron/compute-patterns/route.ts` — 日次Cron（毎日3:00）
- `src/app/api/contacts/[id]/tasks/route.ts` — コンタクト関連タスク取得
- `src/app/api/memos/[id]/convert/route.ts` — メモ→種変換API

### 変更ファイル
- `src/app/contacts/page.tsx` — タスク一覧表示追加
- `src/app/memos/page.tsx` — 種変換ボタン追加
- `src/components/inbox/MessageDetail.tsx` — パターン情報表示
- `src/app/api/tasks/route.ts` — contact_id対応
- `vercel.json` — compute-patterns Cron追加

---

## Phase 50 実装内容（タスクファイル添付・AI構想会話改善）

### 概要
タスク詳細画面からファイルをアップロードしてプロジェクトのGoogleDriveフォルダに格納する機能を追加。タスク完了時のビジネスログアーカイブにドキュメントURLも記載。また、AI構想会話の品質向上（進行状況検出・プロンプト改善）とフェーズ遷移時のステータス自動変更を実装。

### DBマイグレーション（要Supabase実行）
```sql
-- 040_task_file_linking.sql
ALTER TABLE drive_documents
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drive_docs_task ON drive_documents(task_id);
```

### 新規ファイル
- `supabase/migrations/040_task_file_linking.sql` — drive_documentsにtask_idカラム追加
- `src/app/api/tasks/[id]/files/route.ts` — タスクファイル一覧(GET) + 切り離し(PATCH)
- `src/components/tasks/TaskFileUploadPanel.tsx` — タスク用コンパクトファイルアップロードUI（Resumable Upload方式）

### 変更ファイル
- `src/app/api/drive/upload/complete/route.ts` — taskIdパラメータ対応（drive_documents登録時にtask_id設定）
- `src/components/tasks/TaskDetail.tsx` — 📎ドキュメントセクション追加（ファイル一覧・アップロードパネル・ファイル切り離し）
- `src/services/task/taskClient.service.ts` — archiveTaskToBusinessLogにドキュメントURL記載追加＋会話ログ保全
- `src/services/ai/aiClient.service.ts` — AI構想会話プロンプト改善（coveredItems検出・進行状況注入・繰り返し防止）
- `src/components/tasks/TaskAiChat.tsx` — 構想進捗トラッカーUI（4項目検出＋プログレスバー）＋フェーズ遷移時status='in_progress'自動設定
- `src/app/api/tasks/chat/route.ts` — プロジェクト/組織コンテキスト取得をAI会話に渡す

### タスクファイルアップロードのフロー
```
TaskDetail 📎セクション → 「+ 追加」ボタン
  → TaskFileUploadPanel表示（ドラッグ&ドロップ / クリック選択）
  → 書類種別選択（提案書・見積書・契約書 etc.）
  → Step1: POST /api/drive/upload（taskId付き、resumable URL生成）
  → Step2: ブラウザ → Google Drive API に直接PUT
  → Step3: POST /api/drive/upload/complete（task_id付きでdrive_documents登録）
  → ファイル一覧に表示（名前・種別・Driveリンク・切り離しボタン）
```

### ビジネスログアーカイブの強化
```
タスク完了時 → archiveTaskToBusinessLog()
  → 構想メモ（ideation_summary）
  → 結果要約（result_summary）
  → 📎 関連ドキュメント（drive_documentsからtask_id一致のファイル名+URL）
  → 📝 会話ログ（task_conversationsの全会話をフェーズ付きで記録）
  → business_events に一括保存
  → タスク削除（FK CASCADEで関連データも削除、ドキュメントはON DELETE SET NULLで残存）
```

### AI構想会話の改善
- **進行状況検出**: 会話履歴からキーワードマッチで議論済み項目（ゴール/内容/気になる点/期限）を自動検出
- **プロンプト注入**: 「会話の進行状況」セクションをシステムプロンプトに動的追加。既に議論した項目を繰り返さない指示
- **プログレスバーUI**: 4項目の達成状況を視覚的に表示。全項目完了で「進行フェーズへ」ボタン表示
- **フェーズ遷移時status変更**: 構想→進行フェーズ移行時にstatus='in_progress'を自動設定（カンバンの「進行中」列に移動）

### 重要な実装ノート
- **ON DELETE SET NULL**: drive_documents.task_idはタスク削除時にNULLになる（ファイル自体はDriveに残存）
- **プロジェクト必須**: ファイルアップロードはproject_idが設定されているタスクのみ可能（Driveフォルダ構造がプロジェクト基盤のため）
- **Resumable Upload再利用**: 秘書チャットの既存アップロード基盤（3段階方式）をそのまま活用
- **coveredItems検出**: 正規表現ベースの軽量検出。AIのJSON解析ではなくキーワードマッチで高速・確実

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

### 秘書チャットからタスク作成・進行

**新規intent（agent/chat/route.ts）**:
- `create_task`: 「タスクを作成して」「新しいタスクを追加」等。AIがメッセージからタイトル・優先度・プロジェクトを自動推定
- `task_progress`: 「タスクを進めたい」「タスクについて相談」等。AIがタスクを特定して進行カードを表示

**新規カード（ChatCards.tsx）**:
- `TaskFormCard`: タイトル・説明・優先度・プロジェクト・期限の入力フォーム。作成ボタンで `/api/tasks` POST
- `TaskProgressCard`: タスク状態表示・最近の会話履歴・AIへの相談入力欄。タスクページへの遷移ボタン

**アクション（SecretaryChat.tsx）**:
- `submit_task_form`: フォーム送信 → `/api/tasks` POST → TaskCreatedCard表示
- `task_chat`: AIに相談 → `/api/tasks/chat` POST → 回答をチャットに表示
- サジェストチップに「タスクを作成」「タスクを進める」追加

### 変更ファイル
- `src/lib/constants.ts` — SVGパスアイコン → 絵文字に変更
- `src/services/task/taskClient.service.ts` — deleteTask / archiveTaskToBusinessLog 追加
- `src/app/api/tasks/route.ts` — DELETE ハンドラー追加、PUT で完了時アーカイブ＋削除
- `src/components/tasks/TaskDetail.tsx` — 削除ボタン＋確認モーダル＋完了ボタン
- `src/components/tasks/TaskAiChat.tsx` — Enter送信無効化＋自動リサイズ
- `src/app/tasks/page.tsx` — 2カラムカンバン（done列除去）＋onDelete
- `src/app/api/agent/chat/route.ts` — create_task / task_progress intent＋ハンドラー追加
- `src/components/secretary/ChatCards.tsx` — TaskFormCard / TaskProgressCard＋CardRenderer登録
- `src/components/secretary/SecretaryChat.tsx` — submit_task_form / task_chat アクション＋サジェストチップ

### 重要な実装ノート
- **アーカイブ→削除**: 完了時はまずbusiness_eventsに記録してからtasksを削除。FK CASCADEで関連テーブル（task_conversations, thought_task_nodes等）も自動削除
- **IME対策**: Enter送信を完全無効化し、送信ボタンのみで送信。日本語入力の変換確定でメッセージが誤送信される問題を解消
- **タスク進行のAI推定**: ユーザーメッセージにタスク名が含まれていない場合、Claude APIでタスク一覧から最も関連するものを推定

---

## Phase 48 実装内容（バグ修正・機能強化・ファイルアップロード）

### 概要
複数のバグ修正と機能強化を実施。セットアップウィザード修正、秘書チャットの各種intent追加（カレンダー予定作成・Driveフォルダ作成・プロジェクト一覧）、URLリンク化、プロジェクトメンバー表示、秘書チャットからのファイルアップロード機能を実装。

### 主な変更点

**セットアップウィザード修正**:
- 組織作成時のバリデーション修正

**秘書サジェストチップ改善**:
- 「今日やること」「プロジェクトを確認」「タスクを進める」をトップ3に変更

**Drive/Calendarスコープチェック**:
- `isCalendarConnected()`: `token.scope.includes('calendar')` チェック追加
- `isDriveConnected()`: `scope.includes('drive.file')` チェック追加（空scopeバグ修正）

**新規intent追加（agent/chat/route.ts）**:
- `projects`: プロジェクト一覧表示（「プロジェクト一覧」「プロジェクトを確認」）
- `create_calendar_event`: カレンダー予定作成（「予定+追加/登録/入れて」）。Claude APIで自然言語から日時パース
- `create_drive_folder`: Driveフォルダ作成（「フォルダ/ドライブ+作成/追加」）。プロジェクト自動検出、`[NodeMap] 組織名 / プロジェクト名` 命名、`drive_folders`登録、共有リンク設定

**URLリンク化（SecretaryChat.tsx）**:
- `linkifyText()` 関数: Markdown形式 `[text](url)` と 生URL の両方に対応
- 末尾の日本語記号（。、）等）を除去して正しいURLを生成

**プロジェクトメンバー表示**:
- `ProjectSidebar.tsx`: メンバー一覧 + Driveフォルダリンク表示
- `contacts/page.tsx`: コンタクト詳細にプロジェクト一覧表示
- `/api/project-members`: GET（contact_id/project_id）+ DELETE対応

**秘書ファイルアップロード（Resumable Upload方式）**:
- 📎ボタンからアップロードパネルを開く
- ドラッグ&ドロップ or クリックでファイル選択
- プロジェクト / 書類種別（提案書・見積書・契約書 etc.）/ 方向（提出・受領）/ メモ
- 命名規則: `YYYY-MM-DD_種別_元ファイル名.拡張子`

### ファイルアップロードのアーキテクチャ（Vercelサイズ制限回避）
```
【3段階方式】
Step 1: POST /api/drive/upload （JSONのみ、ファイル本体なし）
  → フォルダ準備（4階層: 組織/プロジェクト/方向/年月）
  → Google Drive Resumable Upload Session URL生成
  → uploadUrl + metadata を返却

Step 2: クライアント → Google Drive API に直接PUT
  → ブラウザからresumable URLにファイル送信
  → Vercelを経由しないのでサイズ制限なし
  → CORS制約でレスポンスが読めない場合あり（想定内）

Step 3: POST /api/drive/upload/complete
  → driveFileId があればそのまま使用
  → なければサーバー側でDrive APIファイル名検索
  → drive_documents + business_events にDB登録
```

### 新規ファイル
- `src/app/api/drive/upload/route.ts` — アップロード準備API（POST: resumable URL生成、GET: プロジェクト一覧）
- `src/app/api/drive/upload/complete/route.ts` — アップロード完了DB登録API（サーバー側ファイル検索対応）

### 変更ファイル
- `src/components/secretary/SecretaryChat.tsx` — FileUploadPanel追加、📎ボタン、linkifyText、サジェストチップ改善
- `src/app/api/agent/chat/route.ts` — projects/create_calendar_event/create_drive_folder intent追加
- `src/services/calendar/calendarClient.service.ts` — isCalendarConnected スコープチェック
- `src/services/drive/driveClient.service.ts` — isDriveConnected スコープチェック
- `src/app/api/project-members/route.ts` — GET(contact_id対応) + DELETE追加
- `src/components/business-log/ProjectSidebar.tsx` — メンバー + Driveリンク表示
- `src/app/contacts/page.tsx` — プロジェクト一覧表示
- `next.config.mjs` — serverActions.bodySizeLimit追加
- `vercel.json` — upload関数のmaxDuration/memory設定

### 重要な実装ノート
- **Resumable Upload**: Vercelの4.5MBボディサイズ制限を回避するため、ファイルはVercelを経由せずブラウザからGoogle Driveに直接アップロード
- **CORS対応**: ブラウザからGoogle Drive APIへのPUTはCORS制約でレスポンスが読めない場合がある → complete APIでサーバー側がファイル名検索で対応
- **accessToken返却**: upload APIがクライアントにアクセストークンを返却（resumable URLに含まれるため実質不要だが互換性のため）

---

## Phase 47 実装内容（ナレッジ自動構造化）

### 概要
蓄積されたキーワード（knowledge_master_entries）をAIが週次でクラスタリングし、領域/分野の構造を自動提案。秘書チャットまたは/masterページから承認/却下するフロー。手動での領域/分野設定を不要にする。

### DBマイグレーション（要Supabase実行）
```sql
-- 037_phase47_knowledge_auto_structure.sql
CREATE TABLE knowledge_clustering_proposals (提案管理);
ALTER TABLE knowledge_master_entries ADD COLUMN created_via TEXT DEFAULT 'manual';
```

### 新規ファイル
- `supabase/migrations/037_phase47_knowledge_auto_structure.sql` — DBスキーマ
- `src/services/nodemap/knowledgeClustering.service.ts` — クラスタリングサービス（AIクラスタリング＋提案CRUD＋承認/却下）
- `src/app/api/cron/cluster-knowledge-weekly/route.ts` — 週次Cron（毎週月曜2:30）
- `src/app/api/knowledge/proposals/route.ts` — 提案一覧/手動生成API
- `src/app/api/knowledge/proposals/[id]/apply/route.ts` — 提案承認API
- `src/app/api/knowledge/proposals/[id]/reject/route.ts` — 提案却下API

### 変更ファイル
- `src/app/api/agent/chat/route.ts` — `knowledge_structuring` intent追加、ブリーフィングにpendingKnowledgeProposals追加
- `src/components/secretary/ChatCards.tsx` — `KnowledgeProposalCard` コンポーネント追加、BriefingSummaryCardにナレッジ提案数追加
- `src/components/secretary/SecretaryChat.tsx` — approve/reject_knowledge_proposal アクション追加、「ナレッジ提案」サジェストチップ追加
- `src/app/master/page.tsx` — 「AI提案履歴」タブ追加、待機中提案バッジ表示
- `vercel.json` — cluster-knowledge-weekly Cron追加

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

### 重要な実装ノート
- **AIフォールバック**: ANTHROPIC_API_KEYなし時はカテゴリベース簡易分類
- **ISO週番号で重複防止**: 同じ週に同じユーザーの提案は1回のみ
- **最低5個**: 未確認キーワードが5個未満なら提案生成しない
- **既存構造参照**: AIに既存の領域/分野をコンテキストとして渡し、整合性を保つ

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

### ナレッジ改善

**新規ファイル**:
- `src/components/master/UnconfirmedPanel.tsx` — 未確認ノード管理パネル（一括承認・個別承認・削除）

**変更ファイル**:
- `src/components/master/DomainTree.tsx` — CRUD対応に全面改修（領域/分野/キーワードの追加・編集・削除、インラインフォーム、同義語編集、関連タスク表示）
- `src/app/master/page.tsx` — UnconfirmedPanel追加、onDataChangedによるデータ再読み込み対応
- `src/app/api/master/domains/route.ts` — PUT/DELETE追加
- `src/app/api/master/fields/route.ts` — PUT/DELETE追加
- `src/app/api/master/entries/route.ts` — POST/PUT/DELETE追加
- `src/services/nodemap/knowledgeMaster.service.ts` — updateDomain/deleteDomain/updateField/deleteField/addEntry/updateEntry/deleteEntry メソッド追加
- `src/app/api/nodes/thought/route.ts` — entryIdパラメータ対応（ナレッジエントリに紐づくタスク/種を返す）
- `src/services/nodemap/thoughtNode.service.ts` — getTasksByEntryId メソッド追加

### 重要な実装ノート
- **BusinessEvent型拡張**: ai_generated/summary_period/source_message_id/source_channel/event_date/contact_persons/projects を追加
- **EVENT_TYPE_CONFIG拡張**: document_received/document_submitted/summary を追加（AI自動生成イベント用）
- **キーワード手動登録**: IDは `me_manual_${Date.now()}_${random}` で生成、is_confirmed=true（手動登録は即確認済み）
- **DomainTree onDataChanged**: CRUD操作後にpage.tsxのfetchDataを呼び出してデータを再読み込み

---

## Phase 45a-45c 実装内容（マルチチャネル・URL・格納指示・ビジネスログ自動蓄積）

### 概要
Drive連携を全チャネル（Email/Slack/Chatwork）に拡張し、本文中のGoogle Docs/Sheets/Drive URLも自動検出・記録。秘書から「このURLを格納して」と指示できるフロー。ビジネスイベントをメッセージ・ドキュメント・会議から自動蓄積し、AI週間要約を自動生成。

### Phase 45a: URL検出 + 全チャネル対応
**DBマイグレーション**: `035_phase45a_url_and_multichannel.sql`
- `drive_documents` に `link_type TEXT` / `link_url TEXT` カラム追加
- `drive_file_staging` に `source_channel TEXT DEFAULT 'email'` 追加

**新規・変更ファイル**:
- `src/services/drive/driveClient.service.ts` — `extractUrlsFromText()`, `recordDocumentLink()`, `detectOrgProjectFromChannel()`, `downloadSlackFile()`, `downloadChatworkFile()` 追加。`saveStagingFile()` に `sourceChannel` パラメータ追加
- `src/app/api/cron/sync-drive-documents/route.ts` — 全面改修: `.eq('channel','email')` → `.in('channel',['email','slack','chatwork'])`、チャネル別ファイルDL、URL検出、共通processAttachment関数

**URL検出パターン**: Google Sheets, Google Docs, Google Drive open, Google Drive file

### Phase 45b: 秘書ファイル格納指示
**新規ファイル**:
- `src/app/api/drive/store-file/route.ts` — URLを受け取り → リンク情報抽出 → drive_documents登録

**変更ファイル**:
- `src/app/api/agent/chat/route.ts` — `store_file` intent追加（キーワード: 格納/保存+ドライブ/フォルダ、入れて+フォルダ/ドライブ）。組織/プロジェクト選択データを含む`storage_confirmation`カード生成
- `src/components/secretary/ChatCards.tsx` — `StorageConfirmationCard` コンポーネント追加（組織/プロジェクト選択、書類種別、方向、年月ピッカー、格納ボタン）
- `src/components/secretary/SecretaryChat.tsx` — `confirm_storage` アクション追加（store-file API呼び出し）

### Phase 45c: ビジネスイベント自動蓄積 + AI週間要約
**DBマイグレーション**: `036_phase45c_business_auto_accumulate.sql`
- `business_events` に `source_message_id`, `source_channel`, `ai_generated`, `summary_period`, `event_date`, `source_document_id` カラム追加

**新規ファイル**:
- `src/app/api/cron/sync-business-events/route.ts` — 日次Cron。過去24時間のinbox_messagesからビジネスイベント自動生成（source_message_idで重複防止）。チャネル→プロジェクト→コンタクト自動推定
- `src/app/api/cron/summarize-business-log/route.ts` — 週次Cron（毎週月曜）。プロジェクトごとに過去1週間のイベントをClaude APIで要約。ISO週番号で重複防止。APIなし時はテンプレートフォールバック

**変更ファイル**:
- `src/app/api/agent/chat/route.ts` — `business_summary` intent追加（活動+要約/まとめ/サマリー、週間+レポート/報告、プロジェクト+状況/進捗）。business_eventsからAI要約取得→BusinessSummaryCard生成
- `src/components/secretary/ChatCards.tsx` — `BusinessSummaryCard` コンポーネント追加（プロジェクトごとの要約を折りたたみ表示）
- `src/components/secretary/SecretaryChat.tsx` — 「活動要約」サジェストチップ追加
- `src/app/api/drive/files/intake/[id]/approve/route.ts` — 承認時にbusiness_eventsに`document_received`/`document_submitted`イベント自動記録
- `vercel.json` — `sync-business-events`（毎日1:00）+ `summarize-business-log`（毎週月曜2:00）Cron追加

### 重要な実装ノート
- **URL検出はCron+手動両対応**: Cronバッチで本文URLを自動検出 & 秘書の格納指示で手動登録
- **Slack/Chatworkファイル**: Slack=files.info API+Bearer DL、Chatwork=files/{id}?create_download_url=1
- **detectOrgProjectFromChannel**: project_channels→projects→organizationsのJOINで一括推定
- **ビジネスイベント重複防止**: source_message_idで既存チェック、ISO週番号で要約重複防止
- **AI要約フォールバック**: ANTHROPIC_API_KEYなし時はテンプレートベース要約（カテゴリ別件数）

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

### DBマイグレーション（要Supabase実行）
```sql
-- 034_phase44a_drive_file_intake.sql
-- drive_folders拡張: direction, year_month カラム追加（4階層: 組織/プロジェクト/方向/年月）
-- drive_file_staging テーブル新設（ステージング管理、AI分類結果、承認フロー）
-- drive_documents拡張: direction, document_type, year_month, original_file_name 追加
```

### 新規ファイル
- `supabase/migrations/034_phase44a_drive_file_intake.sql` — DBスキーマ（ステージング + 4階層対応）
- `src/services/drive/fileClassification.service.ts` — AI分類サービス（Claude API、ファイル名+メール文脈から書類種別/方向/年月/リネーム候補を判定）
- `src/app/api/drive/files/intake/[id]/approve/route.ts` — ファイル承認API（4階層フォルダ作成→リネーム移動→drive_documents登録）
- `src/app/api/drive/files/intake/[id]/reject/route.ts` — ファイル却下API（一時Driveファイル削除→staging更新）
- `src/app/api/drive/files/intake/batch/route.ts` — 一括承認API（全pending_reviewをAI推奨値で承認）
- `src/app/api/cron/clean-drive-staging/route.ts` — ステージングクリーンアップCron（14日放置→期限切れ、30日→削除）

### 変更ファイル
- `src/lib/types.ts` — DriveFileStaging, FileIntakeCardData, FileIntakeItem 型追加、DriveFolderMapping 4階層対応
- `src/services/drive/driveClient.service.ts` — 4階層フォルダ管理（getOrCreateDirectionFolder/getOrCreateMonthFolder/ensureFinalFolder）+ ステージングCRUD（saveStagingFile/getPendingStagingFiles/approveStagingFile/rejectStagingFile）+ moveAndRenameFile + formatStagingForContext
- `src/app/api/cron/sync-drive-documents/route.ts` — ステージングベースフローに全面改修（一時フォルダアップロード→AI分類→staging登録）
- `src/app/api/agent/chat/route.ts` — file_intake intent追加（キーワード: ファイル確認/届いた書類/受け取ったファイル）、ブリーフィングにpendingFileCount追加、システムプロンプトにファイル取り込み能力記述追加
- `src/components/secretary/ChatCards.tsx` — FileIntakeCard コンポーネント追加（書類種別ドロップダウン/方向トグル/年月ピッカー/承認/却下/一括承認）、BriefingSummaryCard に確認待ちファイル数表示追加
- `src/components/secretary/SecretaryChat.tsx` — handleCardAction に approve_file/reject_file/approve_all_files アクション追加、サジェストチップに「届いたファイル確認」追加
- `vercel.json` — clean-drive-staging Cron追加（毎日0:30実行）

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

### AI分類の仕様
- ファイル名 + メール文脈（件名/本文/送信者）のみで判定（PDF中身は読まない: 軽量設計）
- 書類種別: 見積書/契約書/請求書/発注書/納品書/仕様書/議事録/報告書/提案書/企画書/その他
- 方向: received/submitted（メールのdirectionから自動判定）
- リネーム候補: `YYYY-MM-DD_種別_元ファイル名.拡張子`
- 信頼度(confidence): 0.0-1.0（AI判定結果に付与）
- Claude API使用不可時はキーワードベースのフォールバック分類

### 重要な実装ノート
- **ステージングベース**: ファイルは最終フォルダに直接置かず、まず一時保管→AI分類→ユーザー確認→承認後に最終配置
- **4階層フォルダ**: 組織 > プロジェクト > 方向（受領/提出）> 年月（YYYY-MM）
- **[NodeMap]一時保管フォルダ**: ルートDriveに自動作成、承認前のファイルを一時保管
- **zshでの[id]パス**: `git add "src/app/api/drive/files/intake/[id]/approve/route.ts"` のようにブラケットを引用符で囲む

---

## Google Drive連携 実装内容

### 概要
メッセージの添付ファイルを組織→プロジェクトの2階層Google Driveフォルダに自動保存。秘書AIからドキュメント閲覧・検索・共有リンク生成が可能。

### DBマイグレーション（要Supabase実行）
```sql
-- 033_google_drive_integration.sql
CREATE TABLE drive_folders (組織/プロジェクトとDriveフォルダのマッピング);
CREATE TABLE drive_documents (ドキュメント追跡);
ALTER TABLE inbox_messages ADD COLUMN drive_synced BOOLEAN DEFAULT false;
```

### 新規ファイル
- `supabase/migrations/033_google_drive_integration.sql` — DBスキーマ
- `src/services/drive/driveClient.service.ts` — Google Drive APIラッパー（フォルダ/ファイルCRUD・共有・Gmail添付ダウンロード）
- `src/app/api/drive/folders/route.ts` — フォルダ管理API
- `src/app/api/drive/documents/route.ts` — ドキュメントCRUD API
- `src/app/api/drive/documents/[id]/route.ts` — ドキュメント詳細API
- `src/app/api/drive/documents/[id]/share/route.ts` — 共有リンク生成/メール共有API
- `src/app/api/drive/search/route.ts` — ドキュメント検索API
- `src/app/api/cron/sync-drive-documents/route.ts` — 添付ファイル自動同期Cronジョブ

### 変更ファイル
- `src/app/api/auth/gmail/route.ts` — drive.fileスコープ追加
- `src/lib/types.ts` — DriveDocument/DriveFolderMapping/DriveSearchResult型追加
- `src/app/api/agent/chat/route.ts` — documents/share_file intent追加、document_listカード生成
- `src/components/secretary/ChatCards.tsx` — DocumentListCardコンポーネント追加
- `src/app/business-log/page.tsx` — ドキュメントタブ追加
- `src/app/settings/page.tsx` — Drive再認証バナー追加（drive.fileスコープなし時）
- `vercel.json` — sync-drive-documents Cron追加（毎日23:00）

### 重要な実装ノート
- **drive.fileスコープ**: アプリが作成・開いたファイルのみ管理可能（安全）
- **トークン再利用**: Gmail/Calendar/Driveは同じOAuthトークン（service_name='gmail'）
- **Cronバッチ**: Gmail添付のみ対応（Slack/Chatworkは将来対応）。組織/プロジェクトはfrom_addressからコンタクト→組織→プロジェクトを自動推定
- **GCP設定が必要**: Google Drive APIの有効化 + OAuth同意画面にdrive.fileスコープ追加

---

## Calendar×タスク/ジョブ統合 実装内容

### 概要
タスク/ジョブの作成・更新・完了時にGoogleカレンダーと自動同期。空き時間検索もNodeMap内の作業ブロックを考慮するよう拡張。グループタスクのメンバー管理基盤を新設。

### DBマイグレーション（要Supabase実行）
```sql
-- 032_calendar_task_integration.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
CREATE TABLE IF NOT EXISTS task_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  calendar_event_id TEXT,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, user_id)
);
```

### 新規ファイル
- `src/services/calendar/calendarSync.service.ts` — カレンダー同期コアロジック（syncTaskToCalendar/syncJobToCalendar/updateCalendarEvent/deleteCalendarEvent/syncGroupTaskToMembers/getNodeMapScheduledBlocks）
- `src/app/api/tasks/[id]/members/route.ts` — タスクメンバーCRUD API

### 変更ファイル
- `src/lib/types.ts` — Task/Job/CreateTaskRequest/UpdateTaskRequest/CreateJobRequest に scheduledStart/scheduledEnd/calendarEventId 追加。TaskMember型新設
- `src/services/calendar/calendarClient.service.ts` — findFreeSlots() 拡張（NodeMap作業ブロック考慮＋二重カウント防止）
- `src/services/task/taskClient.service.ts` — mapTaskFromDb に scheduled_start/end/calendar_event_id マッピング追加。createTask/updateTask でスケジュール時刻をDB保存
- `src/app/api/tasks/route.ts` — POST: カレンダー同期＋グループメンバー登録。PUT: スケジュール変更時カレンダー更新、完了時カレンダー削除
- `src/app/api/jobs/route.ts` — POST/PUT: カレンダー同期。完了/失敗時カレンダー削除
- `src/app/api/jobs/[id]/execute/route.ts` — カレンダー予定作成時にcalendar_event_idをジョブに保存
- `src/components/tasks/TaskAiChat.tsx` — 構想メモフォームに作業予定時刻（datetime-local）ピッカー追加
- `src/app/api/agent/chat/route.ts` — 空き時間検索結果にNodeMap考慮済みラベル追加

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
- **extendedProperties**: Google Calendar API の extendedProperties.private に `nodeMapType`（task/job）と `nodeMapId`（UUID）を埋め込み。UI には表示されず API で検索可能
- **二重カウント防止**: NodeMap で calendar_event_id が設定済み = 既にGoogleカレンダーに登録済みなので、findFreeSlots では除外
- **トークン再利用**: calendarSync.service.ts は user_service_tokens の gmail トークンを直接使用（calendarClient.service.ts の内部関数は非export のため）
- **エラー許容**: カレンダー同期の失敗はログのみで、タスク/ジョブの作成・更新処理には影響しない
- **zshでの[id]パス**: git add時は `"src/app/api/tasks/[id]/members/route.ts"` のようにブラケットを引用符で囲む

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

### 意図分類（Intent）
| Intent | トリガーキーワード | 生成されるカード |
|---|---|---|
| briefing | おはよう/今日の状況/報告 | briefing_summary + calendar_events + deadline_alert + inbox_summary + task_resume + job_approval |
| inbox | メッセージ/新着/受信 | inbox_summary |
| reply_draft | 返信+下書き/作って | reply_draft |
| create_job | しておいて/任せ/おまかせ | job_approval |
| calendar | 予定/スケジュール/カレンダー | （テキストコンテキスト） |
| schedule | 日程+調整/空き時間 | （テキストコンテキスト） |
| tasks | タスク/進行/期限 | task_resume |
| jobs | ジョブ/対応必要 | job_approval |
| thought_map | 思考/マップ | navigate |
| business_log | ログ/ビジネス | navigate |

### カード一覧（ChatCards.tsx）
| カード型 | 用途 | インタラクション |
|---|---|---|
| briefing_summary | 数値ダッシュボード（未読/タスク/ジョブ/予定/次の予定） | 表示のみ |
| calendar_events | 今日の予定一覧（時刻/場所/進行中ハイライト） | 表示のみ |
| deadline_alert | 期限アラート（期限切れ/今日/近日） | クリックで該当ページ遷移 |
| inbox_summary | メッセージ一覧（緊急度ドット付き） | クリックで詳細表示 |
| message_detail | メッセージ全文 | 返信/ジョブ化/タスク化ボタン |
| reply_draft | 返信下書き（インライン編集可能） | 承認して送信/修正/却下 |
| job_approval | ジョブ承認（AI下書き表示＋インライン編集） | 承認して実行/修正/却下 |
| task_resume | タスク再開提案 | 「続ける」で/tasksへ遷移 |
| navigate | 画面遷移リンク | クリックで遷移 |
| action_result | アクション実行結果（成功/失敗） | 表示のみ |

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

### Google Calendar 連携
```
OAuth: Gmail再認証時にcalendar.readonly + calendar.events スコープ追加
サービス: src/services/calendar/calendarClient.service.ts
  - getTodayEvents() / getWeekEvents() / getEvents()
  - findFreeSlots()（営業時間9-18、土日除外）
  - createEvent()（参加者・場所対応）
  - formatEventsForContext() / formatFreeSlotsForContext()
API: GET/POST /api/calendar（today/week/range/free モード）
```

### DBマイグレーション（要Supabase実行）
```sql
-- 031_phase_b_job_autonomous.sql
ALTER TABLE jobs ALTER COLUMN type SET DEFAULT 'other';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS execution_log TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_contact_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_address TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS execution_metadata JSONB;
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_reply_to ON jobs(reply_to_message_id);
```

### 新規ファイル
- `src/components/secretary/SecretaryChat.tsx` — 秘書チャットメインUI
- `src/components/secretary/ChatCards.tsx` — 全カードコンポーネント群
- `src/app/api/agent/chat/route.ts` — 秘書AI会話API
- `src/app/api/jobs/[id]/execute/route.ts` — ジョブ実行エンジン
- `src/services/calendar/calendarClient.service.ts` — Google Calendar サービス
- `src/app/api/calendar/route.ts` — カレンダーAPI

### 変更ファイル
- `src/app/agent/page.tsx` — SecretaryChatコンポーネント使用に変更
- `src/app/api/auth/gmail/route.ts` — カレンダースコープ追加
- `src/app/api/jobs/route.ts` — Phase B拡張カラム対応

### 重要な実装ノート
- **zshでの[id]パス**: `git add "src/app/api/jobs/[id]/execute/route.ts"` のようにブラケットを引用符で囲む必要あり
- **Vercel互換**: `{ params }: { params: Promise<{ id: string }> }` パターンでNext.js 14の非同期params対応
- **カレンダートークン**: Gmail OAuth トークンを再利用（user_service_tokens テーブル、service_name='gmail'）
- **Gmail再認証が必要**: 既存ユーザーはカレンダースコープが付与されていないため、設定画面からGmail連携を解除→再連携する必要あり
- **GCP設定**: Google Calendar API有効化 + OAuth同意画面にcalendar.readonly/calendar.eventsスコープ追加が必要

---

## Phase 42h 実装内容（比較モード + リプレイモード）

### 概要
思考マップに2つの新モードを追加:
1. **比較モード**: 2人のユーザーのタスクの思考動線を重ねて表示。共有ノード（両者が通った知識）と分岐点（認識のズレ）を可視化。
2. **リプレイモード**: 完了済みタスクの思考を再現し、過去の意思決定についてAIに質問できるチャットUI。

### 新規ファイル
- `src/app/api/nodes/thought-map/compare/route.ts` — 比較データ取得API
- `src/app/api/thought-map/replay/route.ts` — リプレイAI会話API

### 変更ファイル
- `src/app/thought-map/page.tsx` — モード選択UI拡張 + CompareSelect + CompareCanvas + リプレイUI（Canvas + AIチャットパネル）
- `CLAUDE.md` — Phase 42h 記録

### APIエンドポイント
```
GET /api/nodes/thought-map/compare?userAId=xxx&taskAId=yyy&userBId=xxx&taskBId=zzz
→ { success: true, data: { userA: { nodes, edges, taskTitle }, userB: { nodes, edges, taskTitle }, sharedNodeIds, divergencePoints } }

POST /api/thought-map/replay
body: { taskId, message, conversationHistory }
→ { success: true, data: { reply: string } }
```

### 比較モードの処理フロー
```
ユーザー選択 → モード「比較」選択
  → compare-select: ユーザーA（既選択）のタスク一覧 + ユーザーBを選択 → Bのタスク一覧
  → 両タスク選択後「比較する」ボタン
  → compare: CompareCanvas で2人のノード+エッジを力学シミュレーション描画
    - 共有ノード: 紫・二重リング
    - ユーザーAのみ: アンバー
    - ユーザーBのみ: 青
    - 分岐点: 赤パルスグロー
    - 右上パネル: 分岐点一覧
```

### リプレイモードの処理フロー
```
ユーザー選択 → モード「リプレイ」選択
  → replay-select: 完了済み(status='done')タスクの一覧
  → replay: 左側Canvas（タスクの思考フロー）+ 右側AIチャットパネル
    - AIにはタスク情報・会話履歴・ノード・スナップショットをコンテキストとして渡す
    - ユーザーが過去の意思決定について質問
    - サジェスト質問: 「思考の流れを要約」「なぜこの方向に？」「初期ゴールと着地点の変化」
```

### 重要な実装ノート
- **比較APIの分岐点検出**: 共有ノードの各々について、次のエッジ先が異なるかを検査。片方にのみ存在するエッジ先がある場合を分岐点と判定。
- **リプレイAPIのコンテキスト構築**: タスク基本情報 + 構想メモ + 結果サマリー + スナップショット + ノード一覧 + 会話履歴（最大30件・各200文字以内に切り詰め）をシステムプロンプトに含める。
- **モデル**: リプレイAIは `claude-sonnet-4-5-20250929` を使用（コスト最適化）
- **CompareCanvasの分岐点パルス**: `requestAnimationFrame` で継続的にアニメーション（赤グローが脈動）
- **種のノード統合**: 比較APIでもタスクに `seed_id` がある場合は種のノード+エッジを統合

---

## Phase 42e 実装内容（スナップショット: 出口想定・着地点）

### 概要
タスク作成時（initial_goal）とタスク完了時（final_landing）にスナップショットを自動記録し、「最初に何を目指していたか」と「最終的にどこに着地したか」の比較を可能にする。思考マップUIにスナップショット比較パネルを追加。

### DBマイグレーション（要Supabase実行）
```sql
-- 029_phase42e_snapshots.sql
CREATE TABLE IF NOT EXISTS thought_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,  -- 'initial_goal' | 'final_landing'
  node_ids TEXT[],              -- knowledge_master_entries.id の配列
  summary TEXT,                 -- AI要約テキスト
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 新規ファイル
- `supabase/migrations/029_phase42e_snapshots.sql` — thought_snapshots テーブル
- `src/app/api/nodes/snapshots/route.ts` — スナップショット取得API（GET ?taskId=xxx）

### 変更ファイル
- `src/services/nodemap/thoughtNode.service.ts` — captureSnapshot() / getSnapshots() メソッド追加
- `src/services/task/taskClient.service.ts` — confirmSeed() に initial_goal 記録、updateTask() に final_landing 記録（動的import使用）
- `src/app/thought-map/page.tsx` — snapshots state追加、selectTask でスナップショット取得、比較パネルUI追加
- `CLAUDE.md` — Phase 42e 記録

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

### 重要な実装ノート
- **node_ids は TEXT[]**: DESIGN_THOUGHT_MAP.md では UUID[] だが、knowledge_master_entries.id が TEXT型のため TEXT[] に変更
- **動的import**: taskClient.service.ts から ThoughtNodeService を動的importして循環参照を回避
- **エラー許容**: スナップショット記録の失敗はログのみで、タスク作成/完了処理には影響しない

---

## Phase 42f残り 実装内容（会話ジャンプ + 飛地→種化ボタン）

### 概要
思考マップのノードをクリックした際に「元の会話を見る」「このキーワードを種にする」の2つのアクションを追加。
また、会話ターンIDの追跡基盤（turn_id）を整備し、ノード→会話の紐づけを可能にした。

### DBマイグレーション（要Supabase実行）
```sql
-- 027_phase42f_conversation_link.sql
ALTER TABLE seed_conversations ADD COLUMN IF NOT EXISTS turn_id UUID DEFAULT gen_random_uuid();
ALTER TABLE task_conversations ADD COLUMN IF NOT EXISTS turn_id UUID DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_seed_conv_turn_id ON seed_conversations(turn_id);
CREATE INDEX IF NOT EXISTS idx_task_conv_turn_id ON task_conversations(turn_id);
```

### 新規ファイル
- `supabase/migrations/027_phase42f_conversation_link.sql` — turn_id カラム追加マイグレーション
- `src/app/api/conversations/route.ts` — 会話取得API（turnId / seedId+around / taskId+around）
- `src/components/thought-map/ConversationModal.tsx` — 会話ジャンプモーダル（キーワードハイライト付き）

### 変更ファイル
- `src/lib/types.ts` — AiConversationMessage に turnId を追加
- `src/app/api/seeds/chat/route.ts` — turn_id 生成→DB保存→extractAndLink に conversationId として渡す
- `src/app/api/tasks/chat/route.ts` — 同上
- `src/services/task/taskClient.service.ts` — addConversation で turnId を task_conversations に保存
- `src/app/thought-map/page.tsx` — ThoughtNode型に sourceConversationId 追加、サイドパネルにアクションボタン（会話を見る・種にする）、会話モーダル・種化モーダル追加

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

### 重要な実装ノート
- **turn_id の導入**: seed_conversations / task_conversations に UUID の turn_id を追加。同じターン（ユーザー発言+AI応答）は同じ turn_id を共有する
- **後方互換性**: 既存の会話レコードは turn_id = NULL。会話モーダルでは createdAt による時刻フォールバック検索をサポート
- **conversationId の伝播**: seeds/chat と tasks/chat の両方で turn_id を生成し、ThoughtNodeService.extractAndLink() に渡すことで thought_task_nodes.source_conversation_id が正しくセットされる

---

## Phase 42a 実装内容（思考マップ基盤: ノード自動抽出）

### 概要
DESIGN_THOUGHT_MAP.md のPhase 42aに対応。種・タスクのAI会話で使われたキーワードを自動抽出し、ナレッジマスタ（knowledge_master_entries）に登録、thought_task_nodes でタスク/種との紐づけを記録する。

### DBマイグレーション（要Supabase実行）
```sql
-- 023_phase42a_thought_nodes.sql
-- knowledge_master_entries にカラム追加
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS source_conversation_id UUID;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
ALTER TABLE knowledge_master_entries ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- thought_task_nodes テーブル新設
CREATE TABLE IF NOT EXISTS thought_task_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  appear_order INT,
  is_main_route BOOLEAN,
  appear_phase TEXT,
  source_conversation_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL)
);
```

### 新規ファイル
- `src/services/nodemap/thoughtNode.service.ts` — ThoughtNodeService（コア: 抽出→マスタ登録→紐づけ）
- `src/app/api/nodes/thought/route.ts` — 思考ノード取得API（GET ?taskId= or ?seedId=）
- `src/app/api/nodes/unconfirmed/route.ts` — 未確認ノード一覧・承認API
- `supabase/migrations/023_phase42a_thought_nodes.sql` — マイグレーションSQL

### 変更ファイル
- `src/app/api/seeds/chat/route.ts` — ThoughtNodeService.extractAndLink() を非同期呼び出し追加
- `src/app/api/tasks/chat/route.ts` — 同上（既存のNodeService.processTextとは並行実行）
- `CLAUDE.md` — Phase 42a 記録

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

### 重要な実装ノート（Phase 42-fix で判明）
- **Vercel対応**: fire-and-forget（`.then()`）ではVercelが関数を先に終了する → `await` 必須
- **knowledge_master_entries.id**: TEXT型で自動生成なし → `me_auto_${Date.now()}_${random}` で手動生成
- **field_id**: NOT NULL制約を解除済み（マイグレーション025）。AI自動抽出ではfield未分類が普通
- **JSON解析**: Claude APIが```jsonコードブロックで返す場合あり → コードブロック除去してからJSON.parse
- **classifyKeyword**: Supabaseブランチでは `fieldsRes.data` / `domainsRes.data`（snake_case）を使用
- **linkToTaskOrSeed**: UPSERT不可（UNIQUE制約追加前）→ SELECT-then-INSERT方式で重複防止

---

## Phase 42d+42f 実装内容（思考動線記録 + 思考マップUI「地形ビュー」）

### 概要
Phase 42d: AI会話でノードが出現するたびに、前のノードとの間に「思考の流れ」（thought_edges）を自動記録する。
Phase 42f: 思考マップの可視化UIページ。力学シミュレーションによる空間配置＋パン＆ズーム＋タイムスライダー。

**設計意図**: 思考マップは本人向けではなく、同じ組織の他メンバーが見るためのもの。種フェーズでの曖昧なアイデアがAI会話を通じて明確化→タスク化→完了までの思考の流れを可視化する。

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
※旧名称「成果」は「結果」に変更（より具体的な表現）。

**ゾーン表示**: フェーズはノードの属性として記録されるが、画面上では大きな円やラベルではなく、Canvas背景の4分割カラーゾーンとして表現する。これにより実際のデータノードとフェーズ指標が混同されない。
- 左上（緑系）: 種ゾーン
- 右上（青系）: 構想ゾーン
- 右下（紫系）: 進行ゾーン
- 左下（藍色系）: 結果ゾーン

**種→タスクのノード統合**: タスクに `seed_id` がある場合、APIは種のノード+エッジも合わせて返す。重複ノード（同じnode_id）は除外し、`appearOrder` を全体で時系列に振り直す。これにより「種の段階で浮かんだアイデア→タスク化後に具体化」という一連の思考の旅が1つのマップに描画される。

### DBマイグレーション（実行済み）
```sql
-- 024_phase42d_thought_edges.sql
CREATE TABLE IF NOT EXISTS thought_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'main',
  edge_order INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_edge_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL)
);

-- 025_fix_field_id_nullable.sql
ALTER TABLE knowledge_master_entries ALTER COLUMN field_id DROP NOT NULL;

-- 026_fix_thought_task_nodes_unique.sql
ALTER TABLE thought_task_nodes ADD CONSTRAINT uq_thought_task_node UNIQUE (task_id, node_id);
ALTER TABLE thought_task_nodes ADD CONSTRAINT uq_thought_seed_node UNIQUE (seed_id, node_id);
ALTER TABLE thought_edges ADD CONSTRAINT uq_thought_edge_task UNIQUE (task_id, from_node_id, to_node_id);
ALTER TABLE thought_edges ADD CONSTRAINT uq_thought_edge_seed UNIQUE (seed_id, from_node_id, to_node_id);
```

### 新規ファイル
- `supabase/migrations/024_phase42d_thought_edges.sql` — thought_edgesマイグレーション
- `supabase/migrations/025_fix_field_id_nullable.sql` — field_id NOT NULL解除
- `supabase/migrations/026_fix_thought_task_nodes_unique.sql` — UNIQUE制約追加
- `src/app/api/nodes/thought-map/route.ts` — 思考マップデータ取得API（ユーザー一覧/タスク一覧/ノード+エッジ/全体マップ）
- `src/app/thought-map/page.tsx` — 思考マップ可視化UIページ（Canvas 2D力学シミュレーション、5ステップUI）

### 変更ファイル
- `src/services/nodemap/thoughtNode.service.ts` — ThoughtEdge型追加、createThoughtEdges/getEdges メソッド追加、extractAndLinkにエッジ生成統合
- `src/components/shared/Header.tsx` — ナビゲーションに「思考マップ」リンク追加（/thought-map）、旧/nodemapリンクは削除
- `CLAUDE.md` — Phase 42d+42f 記録

### 思考動線UIの構成
```
/thought-map ページ（5ステップ）:
  Step 1 (users):    ユーザー一覧（思考ノード数・タスク数付き）
  Step 2 (mode):     モード選択（全体マップ / 個別トレース）
  Step 3a (overview): 全体マップ — 全ノード表示 + 右側タスクフィルターパネル
  Step 3b (tasks):   個別トレース — タスク/種一覧（ノード数・エッジ数付き）
  Step 4 (flow):     個別トレース — Canvas描画の思考フロー可視化
```

### Canvas描画の主要機能
- **力学シミュレーション**: ノード反発力 + エッジ引力 + フェーズ別アンカー（外部ライブラリなし）
- **パン＆ズーム**: マウスドラッグでパン、ホイールでズーム（0.3〜3.0倍）
- **タイムスライダー**: ノードが出現順に徐々に現れる（フェーズラベル連動: 種→構想→進行→結果→全体）
- **ノードスタイル**: メインルート=アンバーグロー、飛地=ピンク破線、通常=フェーズ別カラー
- **エッジ描画**: ベジェ曲線 + 方向矢印ヘッド、メインルート=太い線、飛地=破線
- **インタラクション**: ホバーでツールチップ、クリックでサイドパネル詳細
- **DPR対応**: devicePixelRatio でCanvas解像度を調整、リサイズ対応
- **全体マップモード**: ノードサイズが relatedTaskCount に比例（多くのタスクで使われる知識ほど大きい）

### APIエンドポイント
```
GET /api/nodes/thought-map
  → ユーザー一覧（nodeCount, taskCount）
GET /api/nodes/thought-map?userId=xxx
  → ユーザーのタスク一覧（type, title, phase, status, nodeCount, edgeCount）
GET /api/nodes/thought-map?userId=xxx&mode=overview
  → 全体マップ: ユーザーの全ノード（重複排除）＋全エッジ＋タスク一覧
GET /api/nodes/thought-map?userId=xxx&taskId=yyy
  → 個別トレース: タスクの思考ノード＋エッジ（元の種のデータも統合）
GET /api/nodes/thought-map?userId=xxx&seedId=zzz
  → 個別トレース: 種の思考ノード＋エッジ
```

### 全体マップAPI（getUserOverviewMap）の処理
1. `thought_task_nodes` からユーザーの全ノードを取得
2. `node_id`（ナレッジマスタID）で重複排除 → 同じキーワードが複数タスクで使われていても1ノード
3. 各ノードの `relatedTaskCount`（何個のタスク/種で使われているか）を計算
4. `thought_edges` からユーザーの全エッジを取得、from-toペアで重複排除
5. タスク/種の簡易一覧を添付（フィルターパネル用）

### 重要な実装ノート
- **MapIcon**: lucide-react の `Map` アイコンは JavaScript 組込みの `Map` クラスを隠蔽するため、`MapIcon` としてインポートすること（クライアントサイドクラッシュの原因になった）
- **ノード位置は力学シミュレーションで毎回変わる**: 同じノードでもタスクごとに使われ方が異なるため、固定位置にすることは本来不可能。力学シミュレーションによるランダム配置が正しい設計判断。

---

## Phase 41 実装内容（種→タスク強化・AI伴走支援）

### バグ修正
- **種ボックス保存不可（致命的）**: `TaskService` 全メソッドが `getSupabase()`（anon key）を使用していたため RLS で INSERT/SELECT 失敗 → `getServerSupabase() || getSupabase()` に統一
- **種一覧が空になる**: `getSeeds()` の `.select('*, projects(name)')` が `project_id` カラム未追加時に JOIN エラー → フォールバック（JOINなし再試行）を追加
- **種→タスク変換失敗**: `confirmSeed` に `user_id` が渡されていない → confirm API ルートから userId を渡すよう修正
- **seed_conversations のRLS**: `getSupabase()` → `getServerSupabase()` に修正

### DBマイグレーション（Supabase実行済み）
```sql
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_from TEXT;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
```

### AI構造化タスク変換
- `confirmSeed` を全面改修: 種の内容＋AI会話履歴を Claude API に渡して構造化情報（タイトル・ゴール・内容・懸念・期限・メモ・優先度）を自動生成
- `convert` API も `confirmSeed` 経由に統一（AI構造化が両ルートで動作）
- 種の会話履歴（`seed_conversations`）→ タスクの会話履歴（`task_conversations`）に引き継ぎ
- `due_date` カラムにAI推定の期限を保存

### 構想メモの編集対応（TaskAiChat.tsx）
- AI構造化で埋めた値（ゴール・内容・懸念・期限）をフォームの初期値として復元
- 構想メモがある状態でも「✏️ 編集」ボタンで再編集可能
- 「保存のみ」ボタン追加（DB保存のみ、AIに送信しない）
- 期限日は `due_date` カラムにも保存

### AI会話の伴走支援化（aiClient.service.ts）
- システムプロンプトを「伴走パートナー」に改定（構想・進行・結果の各フェーズ）
- 種から生まれたタスクは構想メモ＋種の経緯をコンテキストに含める
- モデルを `claude-sonnet-4-5-20250929` に統一（コスト最適化）

### 変更ファイル一覧
- `src/lib/supabase.ts` — `getServerSupabase()` 追加（キャッシュ付き service role client）
- `src/services/task/taskClient.service.ts` — 全メソッド RLS 対応、`confirmSeed` AI 構造化、`structureSeedWithAI` 追加
- `src/app/api/seeds/[id]/confirm/route.ts` — userId を confirmSeed に渡す
- `src/app/api/seeds/convert/route.ts` — confirmSeed 経由に統一
- `src/app/api/seeds/chat/route.ts` — getServerSupabase 対応
- `src/components/tasks/TaskAiChat.tsx` — 構想メモ編集対応・保存のみボタン
- `src/services/ai/aiClient.service.ts` — 伴走支援型プロンプト・sonnet モデル統一

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

### タスク変換時のプロジェクト確認モーダル
- 種→タスク変換時にプロジェクトを選択するモーダルを表示
- `/api/seeds/convert` POST: `TaskService.createTask()` 経由でタスク作成（RLS整合性対応）
- `CreateTaskRequest` に `seedId` / `projectId` 追加

### DBマイグレーション（Supabase実行済み）
```sql
-- 020_phase40c_project_organization.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);

-- 021_phase40c_project_channels.sql
CREATE TABLE IF NOT EXISTS project_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_channel_id UUID REFERENCES organization_channels(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  channel_identifier TEXT NOT NULL,
  channel_label TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, service_name, channel_identifier)
);

-- 022_phase40c_task_project.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_seed_id ON tasks(seed_id);
```

### 変更ファイル一覧
- `src/lib/types.ts` — Project に organizationId/organizationName、Task に projectId、CreateTaskRequest に seedId/projectId
- `src/app/api/projects/route.ts` — GET(JOIN組織)/POST(組織紐づけ)/PUT(新規)
- `src/app/api/projects/[id]/channels/route.ts` — 新規: チャネルCRUD
- `src/app/api/projects/[id]/messages/route.ts` — 新規: チャネルメッセージ取得
- `src/app/api/seeds/route.ts` — プロジェクト自動検出・projectId部分更新
- `src/app/api/seeds/convert/route.ts` — TaskService.createTask()経由に変更
- `src/app/business-log/page.tsx` — 組織選択・チャネル設定・メッセージタブ
- `src/app/seeds/page.tsx` — タスク変換プロジェクトモーダル・エラー表示
- `src/components/inbox/MessageDetail.tsx` — 種化時のプロジェクト自動検出・選択モーダル
- `src/services/task/taskClient.service.ts` — createTask に seedId/projectId、mapTaskFromDb に seedId/projectId、createSeed リトライ時 project_id 除外

---

## 残課題（未実装・未解決バグ）

### ✅ Phase 41 で解決済み
- ~~🔴 種ボックスの保存が動作しない~~ → RLS対応で解決
- ~~🟡 種→タスク変換後にタスクが表示されない~~ → confirmSeed に userId 追加で解決
- ~~🟡 プロジェクト紐づけで種が登録できない~~ → seeds テーブルに project_id カラム追加で解決

### ✅ Phase 42 で解決済み
- ~~🟡 種→タスクの AI 会話が生む思考ノードの可視化設計~~ → Phase 42a+42d+42f で実装完了
- ~~🟡 「人の思考の流れ」を思考マップでどう表現するかの UX 設計~~ → /thought-map のCanvas描画UIで実装完了
- ~~🔴 思考ノードが生成されない~~ → Vercel await対応・id手動生成・field_id nullable化・JSON解析修正・classifyKeywordバグ修正で解決

### ✅ Phase 42f 強化で解決済み
- ~~🟡 思考マップUIの改善（ノード数が増えた場合のレイアウト最適化、時間スライダー等）~~ → 力学シミュレーション＋タイムスライダー＋パン＆ズーム実装完了
- ~~🟡 「個人の知識の全体地図」の実現~~ → 全体マップモード（Overview）で全ノード統合表示を実装
- ~~🟡 種→タスクの思考の一貫性~~ → seed_id 経由で種のノード+エッジをタスクに統合表示

### ✅ Phase 42f残りで解決済み
- ~~🟡 思考マップUI追加改善: 会話ジャンプ（ノードクリック→元の会話へ）、飛地→種化ボタン~~ → 会話モーダル＋種化ボタン実装完了
- ~~🟡 source_conversation_id が常にNULL~~ → turn_id 基盤整備＋chat API から conversationId 伝播で解決

### ✅ Phase 42b で解決済み
- ~~🟡 Phase 42b: 送受信メッセージからのノード抽出~~ → Cronバッチ（/api/cron/extract-message-nodes）で日次自動抽出を実装

### ✅ Phase 42e で解決済み
- ~~🟡 Phase 42e: スナップショット（出口想定・着地点）~~ → thought_snapshots テーブル＋confirmSeed/updateTask統合＋思考マップUI比較パネル

### ✅ Restructure（再設計）で解決済み
- ~~日常簡易作業の置き場がない~~ → ✅ ジョブ機能（/jobs）実装。タスクページから分離して独立ページ化
- ~~アイデアメモの場所がない~~ → ✅ アイデアメモ機能（/memos）実装
- ~~インボックスのアクションボタンが複雑~~ → ✅ 返信（AI自動下書き）・ジョブ（種別選択）・タスク（AIフォーム）の3つに整理

### ✅ Inbox改善で解決済み
- ~~返信下書きがコンタクト情報を参照しない~~ → ✅ メモ/AIコンテキスト・会社名・関係性・過去やり取り・スレッド文脈を反映
- ~~ジョブ登録エラー（type NOT NULL制約）~~ → ✅ jobTypeをAPIに渡す＋DB CHECK制約を柔軟化

### 🟡 次の設計課題
- ~~タスク詳細の「詳細」タブの役割を再定義~~ → ✅「📊 変遷」タブに転換済み
- ~~Phase 42g: 検索・サジェスト機能~~ → ✅ ノード重なり検索API + 思考マップUI検索パネル + 関連タスク表示
- ~~Phase 42h: 比較モード・AI対話モード~~ → ✅ 比較Canvas（共有ノード・分岐点） + リプレイAIチャットUI 実装完了

### ✅ 秘書ファースト + Calendar + ブリーフィング強化で解決済み
- ~~ジョブのAI自動実行~~ → ✅ Phase B拡張: 秘書チャットからジョブ作成→承認→自動送信の一連フロー実装
- ~~インボックスの通知・優先度表示~~ → ✅ ブリーフィング強化: サマリーカードに未読数/緊急数表示＋期限アラートカード
- ~~Google Calendar連携~~ → ✅ OAuth拡張＋予定取得/作成/空き時間検索＋秘書ブリーフィングにカレンダーカード

### ✅ 残課題一括解決
- ~~auto生成コンタクト同士の連絡先結合~~ → ✅ duplicates APIを拡張。同名に加え同アドレス（contact_channels）での重複検出対応。既存のmerge APIでそのまま統合可能
- ~~ビジネスログの活動履歴連携~~ → ✅ business-events POST に fromAddress/fromName パラメータ追加。contact_channels/contact_persons から自動検出してcontact_id設定。GET時にcontact_persons JOIN
- ~~宛先サジェストのデータソース拡充~~ → ✅ /api/contacts/suggest API新設（contact_channels + contact_persons名前 + inbox_messages送信者履歴から検索）。ReplyFormにサジェストドロップダウン追加（キーボード操作対応）
- ~~Gmail再認証のUI導線~~ → ✅ OAuthコールバックでscope保存。tokens APIでscopeをマスクせず返却。設定画面にカレンダー再認証バナー表示（calendar scopeがない場合）

---

## 既知の仕様・注意事項

### コンタクト一覧の集約ロジック
- `contact_persons` 主体で取得（1人1行保証）
- inbox_messages の集約キー: `from_address`（email=メアド / chatwork=account_id数値 / slack=UXXXXX）
- from_address が空の場合: from_name をスペース正規化してフォールバック
- 自分自身のメールアドレスからのメッセージ（Me）は除外済み

### 組織の重複防止
- SetupWizard でドメイン重複チェック済み（同じ domain が存在すれば新規作成しない）

### 組織とコンタクトの連動ルール
- コンタクトは1つの組織にのみ所属可能（組織横断ガード: 409エラー）
- メンバー追加時に `company_name` と `relationship_type` を自動設定
- 組織の基本情報保存時に所属コンタクト全員の `company_name` と `relationship_type` を連動更新
- メンバー削除時に `company_name` をクリア
- メンバータブ表示時に `company_name` 未設定メンバーを自動修復

### 送信サービス関数の引数（位置引数、オブジェクトではない）
- `sendEmail(to, subject, body, inReplyTo?, cc?)` → `Promise<boolean>`
- `sendSlackMessage(channelId, text, threadTs?, userId?)` → `Promise<boolean>`
- `sendChatworkMessage(roomId, body)` → `Promise<boolean>`
- 返信時のチャネルID: Slack → `metadata.slackChannel`、Chatwork → `metadata.chatworkRoomId`
- Chatwork To形式: `[To:数値account_id]`（名前ではない）

### タスクのID生成
- `tasks` テーブルの id は UUID型（`DEFAULT gen_random_uuid()`）
- コード内では `crypto.randomUUID()` を使用
- **絶対に** `task-${Date.now()}` 形式を使わないこと（過去に発生したバグ）

### Vercel Cron
- vercel.json に crons 設定済み
- 環境変数 `CRON_SECRET` が必要

### ビルドエラー対処
```bash
# キャッシュエラーの場合
rm -rf .next && npm run build
# 依存関係エラーの場合
rm -rf .next node_modules package-lock.json && npm install && npm run build
```

---

## 作業フロー（Claude Code への指示テンプレート）

```
CLAUDE.md を読んでから作業を開始してください。

【タスク】Phase XX: 機能名

【手順】
1. git checkout -b feature/phase-XX-name
2. SQLファイル作成（実行はしない）
3. API作成
4. UI作成
5. npm run build でビルド確認
6. git commit してコミットハッシュを報告

【注意】
- 既存画面を壊さないこと
- contact_persons テーブルの id は TEXT型のため必ず生成して渡す
- inbox_messages を使うこと（unified_messages ではない）
- inbox_messages に user_id カラムは存在しない
- APIは既存パターン（getServerUserId + NextResponse.json）に従うこと
- tasks テーブルの id は UUID型 → crypto.randomUUID() を使う
- Supabase クライアントは読み書きで同じものを使う（getSupabase or createServerClient、混在させない）
```

---

## AI コンテキスト一覧（SSOT）

NodeMap内の全AI呼び出し箇所と、各エンドポイントが参照するデータソースの一覧。モデルは特記なき限り `claude-sonnet-4-5-20250929`。

### ユーザー共通コンテキスト（複数エンドポイントで使用）

| コンテキスト | 取得元 | 使用箇所 |
|---|---|---|
| 文体学習（getUserWritingStyle） | inbox_messages WHERE direction='sent'（最大10件） | 返信下書き / ジョブ構造化 / 社内相談回答 / 秘書ジョブ作成 |
| メール署名 | user_metadata.email_signature | 返信下書き / ジョブ構造化 / 社内相談回答（メールのみ。Slack/CWは付与しない） |
| プロフィール | user_metadata（display_name / personality_type / ai_response_style） | 秘書チャット / ジョブ構造化 |

### エンドポイント別 AI コンテキスト詳細

#### 1. 秘書チャット — `/api/agent/chat/route.ts`
**用途**: メインAI会話。意図分類→データ取得→カード生成→応答
**max_tokens**: 2000

| Intent | 参照テーブル / API | 注入データ |
|---|---|---|
| briefing | inbox_messages, tasks, jobs, consultations, knowledge_clustering_proposals, business_events, Google Calendar API | 未読数, 緊急数, タスク数, ジョブ数, 相談数, 未確認ファイル数, ナレッジ提案数, 今日の予定 |
| inbox | inbox_messages | from_name, subject, body(250文字), is_read, direction, timestamp |
| message_detail | inbox_messages | メッセージ全文 + スレッド |
| reply_draft | （/api/ai/draft-reply に委譲） | — |
| create_job | inbox_messages | メッセージ内容 + 送信者情報 + 文体学習 + 署名 |
| calendar | Google Calendar API | 今日の予定一覧（終日除外） |
| schedule | Google Calendar API, tasks, jobs | 空き時間候補（findFreeSlots） |
| tasks | tasks | title, status, priority, phase, due_date（最新20件） |
| jobs | jobs | title, status, type, due_date, description（最新15件） |
| projects | projects, organizations | 名前, 組織名 |
| documents | drive_documents | ファイル名, リンク, 作成日 |
| file_intake | drive_file_staging | status=pending_review のファイル一覧 + AI分類結果 |
| store_file | organizations, projects | URL抽出 + 格納先候補 |
| business_summary | business_events | AI週間要約 + イベント集計 |
| knowledge_structuring | knowledge_clustering_proposals | 待機中提案 + 未確認キーワード数 |
| create_contact / search_contact | contact_persons, contact_channels | 名前, メール, 会社名, 関係性 |
| create_organization | organizations | 既存組織一覧 |
| create_project | projects, organizations | プロジェクト + 組織一覧 |
| create_task | tasks | AIがメッセージからタイトル・優先度・プロジェクト推定 |
| task_progress | tasks, task_conversations | タスク状態 + 最近の会話 |
| create_calendar_event | Google Calendar API | 自然言語→日時パース |
| create_drive_folder | projects, organizations, Google Drive API | プロジェクト自動検出 + 命名規則 |
| consultations | consultations, jobs | 未回答相談数 |
| setup_organization | organizations, inbox_messages | 未登録組織候補（ドメイン集計） |

#### 2. タスクAI会話 — `/api/tasks/chat/route.ts` → `aiClient.service.ts`
**用途**: タスク内の構想・進行・結果フェーズ別AI伴走
**max_tokens**: 1500

| 参照テーブル | 注入データ |
|---|---|
| tasks | title, description, ideation_summary, seed_id, due_date |
| projects | name, description, organization_id |
| organizations | name, memo |
| task_members → contact_persons | メンバー名一覧 |
| task_conversations | 会話履歴（最大20ターン、各200文字制限） |
| — | フェーズ別プロンプト（構想: 一問一答4項目 / 進行: 壁打ち / 結果: 成果整理） |
| — | coveredItems検出（ゴール/内容/懸念/期限の議論済み判定） |

#### 3. 返信下書き — `/api/ai/draft-reply/route.ts` → `aiClient.service.ts`
**用途**: メッセージへの返信文面AI生成
**max_tokens**: 1000

| 参照テーブル | 注入データ |
|---|---|
| contact_channels → contact_persons | notes, ai_context, company_name, department, relationship_type |
| inbox_messages | 送信者との直近5件のやり取り |
| inbox_messages (thread) | スレッド文脈（引用チェーン） |
| user_metadata | メール署名（メールのみ、AI応答後に付与） |
| inbox_messages (sent) | 文体学習（getUserWritingStyle） |
| — | チャネル別トーン指示（Email=丁寧 / Slack=カジュアル / CW=標準） |

#### 4. ジョブ構造化 — `/api/ai/structure-job/route.ts`
**用途**: メッセージからジョブ種別に応じたAI下書き生成
**max_tokens**: 256〜1024（種別による）

| 種別 | 参照テーブル | 注入データ |
|---|---|---|
| schedule（日程調整） | Google Calendar API, user_metadata | 空き時間候補 + 表示名 + 署名 + 文体学習 |
| consult（社内相談） | inbox_messages (thread) | スレッド要約（直近10件） |
| todo（後でやる） | — | メッセージ内容のみ |
| default | — | メッセージ内容のみ |

#### 5. 社内相談回答 — `/api/consultations/route.ts`
**用途**: 相談回答を踏まえた返信文面AI生成
**max_tokens**: 1024

| 参照テーブル | 注入データ |
|---|---|
| consultations | thread_summary, question, answer |
| jobs | source_channel（チャネル判定） |
| user_metadata | メール署名（メールのみ） |
| inbox_messages (sent) | 文体学習 |

#### 6. メモ→タスク変換 — `/api/memos/[id]/convert/route.ts`
**用途**: アイデアメモからタスク情報をAI自動生成
**max_tokens**: 600

| 参照テーブル | 注入データ |
|---|---|
| idea_memos | content（メモ本文） |
| memo_conversations | 全AI会話履歴（role, content） |

#### 7. キーワード抽出 — `thoughtNode.service.ts` → `keywordExtractor.service.ts`
**用途**: AI会話/メッセージからナレッジキーワード自動抽出
**max_tokens**: 800

| 参照テーブル | 注入データ |
|---|---|
| （入力テキストのみ） | 会話テキスト + source_type + phase |
| — | 抽出ルール: 名詞/専門用語のみ、信頼度0.7以上、最大8キーワード |

#### 8. ナレッジクラスタリング — `knowledgeClustering.service.ts`
**用途**: 週次AIクラスタリング（キーワード→領域/分野構造提案）
**max_tokens**: 2000 | **トリガー**: 毎週月曜2:30 Cron

| 参照テーブル | 注入データ |
|---|---|
| knowledge_master_entries | 未確認キーワード一覧（is_confirmed=false、50個以上） |
| knowledge_domains | 既存領域（整合性参照用） |
| knowledge_fields | 既存分野（整合性参照用） |

#### 9. ファイル分類 — `fileClassification.service.ts`
**用途**: 添付ファイルの書類種別/方向/リネームをAI判定
**max_tokens**: 500

| 参照テーブル | 注入データ |
|---|---|
| （メタデータのみ） | fileName, mimeType, emailSubject, emailBody(200文字), senderName, direction, organizationName, projectName |
| — | ファイル中身は読まない（軽量設計） |

#### 10. 思考リプレイ — `/api/thought-map/replay/route.ts`
**用途**: 完了タスクの思考を再現し、過去の意思決定についてAI対話
**max_tokens**: 1500

| 参照テーブル | 注入データ |
|---|---|
| tasks | title, description, status, ideation_summary, result_summary |
| task_conversations | 全会話履歴（最大50件、各200文字） |
| thought_snapshots | 初期ゴール vs 着地点 |
| thought_task_nodes → knowledge_master_entries | ノード一覧（思考の旅路） |

#### 11. ビジネスイベント週間要約 — `/api/cron/summarize-business-log/route.ts`
**用途**: プロジェクト別の週間活動をAI要約
**max_tokens**: 800 | **トリガー**: 毎週月曜2:00 Cron

| 参照テーブル | 注入データ |
|---|---|
| business_events | 過去7日間のイベント（カテゴリ別: メッセージ/ドキュメント/会議/その他） |
| projects | プロジェクト名 |

#### 12. タスク完了要約 — `aiClient.service.ts` → `generateTaskSummary()`
**用途**: タスク完了時に結論・プロセス・学び・次アクションを生成
**max_tokens**: 1000 | **モデル**: claude-opus-4-5-20251101

| 参照テーブル | 注入データ |
|---|---|
| tasks | title, ideation_summary |
| task_conversations | 全会話履歴 |

### フォールバック方針
全エンドポイント共通: ANTHROPIC_API_KEY未設定またはAPI失敗時は、テンプレートベース or メッセージ内容そのまま使用。AI失敗がタスク/ジョブの作成・更新処理をブロックしない設計。

---

## 環境変数（.env.local / Vercel）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=
```
