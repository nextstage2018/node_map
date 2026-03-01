# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-03-01（Phase 42 + Restructure まで反映）

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
| `contact_persons` | コンタクト本体。id は TEXT型（自動生成なし）→ 必ず `'team_${Date.now()}_${random}'` 等で生成して渡す |
| `contact_channels` | コンタクトの連絡先。UNIQUE(contact_id, channel, address) 制約あり |
| `inbox_messages` | メッセージ本体（受信＋送信）。user_id カラムは存在しない。direction カラムで送受信を区別（received/sent） |
| `unified_messages` | 現在は空。inbox_messages を使うこと |
| `organizations` | 自社・取引先組織。domain で重複チェック。relationship_type / address / phone / memo カラムあり |
| `organization_channels` | 組織に紐づくチャネル（Slack/CW/Email）。UNIQUE(organization_id, service_name, channel_id) |
| `projects` | プロジェクト。organization_id で組織に紐づく |
| `project_channels` | プロジェクトとチャネルの紐づけ。UNIQUE(project_id, service_name, channel_identifier) |
| `seeds` | 種ボックス（段階的廃止予定）。project_id で紐づけ可。user_id カラムあり |
| `tasks` | タスク。id は UUID型（DEFAULT gen_random_uuid()）。seed_id / project_id / task_type('personal'\|'group') カラムあり |
| `jobs` | ジョブ（AIに委ねる日常の簡易作業）。type='schedule'\|'reply_later'\|'check'\|'other'。status='pending'\|'done'。思考マップ対象外 |
| `idea_memos` | アイデアメモ。断片的な思いつきを記録。tags TEXT[]。タスク変換機能なし |
| `memo_conversations` | メモのAI会話。turn_id で会話ターン管理 |
| `thought_task_nodes` | タスク/種とナレッジノードの紐づけ。UNIQUE(task_id, node_id) / UNIQUE(seed_id, node_id) |
| `thought_edges` | 思考動線。from_node_id→to_node_idの順序付きエッジ。UNIQUE(task_id, from_node_id, to_node_id) |
| `knowledge_master_entries` | ナレッジマスタ。Phase 42aで category / source_type / is_confirmed 等のカラム追加 |
| `thought_snapshots` | Phase 42e: タスクのスナップショット。snapshot_type = 'initial_goal' / 'final_landing'。node_ids TEXT[] |

---

## 画面・ルート一覧

| 画面 | URL | 主なテーブル |
|---|---|---|
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks / task_conversations |
| ジョブ | /jobs | jobs |
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
| 42f強化 | 思考マップ「地形ビュー」化: 力学シミュレーション空間配置・全体マップ/個別トレース2モード・フェーズゾーン背景・種→タスクノード統合・パン＆ズーム＋タイムスライダー | TBD |
| 42f残り | 会話ジャンプ（ノードクリック→元の会話表示）＋飛地→種化ボタン＋turn_idによる会話追跡基盤 | TBD |
| 42b | 送受信メッセージからのノード抽出（Cronバッチ）＋thought_task_nodesにmessage_id追加 | TBD |
| 42e | スナップショット（出口想定・着地点）＋思考マップUIにスナップショット比較パネル | TBD |
| 42g | ノード重なり検索API＋思考マップUI検索パネル＋関連タスク表示＋詳細タブ→変遷タブ転換 | TBD |
| 42h | 比較モード（2人の思考動線重ね・共有ノード・分岐点可視化）＋リプレイモード（完了タスクAI対話） | TBD |
| Restructure | ジョブ・アイデアメモ・タスク種別の再設計。jobs/idea_memos/memo_conversationsテーブル新設。タスクページからジョブ分離 | 0058180 |
| Inbox改善 | インボックスアクションボタン再定義（返信AI下書き自動・ジョブ種別選択・タスクAIフォーム）。返信プロンプトにコンタクト情報/過去やり取り/スレッド文脈を反映 | df71c96 |

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

### その他の未実装課題
1. **auto生成コンタクト同士の連絡先結合**: isAutoGenerated: true 同士の統合は未実装
2. **ビジネスログの活動履歴連携**: business_events の contact_id 未設定問題
3. **宛先サジェストのデータソース拡充**: API直接取得による全ルーム・全チャネル表示は未対応

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

## 環境変数（.env.local / Vercel）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
CRON_SECRET=
```
