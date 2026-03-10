# NodeMap V2 アーキテクチャ設計書

最終更新: 2026-03-10

> **ステータス**: V2全9フェーズ + v3.0〜v3.3 実装完了
> **前提**: CLAUDE.md が SSOT。本ファイルはアーキテクチャ詳細の補足

---

## 1. 設計思想の変更点

### 現行（V1）
- タスク単体が作業の最小単位
- 思考マップはキーワードノードの点の集合
- ビジネスログは組織詳細のタイムライン表示のみ

### 新設計（V2）
- **5階層の構造**: Organization > Project > Theme > Milestone > Task
- **タスクとジョブの明確な分離**: タスク＝思考を伴う作業、ジョブ＝定型作業
- **3つのログ**: ビジネスログ / 思考ログ / 検討ツリー
- **チェックポイント**: マイルストーン到達時のAI評価 + 自己学習
- **会議録が起点**: 検討ツリー生成・評価学習の両方を駆動

---

## 2. 5階層ヒエラルキーとジョブの位置づけ

### 思考の階層（5階層）

```
Organization（組織）
  └── Project（プロジェクト）
        ├── Theme（テーマ）※任意・推奨
        │     └── Milestone（マイルストーン）
        │           └── Task（タスク）
        └── Milestone（テーマなしの場合、直接）
              └── Task（タスク）
```

### 各階層の定義

| 階層 | 定義 | 例 | 必須 |
|---|---|---|---|
| Organization | 取引先・所属組織 | A社、B社 | 必須 |
| Project | 具体的な案件・取り組み | A社リブランディング | 必須 |
| Theme | プロジェクト内の大きな方向性・論点 | ターゲット再定義、ビジュアルアイデンティティ | **任意（推奨）** |
| Milestone | 1週間サイクルの到達点・チェックポイント | Week1: 現状分析完了 | 必須 |
| Task | 最小作業単位 | 競合3社のLP収集 | 必須 |

### テーマの扱い

- テーマは **任意の中間レイヤー**
- 小さなプロジェクトやテーマが明確に1つしかない場合は省略可能
- UIではテーマ作成を推奨するガイドを表示
- `milestones` テーブルは `theme_id`（nullable）と `project_id`（必須）の両方を保持

### ジョブの位置づけ（5階層の外）

**ジョブ＝定型作業・ルーティン業務。思考の制御の対象外。**

```
プロジェクト
  ├── Theme → Milestone → Task（思考を伴う進行）
  └── Job（定型提出物・ルーティン）※任意紐づけ
```

#### タスクとジョブの本質的な違い

| | タスク | ジョブ |
|---|---|---|
| 本質 | 思考を伴う作業 | 定型の提出物・繰り返し業務 |
| 例 | 競合分析レポート作成 | 月次SEOレポート提出 |
| 所属 | Milestone配下（必須） | プロジェクト紐づけ（任意） |
| 思考ログ | 生まれる | 生まれない |
| AI評価 | チェックポイントの対象 | 対象外 |
| 改善したい場合 | そのままタスクとして深掘り | プロジェクト化して別途取り組む |

#### 設計方針

- `jobs` テーブルに `project_id`（nullable FK）を追加
- マイルストーンには**紐づかない**（`milestone_id` は持たない）
- プロジェクトに紐づけてもいい、紐づけなくてもいい
- 紐づけない場合は「とりあえずのメモ」として機能
- インボックス → カレンダー → 秘書の即時対応フローが整っているため、「後でやる」のためだけにジョブを使う必要性は低い

---

## 3. 3つのログ

同じプロジェクトを **3つの異なる視点** で記録する。

```
プロジェクト
  │
  ├── ビジネスログ（時系列・チーム共有用）
  │     視点: "何が起きたか"
  │     生成: ほぼフルオート
  │     対象: チームメンバー全員
  │
  ├── 検討ツリー（階層・合意形成の軌跡）
  │     視点: "何を検討して何を決めたか"
  │     生成: 会議録アップロード → AI自動生成
  │     対象: 意思決定の追跡
  │
  └── 思考ログ（ノード・個人の思考経路）
        視点: "どう考えてゴールに至ったか"
        生成: マイルストーン間の個人作業で蓄積
        対象: 個人の知識管理
```

### 3.1 ビジネスログ

**現行の `business_events` テーブルをそのまま活用。**

- プロジェクト内で起きた事実の時系列記録
- メッセージ受信、会議録アップロード、タスク完了、ファイル送受信など
- ほぼフルオートで蓄積（Cron: `sync-business-events`）
- 主な目的: メイン担当者以外への情報共有
- UI: 組織詳細ページのタイムライン（既存実装）

**変更なし。**

### 3.2 検討ツリー（新規）

**会議での意思決定の構造を階層的に可視化する。**

#### 概要

- 会議録（テキスト or ファイル）のアップロードをトリガーにAIが自動生成
- 議題 → 選択肢 → 決定方針 の構造をツリーとして表現
- 方向転換時: 元のノードに「取消」マークを付け、新しいブランチを追加
- 取消ノードをクリックすると「どの会議で廃止されたか」のメモを表示

#### ツリー構造の例

```
広告運用プロジェクト
  ├── バナー検証 ← 第1回会議で決定
  │     ├── フレーム検証
  │     │     ├── 色検証 ← [取消] 第3回会議で方針変更
  │     │     └── ビジュアル検証
  │     └── テキスト検証
  └── LP改修 ← 第3回会議で追加
        └── ファーストビュー検証
```

#### ノードの状態

| 状態 | 意味 | 表示 |
|---|---|---|
| active | 現在有効な検討事項 | 通常表示 |
| completed | 検討完了・結論が出た | チェックマーク |
| cancelled | 方針変更で取消 | 取消線 + 理由メモ |
| on_hold | 一時保留 | グレーアウト |

#### 生成フロー

```
会議録アップロード
  → AI が議題・選択肢・決定方針を抽出
  → 既存ツリーとの差分を検出
  → 新ノード追加 / 既存ノードの状態変更
  → 変更理由メモを自動付与（会議名・日付・要旨）
```

### 3.3 思考ログ

**現行の `thought_task_nodes` + `thought_edges` を拡張。**

- マイルストーンの「スタート地点」から「ゴール」に至る個人の思考経路
- タスク処理の過程で得た知識・気づきをノードとして蓄積
- ノード間のエッジが「思考の道筋」を表現
- マイルストーン間が1つの思考ログの単位

#### 現行との違い

| 項目 | 現行 | V2 |
|---|---|---|
| スコープ | タスク単位 | マイルストーン間 |
| ノードの意味 | キーワード | 知識・気づき（より具体的） |
| 方向性 | ノード同士の関連 | スタート → ゴールへの経路 |
| 起点/終点 | なし | マイルストーンが起点と終点を定義 |

---

## 4. マイルストーンとチェックポイント

### 4.1 マイルストーンの定義

| 属性 | 型 | 説明 |
|---|---|---|
| id | UUID | 自動生成 |
| project_id | UUID | 必須。所属プロジェクト |
| theme_id | UUID | nullable。所属テーマ |
| title | TEXT | マイルストーン名 |
| description | TEXT | 到達条件・ゴールの説明 |
| start_context | TEXT | スタート地点の状況説明 |
| target_date | DATE | 到達予定日 |
| achieved_date | DATE | 到達日（自動記録） |
| status | TEXT | pending / in_progress / achieved / missed |
| sort_order | INT | 表示順 |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

### 4.2 1週間サイクル

- すべてのマイルストーンは **1週間サイクル** で設計
- 週の初めにマイルストーンのゴールが明確になっている状態
- 週の終わりに到達判定を行う
- 未達の場合、次週のマイルストーンで再計画

### 4.3 チェックポイント（AI評価）

マイルストーンの到達判定は **評価エージェント** が行う。

#### 評価フロー

```
配下タスク全完了 or 週末到来
  → 評価エージェントが起動
  → 以下を分析:
     ・当初のゴール（milestone.description）
     ・スタート地点（milestone.start_context）
     ・完了したタスクの成果
     ・思考ログの経路
  → 判定結果を生成:
     ・到達度（achieved / partially / missed）
     ・ズレの分析
     ・軌道修正の提案
  → 会議でプレゼン用のサマリーを出力
  → 会議後、議事録から人間のフィードバックを取得
  → 差分を学習データとして蓄積
```

#### AIの2つの性格

| 役割 | 名前 | 場面 | スタイル |
|---|---|---|---|
| タスク伴走AI | 壁打ちパートナー | タスク処理中のAI会話 | 協力的・Shinji Method・発散も許容 |
| 評価エージェント | マイルストーン評価者 | チェックポイント到達判定 | 構造的・客観的・ズレを正直に指摘 |

---

## 5. 評価エージェントの自己学習

### 5.1 学習サイクル

```
Week N:
  マイルストーン到達 → 評価エージェント判定
  → 「到達度: partially, ズレ: ○○」

  会議で議論 → 議事録アップロード
  → AI が議事録から該当マイルストーンへのフィードバックを抽出
  → 「人間の判定: achieved, 理由: △△を考慮すれば十分」

  差分記録:
  → AI判定: partially
  → 人間判定: achieved
  → 差分理由: 「△△の観点が評価に含まれていなかった」

Week N+1:
  次のマイルストーン評価時、過去の差分データを参照
  → プロンプトに「過去の学習: △△の観点も考慮すること」を注入
```

### 5.2 学習データの構造

| 属性 | 型 | 説明 |
|---|---|---|
| id | UUID | 自動生成 |
| milestone_id | UUID | 対象マイルストーン |
| ai_judgment | TEXT | AIの判定結果 |
| ai_reasoning | TEXT | AIの判定理由 |
| human_judgment | TEXT | 人間の判定結果（議事録から抽出） |
| human_reasoning | TEXT | 人間の判定理由 |
| gap_analysis | TEXT | 差分のAI分析 |
| learning_point | TEXT | 次回以降に反映すべき学び |
| meeting_record_id | UUID | 元になった会議録 |
| created_at | TIMESTAMPTZ | 記録日時 |

### 5.3 学習の反映方法

- 評価エージェント起動時、同一プロジェクトの過去の `learning_point` を収集
- システムプロンプトに「過去の学習」セクションとして注入
- 直近5件を優先（古いものは要約して圧縮）
- プロジェクトをまたいだ汎用学習は将来スコープ

---

## 6. 会議録の役割（全体の起点）

会議録は NodeMap V2 において **3つの機能を同時に駆動** する重要なデータ。

```
会議録アップロード
  │
  ├── 1. 検討ツリー更新
  │     議題・選択肢・決定を抽出 → ツリーに反映
  │
  ├── 2. 評価学習データ取得
  │     マイルストーンへのフィードバックを抽出 → 差分記録
  │
  └── 3. ビジネスログ追加
        会議イベントとして自動記録
```

### 会議録の形式

- テキスト入力（検討ツリータブから）
- MeetGeek Webhook（会議終了時に自動取り込み・プロジェクト自動判定）

### v3.0 追加: 議事録ファースト原則

すべてのプロジェクトデータは**会議録またはチャネルメッセージ**から自動生成される。

- タイムラインは**読み取り専用**（手動イベント追加は廃止）
- `create_business_event` intent は `upload_meeting_record` にリダイレクト
- MeetGeek連携: 会議終了 → Webhook → 参加者からPJ自動判定 → 議事録保存 → AI解析 → 検討ツリー・ビジネスイベント自動生成

### v3.0 追加: MeetGeek連携

**Webhook受信**: `POST /api/webhooks/meetgeek`

**取得データ**（5つのAPIを順次呼び出し）:
- `GET /meetings/{id}` — タイトル・参加者メール・ホスト・開始/終了時刻・タイムゾーン
- `GET /meetings/{id}/summary` — 要約テキスト + AI分析
- `GET /meetings/{id}/transcript` — 全文書き起こし（発言者・タイムスタンプ付き）
- `GET /meetings/{id}/highlights` — ハイライト（アクションアイテム等）
- **録画リンク**: 4時間期限付き → `GET /api/meeting-records/[id]/recording` でオンデマンド取得（保存しない）

**保存カラム**: participants(JSONB), meeting_start_at, meeting_end_at, metadata(JSONB), highlights(JSONB)

プロジェクト自動判定の優先順位:
0. 参加者メール → `contact_channels` → `contact_persons` → 所属`organization` → `projects`
1. 参加者名（トランスクリプトのspeaker）→ `contact_persons` → 所属`organization` → `projects`
2. 同日の`business_events`（会議）とサマリーテキスト照合
3. フォールバック: 最新プロジェクト

環境変数: `MEETGEEK_API_KEY`, `MEETGEEK_WEBHOOK_SECRET`

### v3.0 追加: 対称データパイプライン

2つの入口から5つの出力が対称的に自動生成される。

```
入口A-1: 会議録（手動 or MeetGeek Webhook）
  → AI解析（/meeting-records/[id]/analyze）
    ├── business_events（会議イベント自動追加）
    ├── decision_tree_nodes（topics → ツリー生成、confidence=0.85）
    ├── knowledge_master_entries（キーワード抽出、source_meeting_record_id付き）
    ├── task_suggestions（action_items → 秘書画面で承認UI）
    └── evaluation_learnings（milestone_feedback → 自己学習）

入口A-2: チャネルメッセージ（Slack/Chatwork Cron同期）
  → sync-business-events（毎日01:00 UTC）
    └── business_events（メッセージイベント自動追加）
  → sync-channel-topics（毎日01:30 UTC）
    └── decision_tree_nodes（トピック抽出 → ツリー統合、confidence=0.6）
  → extract-message-nodes（毎日22:30 UTC）
    └── knowledge_master_entries（キーワード抽出）
```

**検討ツリーのソース統合**: 両入口からのノードは `source_type` で区別（meeting/channel/hybrid）。
同一トピックのマージ時は confidence を再計算し、source_type を 'hybrid' に更新。

### v3.0 追加: タスク提案パイプライン

会議録AI解析で action_items を自動抽出 → task_suggestions テーブルに保存 → 秘書ブリーフィングでカード表示。

```
会議録AI解析 → action_items[] 抽出
  → assignee名で contact_persons をマッチング
  → task_suggestions に JSONB 保存（status: pending）
  → 秘書ブリーフィング時に task_proposal カード表示
  → ユーザーが承認 → POST /api/tasks で個別タスク作成
  → ユーザーが却下 → status: dismissed に更新
```

### v3.0 追加: 秘書UI改善

- コンテキスト自動注入（URLパラメータ: projectId, taskId, organizationId, messageId, contactId）
- カード型選択UI（action_selector, project_selector, milestone_selector）
- プロジェクト詳細画面からの遷移時にコンテキストバッジ表示

### v3.0 追加: MCPサーバー

`mcp-server/` に実装。Claude CodeからNodeMapデータにアクセスする3ツール:
- `get_project_context`: プロジェクト全コンテキスト取得
- `create_meeting_record`: 会議録作成（AI解析パイプライン起動）
- `get_decision_tree`: 検討ツリー取得

### v3.3: プロジェクト中心リストラクチャリング

**組織→プロジェクトへの権限移譲**:
- 組織レベルは「設定」タブのみに縮小
- メンバー・チャネル管理はプロジェクト配下に移動
- 7タブ構成: タイムライン/検討ツリー/思考マップ/タスク/ジョブ/メンバー/関連資料

**チャネル＝プロジェクト（1Ch=1PJ）を体現するUI**:
- 「メンバー」タブにチャネル管理を統合
- チャネル登録 → メンバー自動取り込み（inbox_messages送信者検出）→ 編集/削除
- フォールバック廃止: 新PJはメンバー0人で開始

**関連資料タブ**:
- MS/タスク/ジョブをプルダウン指定 → フォルダパスをカード内表示
- drive_documentsにmilestone_id/job_id追加

---

## 7. 新規テーブル設計（概要）

既存テーブルへの変更は最小限に抑え、新規テーブルで拡張する。

### 7.1 新規テーブル

| テーブル | 用途 | 主キー |
|---|---|---|
| `themes` | テーマ（任意の中間レイヤー） | UUID |
| `milestones` | マイルストーン（1週間チェックポイント） | UUID |
| `decision_trees` | 検討ツリーのルート | UUID |
| `decision_tree_nodes` | 検討ツリーのノード | UUID |
| `decision_tree_node_history` | ノードの状態変更履歴 | UUID |
| `meeting_records` | 会議録 | UUID |
| `milestone_evaluations` | チェックポイント評価結果 | UUID |
| `evaluation_learnings` | 評価エージェント学習データ | UUID |

### 7.2 既存テーブルへの変更

| テーブル | 変更内容 |
|---|---|
| `tasks` | `milestone_id` カラム追加（nullable、FK） |
| `jobs` | `project_id` カラム追加（nullable、FK）— プロジェクトへの任意紐づけ |
| `thought_task_nodes` | `milestone_id` カラム追加（nullable）— 思考ログのスコープ拡張 |
| `thought_edges` | 変更なし（milestone_id はノード側で管理） |
| `business_events` | `meeting_record_id` カラム追加（nullable）— 会議録との紐づけ |

### 7.3 テーブル詳細

#### themes

```sql
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### milestones

```sql
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_context TEXT,
  target_date DATE,
  achieved_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'achieved', 'missed')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### meeting_records

```sql
CREATE TABLE meeting_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT DEFAULT 'text' CHECK (source_type IN ('text', 'file', 'transcription', 'meetgeek')),
  source_file_id TEXT,
  ai_summary TEXT,
  processed BOOLEAN DEFAULT false,
  user_id TEXT,
  -- v3.0: MeetGeek連携強化
  participants JSONB DEFAULT '[]'::jsonb,
  meeting_start_at TIMESTAMPTZ,
  meeting_end_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  highlights JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_meeting_records_source
  ON meeting_records(source_type, source_file_id)
  WHERE source_file_id IS NOT NULL;
```

#### decision_trees

```sql
CREATE TABLE decision_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### decision_tree_nodes

```sql
CREATE TABLE decision_tree_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES decision_trees(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('topic', 'option', 'decision', 'action')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'on_hold')),
  description TEXT,
  cancel_reason TEXT,
  cancel_meeting_id UUID REFERENCES meeting_records(id),
  source_meeting_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  -- v3.0: ソース統合
  source_type TEXT DEFAULT 'meeting' CHECK (source_type IN ('meeting', 'channel', 'hybrid')),
  confidence_score NUMERIC(3,2) DEFAULT 0.85,
  source_message_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### decision_tree_node_history

```sql
CREATE TABLE decision_tree_node_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES decision_tree_nodes(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  meeting_record_id UUID REFERENCES meeting_records(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);
```

#### milestone_evaluations

```sql
CREATE TABLE milestone_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN ('auto', 'manual')),
  achievement_level TEXT NOT NULL CHECK (achievement_level IN ('achieved', 'partially', 'missed')),
  ai_analysis TEXT,
  deviation_summary TEXT,
  correction_suggestion TEXT,
  presentation_summary TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);
```

#### evaluation_learnings

```sql
CREATE TABLE evaluation_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ai_judgment TEXT NOT NULL,
  ai_reasoning TEXT,
  human_judgment TEXT,
  human_reasoning TEXT,
  gap_analysis TEXT,
  learning_point TEXT,
  meeting_record_id UUID REFERENCES meeting_records(id),
  applied_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. UI構造（V2）

### 8.1 サイドメニュー

V1の6項目 → V2の4項目に集約。

```
V1（現行）              V2
─────────────          ──────────────
秘書            →  秘書（全体俯瞰ダッシュボード）
インボックス     →  インボックス（メッセージ）
タスク           →  （プロジェクト詳細に統合）
思考マップ       →  （プロジェクト詳細に統合）
組織・プロジェクト →  組織・プロジェクト（すべての作業の起点）
設定            →  設定（個人設定 + ナレッジ閲覧）
```

**移動の理由**:
- タスクはマイルストーン配下であり、プロジェクトの文脈なしに見ても意味が薄い
- 思考マップはマイルストーン間の経路であり、プロジェクト単位で見るのが自然
- 横断的な「今日のタスク」は秘書ダッシュボードが担う

### 8.2 プロジェクト詳細ページ（タブ構成）

```
プロジェクト詳細
  ├── タイムライン    ← ビジネスログ（既存を継続）
  ├── 検討ツリー      ← 会議録から生成（新規）
  ├── 思考マップ      ← マイルストーン間の思考経路（移動）
  ├── タスク          ← マイルストーン → タスク一覧（移動）
  └── ジョブ          ← 定型業務リスト（移動）
```

### 8.3 秘書ダッシュボード（横断ビュー）

プロジェクトをまたいだ全体俯瞰を提供。

```
秘書ダッシュボード
  ├── 今日のタスク（全PJ横断）
  ├── 直近のインボックス
  ├── 今日の予定
  └── 対応が必要なジョブ
```

### 8.4 ナレッジの扱い

- **プロジェクト横断**で個人の知識ノードを蓄積（現行と同じ）
- サイドメニューやプロジェクト詳細には**表示しない**
- 設定ページ内で閲覧可能（能動的に見に行く頻度は低い）
- AIがタスク会話・評価時に関連ナレッジを自動参照する**バックエンド基盤**として機能
- 思考マップ表示時、関連ナレッジノードを自動で引用

---

## 9. 実装フェーズ（全完了）

| Phase | 内容 | 状態 |
|---|---|---|
| V2-A | DB: 新規テーブル作成 + 既存テーブル変更 | ✅ 完了 |
| V2-B | UI構造変更: サイドメニュー4項目化 + プロジェクト詳細タブ構成 | ✅ 完了 |
| V2-C | テーマ・マイルストーンの CRUD API + UI | ✅ 完了 |
| V2-D | 会議録アップロード + AI解析基盤 | ✅ 完了 |
| V2-E | 検討ツリー: AI生成 + ツリーUI | ✅ 完了 |
| V2-F | チェックポイント: 評価エージェント + 判定UI | ✅ 完了 |
| V2-G | 自己学習: 差分記録 + 議事録からの学習 + プロンプト注入 | ✅ 完了 |
| V2-H | 思考ログ拡張: マイルストーン間スコープ | ✅ 完了 |
| V2-I | 統合: 秘書AIへの新intent追加 + ダッシュボード更新 | ✅ 完了 |
| v3.0-1 | 対称データパイプライン（会議録⇔チャネル） | ✅ 完了 |
| v3.0-2 | タスク提案パイプライン（action_items → 秘書承認UI） | ✅ 完了 |
| v3.0-3 | MeetGeek連携強化（全データ取得・録画リンクAPI） | ✅ 完了 |

---

## 10. 既存機能との関係

### 変更しないもの

- ビジネスログ（`business_events`）の基本構造
- 秘書AIの既存intent（新intentは追加のみ）
- インボックス・メール休眠
- カレンダー連携
- 1Ch=1PJルール
- Shinji Methodプリセット（タスク伴走AIで引き続き使用）

### 移動・統合するもの

- タスク一覧: サイドメニュー独立画面 → プロジェクト詳細のタブ
- 思考マップ: サイドメニュー独立画面 → プロジェクト詳細のタブ
- ナレッジ: 思考マップのタブ → 設定ページ内 + バックエンド基盤
- ジョブ: 独立管理 → プロジェクト詳細のタブ（任意紐づけ）

### 拡張するもの

- `tasks` テーブル: `milestone_id` 追加
- `jobs` テーブル: `project_id` 追加
- `thought_task_nodes`: `milestone_id` 追加
- 秘書AI: 会議録関連・マイルストーン関連の新intent追加
- 秘書ダッシュボード: 横断タスクビュー強化

### 新規で作るもの

- テーマ管理UI
- マイルストーン管理UI（1週間サイクルビュー）
- 会議録アップロード + AI解析
- 検討ツリーUI（ツリー図 + ノード詳細パネル）
- チェックポイント評価UI（評価結果 + 差分表示）
- 評価エージェント（新しいAIエンドポイント）
- 自己学習基盤（差分記録 + プロンプト注入）
