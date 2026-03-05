# NodeMap データフロー・システム構成図

最終更新: 2026-03-05

---

## 1. システム全体像

NodeMapは「情報を受け取り → 整理し → 活用する」ビジネスコミュニケーション＆ログツール。

外部サービス（Email / Slack / Chatwork）からメッセージを受信し、AI（Claude）の力を借りて、コンタクト管理・タスク管理・ナレッジ蓄積・ビジネスログ・ドキュメント管理を一元化する。

技術スタック: Next.js 14 / TypeScript / Supabase（PostgreSQL） / Claude API / Google Calendar / Google Drive / Vercel

---

## 2. データテーブル一覧（機能グループ別）

### メッセージ系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| inbox_messages | 全メッセージ（受信＋送信） | channel, from_name, from_address, subject, body, direction(received/sent), to_list, metadata, drive_synced |

### コンタクト・組織系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| contact_persons | コンタクト（人） | id(TEXT), display_name, company_name, relationship_type, notes |
| contact_channels | コンタクトの連絡先 | contact_id, channel(email/slack/chatwork), address |
| organizations | 組織（自社・取引先） | name, domain, relationship_type, address, phone, memo |
| organization_channels | 組織のチャネル | organization_id, service_name, channel_id |

### プロジェクト・ビジネスログ系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| projects | プロジェクト | name, organization_id |
| project_channels | プロジェクトとチャネルの紐づけ | project_id, service_name, channel_identifier |
| business_events | ビジネスイベント | project_id, event_type, contact_id, ai_generated, summary_period, source_message_id |

### 種・タスク・ジョブ系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| seeds | 種ボックス（アイデアの種） | title, content, user_id, project_id, source_from |
| seed_conversations | 種のAI会話 | seed_id, role, content, turn_id |
| tasks | タスク | title, goal, status, task_type(personal/group), project_id, seed_id, due_date, scheduled_start/end, calendar_event_id |
| task_conversations | タスクのAI会話 | task_id, role, content, turn_id |
| task_members | グループタスクのメンバー | task_id, user_id, role, calendar_event_id |
| jobs | ジョブ（AIに委ねる簡易作業） | type(schedule/reply/check/other), status(pending/approved/executing/done/failed), draft_content, reply_to_message_id, target_contact_id |

### アイデアメモ系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| idea_memos | アイデアメモ | title, content, tags(TEXT[]) |
| memo_conversations | メモのAI会話 | memo_id, role, content, turn_id |

### ナレッジ・思考マップ系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| knowledge_domains | ナレッジの領域（大分類） | name |
| knowledge_fields | ナレッジの分野（中分類） | domain_id, name |
| knowledge_master_entries | ナレッジキーワード | field_id, keyword, category, source_type, is_confirmed, created_via |
| thought_task_nodes | タスク/種とナレッジの紐づけ | task_id, seed_id, node_id, appear_phase, is_main_route |
| thought_edges | 思考の流れ（ノード間の動線） | task_id, seed_id, from_node_id, to_node_id, edge_order |
| thought_snapshots | タスクの思考スナップショット | task_id, snapshot_type(initial_goal/final_landing), node_ids, summary |
| knowledge_clustering_proposals | AI構造化提案 | user_id, status, proposal_data, week_number |

### Google Drive系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| drive_folders | DriveフォルダマッピングDrive | entity_type, entity_id, drive_folder_id, hierarchy_level(1-4), direction, year_month |
| drive_documents | Driveドキュメント | drive_file_id, file_name, direction, document_type, year_month |
| drive_file_staging | ファイル一時保管・AI分類 | status(pending_review/approved/uploaded/rejected/expired), ai_document_type, ai_direction, confirmed_*, source_channel |

### 認証・設定系
| テーブル | 役割 | 主なカラム |
|---|---|---|
| user_service_tokens | 外部サービスのOAuthトークン | user_id, service_name(gmail/slack/chatwork), access_token, refresh_token, scope |
| user_thinking_tendencies | ユーザー思考傾向分析 | user_id, analysis_date, tendency_summary, thinking_patterns(TEXT[]), decision_style, risk_tolerance, owner_policy_text |

---

## 3. 画面別データ利用マップ

### 秘書（/agent）— メインハブ
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| inbox_messages（未読メッセージ） | jobs（ジョブ作成） |
| tasks（進行中タスク、期限） | inbox_messages（返信送信） |
| jobs（承認待ちジョブ） | seeds（種作成） |
| Google Calendar（今日の予定） | Google Calendar（予定作成） |
| contact_persons / contact_channels（コンタクト情報） | business_events（活動要約） |
| drive_file_staging（確認待ちファイル） | drive_documents（ファイル承認・格納） |
| knowledge_clustering_proposals（ナレッジ提案） | knowledge_domains/fields/entries（提案承認） |
| business_events（活動要約） | |

秘書は全機能への入口。チャットで話しかけるだけで、上記全ての操作が可能。

### インボックス（/inbox）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| inbox_messages（全チャネルのメッセージ） | inbox_messages（返信送信、direction='sent'） |
| contact_persons（送信者情報表示） | jobs（ジョブ化） |
| | seeds（種化） |
| | tasks（タスク化） |

### コンタクト（/contacts）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| contact_persons（コンタクト一覧） | contact_persons（編集・マージ） |
| contact_channels（連絡先） | contact_channels（追加・編集） |
| inbox_messages（Email送信先から自動生成） | |
| inbox_messages（Slack/CW受信元から自動生成） | |

コンタクト自動生成ルール:
- Email: 自分が送信したメッセージの宛先（to_list）からコンタクト生成（メルマガ等のノイズ除外）
- Slack/Chatwork: 受信メッセージの送信者（from_address）からコンタクト生成

### 組織（/organizations）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| organizations（組織一覧） | organizations（作成・編集） |
| organization_channels（チャネル情報） | organization_channels（チャネル追加） |
| contact_persons（所属メンバー） | contact_persons（メンバー追加→company_name自動設定） |

### タスク（/tasks）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| tasks（タスク一覧） | tasks（作成・更新・完了） |
| task_conversations（AI会話履歴） | task_conversations（AI会話追加） |
| seeds（種からの変換元情報） | knowledge_master_entries（AI会話からキーワード自動抽出） |
| knowledge_master_entries（関連ナレッジ） | thought_task_nodes（タスクとナレッジの紐づけ） |
| | thought_edges（思考動線の記録） |
| | thought_snapshots（初期ゴール・着地点） |
| | Google Calendar（スケジュール同期） |

### ジョブ（/jobs）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| jobs（ジョブ一覧） | jobs（ステータス更新: pending→approved→executing→done/failed） |
| contact_persons（対象コンタクト） | inbox_messages（自動送信メッセージ） |
| inbox_messages（返信元メッセージ） | Google Calendar（日程調整ジョブで予定作成） |

### アイデアメモ（/memos）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| idea_memos（メモ一覧） | idea_memos（作成・編集） |
| memo_conversations（AI会話履歴） | memo_conversations（AI会話追加） |

### 思考マップ（/thought-map）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| thought_task_nodes（ノードとタスク/種の紐づけ） | seeds（飛地ノード→種化） |
| thought_edges（ノード間の動線） | |
| thought_snapshots（スナップショット比較） | |
| knowledge_master_entries（ノードのラベル情報） | |
| tasks / seeds（タスク/種の基本情報） | |
| task_conversations / seed_conversations（リプレイモード用会話） | |

5つのモード: 全体マップ / 個別トレース / 比較モード / リプレイモード / 検索

### ビジネスログ（/business-log）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| projects（プロジェクト一覧） | projects（プロジェクト作成） |
| business_events（イベント一覧） | business_events（イベント作成・編集） |
| project_channels（チャネル設定） | project_channels（チャネル紐づけ） |
| inbox_messages（チャネルメッセージ） | |
| drive_documents（ドキュメント一覧） | |
| organizations（組織情報） | |
| contact_persons（参加者情報） | |

### ナレッジ（/master）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| knowledge_domains（領域一覧） | knowledge_domains（追加・編集・削除） |
| knowledge_fields（分野一覧） | knowledge_fields（追加・編集・削除） |
| knowledge_master_entries（キーワード一覧） | knowledge_master_entries（追加・編集・削除・承認） |
| knowledge_clustering_proposals（AI提案履歴） | knowledge_clustering_proposals（承認・却下） |
| thought_task_nodes（関連タスク表示） | |

### 設定（/settings）
| 使うデータ（読み込み） | 生成するデータ（書き込み） |
|---|---|
| user_service_tokens（連携状態） | user_service_tokens（OAuth認証） |
| organizations（自社設定） | organizations（自社情報更新） |
| contact_persons（自分のプロフィール） | contact_persons（プロフィール更新） |

---

## 4. メインデータフロー（機能間の連携）

### フロー1: メッセージ受信 → コンタクト自動生成
```
外部サービス（Email/Slack/Chatwork）
  ↓ 受信
inbox_messages（メッセージ保存）
  ↓ /contacts ページ読み込み時に自動集約
contact_persons + contact_channels（コンタクト自動生成）
  ※ Email: 送信メッセージの宛先（to_list）から生成
  ※ Slack/CW: 受信メッセージの送信者（from_address）から生成
```

### フロー2: メッセージ → 種 → タスク（アイデアの具体化）
```
inbox_messages（受信メッセージ）
  ↓ ユーザーが「種にする」ボタン
seeds（種ボックスに登録）
  ↓ project_channels からプロジェクト自動検出
  ↓ AI会話（seed_conversations）で深掘り
  ↓ AI会話中にキーワード自動抽出
knowledge_master_entries（ナレッジ登録）
thought_task_nodes（種とナレッジの紐づけ）
thought_edges（思考の流れ記録）
  ↓ ユーザーが「タスクにする」ボタン
tasks（タスク作成 — AI構造化でゴール・内容・期限を自動生成）
thought_snapshots（initial_goal スナップショット記録）
  ↓ seed_conversations → task_conversations（会話履歴引き継ぎ）
  ↓ タスク完了時
thought_snapshots（final_landing スナップショット記録）
Google Calendar（スケジュール同期 → 完了時に予定削除）
```

### フロー3: メッセージ → ジョブ（AIに任せる作業）
```
inbox_messages（受信メッセージ）
  ↓ 秘書チャットで「○○さんに返信しておいて」
jobs（ジョブ作成: status=pending）
  ↓ AI下書き生成（コンタクト情報＋過去やり取り参照）
  ↓ ユーザーが承認（インライン編集可）
jobs（status=approved → executing）
  ↓ 自動送信（Email/Slack/Chatwork）
inbox_messages（送信メッセージ保存: direction='sent'）
jobs（status=done）
  ↓ 日程調整ジョブの場合
Google Calendar（予定自動作成）
```

### フロー4: AI会話 → ナレッジ自動蓄積 → 思考マップ
```
seed_conversations / task_conversations（AI会話）
  ↓ 会話のたびにClaude APIでキーワード抽出
knowledge_master_entries（ナレッジキーワード登録: is_confirmed=false）
thought_task_nodes（タスク/種とナレッジの紐づけ: appear_phase記録）
thought_edges（前のノードとの思考動線を記録）
  ↓ 思考マップ（/thought-map）で可視化
  ↓ ノード数が増えたら
  ↓ 週次Cron: cluster-knowledge-weekly
knowledge_clustering_proposals（AIクラスタリング提案）
  ↓ ユーザー承認
knowledge_domains / knowledge_fields（領域・分野の自動構造化）
knowledge_master_entries（is_confirmed=true）
```

### フロー5: メッセージ添付 → Google Drive自動保存
```
inbox_messages（添付ファイル付きメッセージ）
  ↓ 日次Cron: sync-drive-documents
  ↓ 添付ファイルダウンロード（Gmail/Slack/Chatwork対応）
  ↓ 本文中のGoogle Docs/Sheets/Drive URL検出
drive_file_staging（一時保管 + AI自動分類）
  ├ AI分類: 書類種別（見積書/契約書/請求書...）
  ├ AI分類: 方向（受領/提出）
  ├ AI分類: 年月
  └ AI分類: リネーム候補
  ↓ 秘書チャットまたは /agent で確認
  ↓ ユーザーが承認（編集可）
drive_folders（4階層フォルダ作成: 組織/プロジェクト/方向/年月）
drive_documents（最終ドキュメント登録）
business_events（document_received/submitted イベント自動記録）
  ↓ 却下の場合
drive_file_staging（status=rejected）→ 30日後にDriveファイル削除
```

Google Driveフォルダ構造:
```
[親フォルダ（GOOGLE_DRIVE_ROOT_FOLDER_ID）]
  └ [NodeMap] A社/
      └ プロジェクトX/
          ├ 受領/
          │   └ 2026-03/
          │       └ 2026-03-01_見積書_original.pdf
          └ 提出/
              └ 2026-03/
                  └ 2026-03-01_発注書_purchase-order.pdf
```

### フロー6: メッセージ → ビジネスイベント自動蓄積 → AI要約
```
inbox_messages（受信/送信メッセージ）
  ↓ 日次Cron: sync-business-events
  ↓ AI判定: メッセージ内容からイベント種別を推定
business_events（自動生成: ai_generated=true）
  ├ チャネル → project_channels → projects で自動紐づけ
  └ from_address → contact_channels → contact_persons で自動紐づけ
  ↓ 週次Cron: summarize-business-log（毎週月曜）
business_events（AI週間要約: summary_period付き）
  ↓ 秘書チャットで「活動要約」
  ↓ BusinessSummaryCard で表示
```

### フロー7: 組織 → プロジェクト → チャネル（階層管理）
```
organizations（組織作成）
  ↓ 組織にコンタクトを所属
contact_persons（company_name + relationship_type 自動設定）
  ↓ 組織にプロジェクト紐づけ
projects（organization_id で紐づけ）
  ↓ プロジェクトにチャネル紐づけ
project_channels（Slack/CW/Emailのチャネル設定）
  ↓ チャネル紐づけにより以下が自動で動く
  - メッセージ受信時 → プロジェクト自動推定
  - 種化時 → プロジェクト自動検出
  - 添付ファイル → 正しいDriveフォルダに振り分け
  - ビジネスイベント → 正しいプロジェクトに紐づけ
```

### フロー8: タスク/ジョブ ↔ Googleカレンダー双方向同期
```
tasks / jobs（スケジュール時刻あり）
  ↓ 作成時
Google Calendar（予定作成: extendedPropertiesにnodeMapType/nodeMapIdを埋め込み）
  ↓ 更新時
Google Calendar（予定更新）
  ↓ 完了/失敗時
Google Calendar（予定削除）

Google Calendar（既存の予定）
  ↓ 秘書チャットで空き時間検索
  ↓ NodeMapのタスク/ジョブのスケジュールも考慮（二重カウント防止）
findFreeSlots()（営業時間9-18、土日除外で空き枠を計算）
```

---

## 5. Cronバッチ処理一覧（自動実行）

| Cron | 実行タイミング | 処理内容 | 入力データ | 出力データ |
|---|---|---|---|---|
| enrich-contacts | 毎日21:00 | コンタクト情報をAIで充実化 | contact_persons | contact_persons（notes更新） |
| analyze-contacts | 毎日22:00 | AIコミュニケーション分析 | inbox_messages + contact_persons | contact_persons（分析結果） |
| extract-message-nodes | 毎日22:30 | メッセージからキーワード抽出 | inbox_messages | knowledge_master_entries + thought_task_nodes |
| sync-drive-documents | 毎日23:00 | メール添付→Drive自動保存 | inbox_messages（添付付き） | drive_file_staging + drive_documents |
| clean-drive-staging | 毎日0:30 | ステージングクリーンアップ | drive_file_staging | drive_file_staging（expired/削除） |
| sync-business-events | 毎日1:00 | メッセージ→ビジネスイベント | inbox_messages | business_events |
| summarize-business-log | 毎週月曜2:00 | AI週間活動要約 | business_events | business_events（要約） |
| cluster-knowledge-weekly | 毎週月曜2:30 | ナレッジAIクラスタリング | knowledge_master_entries | knowledge_clustering_proposals |
| compute-patterns | 毎日3:00 | コンタクトパターン分析 | inbox_messages + contact_persons | contact_patterns |
| analyze-thinking-tendency | 毎日4:00 | ユーザー思考傾向AI分析 | thought_task_nodes + task_conversations + thought_snapshots | user_thinking_tendencies |

---

## 6. 秘書AI（/agent）の意図分類と対応カード

秘書AIはユーザーの発言を意図分類（Intent）し、適切なカードを生成する。

| 意図（Intent） | トリガーワード | 表示されるカード | 使うデータ |
|---|---|---|---|
| briefing | おはよう、今日の状況、報告 | ブリーフィングサマリー + カレンダー予定 + 期限アラート + 未読サマリー + タスク再開 + ジョブ承認 | 全テーブル横断 |
| inbox | メッセージ、新着、受信 | InboxSummaryCard | inbox_messages |
| reply_draft | 返信＋下書き/作って | ReplyDraftCard | inbox_messages + contact_persons |
| create_job | しておいて、任せ、おまかせ | JobApprovalCard | inbox_messages + contact_persons + jobs |
| calendar | 予定、スケジュール、カレンダー | （テキスト応答） | Google Calendar |
| schedule | 日程＋調整、空き時間 | （テキスト応答） | Google Calendar + tasks + jobs |
| tasks | タスク、進行、期限 | TaskResumeCard | tasks |
| jobs | ジョブ、対応必要 | JobApprovalCard | jobs |
| file_intake | ファイル確認、届いた書類 | FileIntakeCard | drive_file_staging |
| store_file | 格納/保存＋ドライブ/フォルダ | StorageConfirmationCard | drive_documents + organizations + projects |
| documents | ドキュメント、書類一覧 | DocumentListCard | drive_documents |
| share_file | 共有＋ファイル/ドキュメント | （テキスト応答） | drive_documents |
| business_summary | 活動＋要約、週間レポート | BusinessSummaryCard | business_events |
| knowledge_structuring | ナレッジ＋提案/整理 | KnowledgeProposalCard | knowledge_clustering_proposals |
| thought_map | 思考、マップ | NavigateCard | （遷移のみ） |
| business_log | ログ、ビジネス | NavigateCard | （遷移のみ） |
| create_contact | コンタクト＋登録/追加 | ContactFormCard | contact_persons |
| create_task | タスクを作成、新しいタスク | TaskFormCard | tasks |
| task_progress | タスクを進めたい | TaskProgressCard | tasks + task_conversations |
| create_calendar_event | 予定＋追加/登録 | （テキスト応答） | Google Calendar |
| create_drive_folder | フォルダ＋作成 | （テキスト応答） | Google Drive + projects |
| consultations | 相談、未回答 | ConsultationCard | consultations + jobs |

---

## 7. 外部サービス連携

### Gmail（OAuth 2.0）
- スコープ: メール読み取り + 送信 + カレンダー読み書き + Drive
- トークン保存: user_service_tokens（service_name='gmail'）
- Gmail / Google Calendar / Google Drive は同じOAuthトークンを共有

### Slack（OAuth 2.0）
- スコープ: チャネル読み取り + メッセージ送信 + ファイル取得
- トークン保存: user_service_tokens（service_name='slack'）

### Chatwork（APIトークン）
- トークン保存: user_service_tokens（service_name='chatwork'）

### Google Calendar
- 読み取り: 今日/今週の予定取得
- 書き込み: タスク/ジョブの予定作成・更新・削除
- 空き時間検索: 営業時間9-18、土日除外、NodeMapスケジュール考慮

### Google Drive
- 親フォルダ: GOOGLE_DRIVE_ROOT_FOLDER_ID 配下に全フォルダ作成
- 4階層: 組織 → プロジェクト → 方向（受領/提出）→ 年月
- ファイル分類: AIが書類種別・方向・年月を自動判定
- 共有: 親フォルダの共有設定が配下に継承される

---

## 8. 画面チェックリスト

各画面が正しく動作しているか確認する際のチェック項目。

### 設定（/settings）— 最初に確認
- [ ] Gmail連携が有効（カレンダー・Driveスコープ含む）
- [ ] Slack連携が有効
- [ ] Chatwork連携が有効（該当する場合）
- [ ] 自社組織情報が設定済み
- [ ] プロフィールが設定済み

### インボックス（/inbox）
- [ ] 各チャネル（Email/Slack/Chatwork）のメッセージが表示される
- [ ] 未読/既読の切り替えが動作する
- [ ] メッセージ詳細が表示される
- [ ] 返信ボタン → AI下書き生成 → 送信が動作する
- [ ] 種にするボタン → 種作成（プロジェクト自動検出）が動作する
- [ ] ジョブにするボタン → ジョブ作成が動作する
- [ ] タスクにするボタン → タスク作成が動作する

### コンタクト（/contacts）
- [ ] コンタクト一覧が表示される（Email送信先 + Slack/CW受信者）
- [ ] コンタクト詳細（連絡先・メモ・AI分析）が表示される
- [ ] コンタクト編集が動作する
- [ ] 重複検出・マージが動作する
- [ ] 連絡先チャネル（email/slack/chatwork）の追加・編集が動作する

### 組織（/organizations）
- [ ] 組織一覧が表示される
- [ ] 組織作成（ドメイン重複チェック）が動作する
- [ ] 組織詳細ページ（/organizations/[id]）が表示される
- [ ] チャネル設定が動作する
- [ ] メンバー管理（追加・削除）が動作する
- [ ] メンバー追加時にcompany_name/relationship_typeが自動設定される

### タスク（/tasks）
- [ ] タスク一覧が表示される（進行中/完了/全て）
- [ ] タスク作成が動作する
- [ ] 構想メモ（ゴール・内容・懸念・期限）が編集できる
- [ ] AI会話が動作する
- [ ] スケジュール時刻設定 → Googleカレンダー同期が動作する
- [ ] タスク完了 → スナップショット記録 → カレンダー削除が動作する

### ジョブ（/jobs）
- [ ] ジョブ一覧が表示される（承認待ち/実行中/完了/全て）
- [ ] ジョブ承認 → 実行が動作する
- [ ] 返信ジョブ: メッセージ送信が動作する
- [ ] 日程調整ジョブ: カレンダー予定作成が動作する

### アイデアメモ（/memos）
- [ ] メモ一覧が表示される
- [ ] メモ作成・編集が動作する
- [ ] AI会話が動作する

### 秘書（/agent）
- [ ] ブリーフィング（「おはよう」）で全情報サマリーが表示される
- [ ] 未読メッセージ一覧が表示される
- [ ] 返信下書き → 承認 → 送信が動作する
- [ ] ジョブ作成 → 承認 → 実行が動作する
- [ ] カレンダー予定が表示される
- [ ] 空き時間検索が動作する
- [ ] 届いたファイル確認 → 承認/却下が動作する
- [ ] 活動要約が表示される
- [ ] ナレッジ提案が表示される

### 思考マップ（/thought-map）
- [ ] ユーザー一覧が表示される
- [ ] 全体マップモード: 全ノードが表示される
- [ ] 個別トレース: タスク選択 → 思考フローが表示される
- [ ] 比較モード: 2人のタスク比較が表示される
- [ ] リプレイモード: 完了タスクのAI対話が動作する
- [ ] ノードクリック → 会話ジャンプが動作する

### ビジネスログ（/business-log）
- [ ] プロジェクト一覧が表示される
- [ ] プロジェクト作成（組織紐づけ）が動作する
- [ ] イベント一覧（AI自動生成にBotラベル表示）が表示される
- [ ] イベント作成・編集・削除が動作する
- [ ] チャネル設定が動作する
- [ ] 全体ダッシュボード（プロジェクト未選択時）が表示される

### ナレッジ（/master）
- [ ] 領域・分野・キーワードのツリーが表示される
- [ ] 領域/分野/キーワードの追加・編集・削除が動作する
- [ ] 未確認ノード一覧 → 承認/削除が動作する
- [ ] AI提案履歴タブが表示される
- [ ] 提案の承認/却下が動作する

---

## 9. データの一生（ライフサイクル）

### メッセージの一生
```
外部サービスで送受信
  → inbox_messages に保存
  → コンタクト自動生成（contact_persons）
  → ビジネスイベント自動生成（business_events）
  → 添付ファイル → Drive自動保存（drive_file_staging → drive_documents）
  → 本文からキーワード抽出（knowledge_master_entries）
  → ユーザーの判断で: 種 / タスク / ジョブ に発展
```

### 種の一生
```
インボックスのメッセージから「種にする」
  → seeds に保存（プロジェクト自動検出）
  → AI会話で深掘り（seed_conversations）
  → 会話からキーワード抽出 → ナレッジ蓄積
  → 「タスクにする」で tasks に変換
  → 会話履歴が task_conversations に引き継ぎ
  → initial_goal スナップショット記録
```

### タスクの一生
```
種から変換 or 直接作成
  → tasks に保存（AI構造化でゴール・内容・期限を自動生成）
  → 構想メモ編集 → AI会話で伴走支援
  → 会話からキーワード抽出 → ナレッジ蓄積 → 思考動線記録
  → スケジュール設定 → Googleカレンダー同期
  → 完了 → final_landing スナップショット記録
  → 思考マップで可視化（個人の知識地図に統合）
```

### ナレッジキーワードの一生
```
AI会話/メッセージCron → 自動抽出（is_confirmed=false）
  → 週次AIクラスタリング → 領域/分野の提案
  → ユーザー承認 → is_confirmed=true + 領域/分野に分類
  → 思考マップのノードとして可視化
  → 複数タスクで同じキーワード → ノードが大きく表示（中心的な知識）
```

### ファイルの一生
```
メール添付/Slack/CWファイル → Cron検出
  → [NodeMap]一時保管フォルダにアップロード
  → AI自動分類（書類種別/方向/年月/リネーム候補）
  → drive_file_staging に登録（status=pending_review）
  → 秘書/agentで確認 → 承認 or 却下
  → 承認: 4階層フォルダに移動 + drive_documents 登録 + ビジネスイベント記録
  → 却下: 一時ファイル削除
  → 放置: 14日→expired、30日→完全削除
```
