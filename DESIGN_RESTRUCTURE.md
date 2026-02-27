# NodeMap 再設計書：ジョブ・タスク・アイデアメモ・ナレッジ

最終更新: 2026-02-27

---

## 1. 現状の課題

### 種（Seed）→ タスク変換の二重構造
現在、アイデアは「種ボックス」に登録 → AI会話で深掘り → タスクに変換 → タスクでまたAI会話、という二重の構造になっている。この結果：
- 種とタスクの両方にAI会話が存在し、どちらが「本体」かわかりにくい
- 種→タスク変換時に会話履歴を引き継ぐ処理が複雑
- 思考マップ上で種フェーズとタスクフェーズを統合表示する特殊処理が必要

### ナレッジの品質問題
- キーワード抽出が名詞・専門用語に限定されておらず、曖昧な表現や動詞的フレーズまで拾ってしまう
- 登録されたナレッジがAI会話で活用されていない（入口だけで出口がない）
- 未分類ノードの管理UIがない

### 日常の簡易作業の置き場がない
- メール返信、日程調整などの簡易作業もタスクとして登録すると、思考マップにノイズが増える
- AIに委ねたい定型作業を軽く管理する仕組みがない

---

## 2. 新しい構造

### 2.1 全体像

```
┌─────────────────────────────────────────────────────────┐
│                    ナレッジノード                          │
│  （全AI会話から抽出される知識の全量データ。出自を問わない）    │
│  名詞・固有名詞・専門用語のみ。区別なし。                    │
└──────────┬──────────────┬──────────────┬────────────────┘
           │              │              │
     ┌─────▼─────┐  ┌────▼─────┐  ┌────▼──────┐
     │   ジョブ    │  │  タスク   │  │アイデアメモ│
     │  (jobs)    │  │ (tasks)  │  │  (memos)  │
     └───────────┘  └──────────┘  └───────────┘
```

### 2.2 ジョブ（Jobs）

**定義**: AIに委ねたい日常の簡易作業リスト

**特徴**:
- メール返信、日程調整、定型連絡など、「考える必要がない」作業
- AIが自動で下書き・処理提案できる
- 思考マップには載らない（ナレッジノード抽出をスキップ）
- ステータスは `pending` / `done` のみ（フェーズ概念なし）

**例**:
- 「◯◯さんにミーティング日程を返信する」
- 「見積書をPDFで送る」
- 「Slackの未読を確認して返す」

### 2.3 タスク（Tasks）

**定義**: 思考を伴う本格的な取り組み。個人タスクとグループタスクの2種類。

#### 個人タスク
- 旧「種」の役割を吸収。タスク作成時点から構想フェーズとしてAI会話が始まる
- 1人で考え、掘り下げ、形にしていく過程
- ライフサイクル: **構想（ideation）→ 進行（progress）→ 結果（result）**
- 思考マップの主役。AI会話からナレッジノードが自動抽出される

#### グループタスク
- プロジェクトに紐づき、複数人で取り組む
- 各メンバーがそれぞれAI会話をしながら進める
- 思考マップの比較モード（Phase 42h）が活きる場面
  - 共有ノード: メンバー間で同じ知識を持っている
  - 分岐点: 認識がズレている箇所

**タスクの種類判別**:
- `task_type`: `'personal'` | `'group'`
- グループタスクは `project_id` が必須

### 2.4 アイデアメモ（Memos）

**定義**: どこにも依存しない断片的な思いつき。気軽な場所。

**特徴**:
- タスクには紐づかない。あくまでメモ
- AI会話で深掘りはできる（メモの内容について質問や整理ができる）
- ナレッジノードは抽出される（知識の全量データに組み込まれる）
- ただし思考マップ上では、タスクの流れに乗っていないノードとして存在するだけ
- タスクへの変換機能は**持たない**（旧種との違い。二重構造を避けるため）

**旧「種」との違い**:
| | 旧・種 | 新・アイデアメモ |
|---|---|---|
| タスクへの変換 | あり（confirmSeed） | なし |
| AI会話 | あり → タスク変換後にまたAI会話 | あり（メモの深掘りのみ） |
| ナレッジ抽出 | あり | あり |
| ステータス | pending → confirmed | なし（メモは常にメモ） |
| プロジェクト紐づけ | あり | なし |

### 2.5 ナレッジノード（Knowledge Nodes）

**定義**: 個人の知識の全量データ。出自（ジョブ・タスク・メモ）を問わず、全てのAI会話から抽出される。

**重要な制約: 名詞に特化する**

現在のキーワード抽出プロンプトでは「業務に関連する重要なキーワード（名詞・専門用語・概念）」としているが、実際には曖昧な表現が多く混入している。以下のルールを厳格化する：

**抽出対象（✅）**:
- 固有名詞: 「Google Analytics」「Slack」「Vercel」
- 専門用語: 「損益分岐点」「KPI」「リードタイム」
- 技術用語: 「React」「PostgreSQL」「REST API」
- 業務概念（名詞形）: 「顧客管理」「在庫管理」「採用計画」
- 製品・サービス名: 「ChatGPT」「Notion」「Figma」

**抽出対象外（❌）**:
- 動詞・形容詞的表現: 「検討する」「新しい」「重要な」
- 文脈依存の曖昧語: 「今月の施策」「あのプロジェクト」「新しいアプローチ」
- 一般的すぎる名詞: 「件」「こと」「もの」「方法」「内容」「状況」「対応」
- 時間表現: 「来週」「今月」「先日」
- 人称・代名詞: 「自分」「相手」「みんな」

**ナレッジノードの使われ方**:
- タスクのAI会話で出現 → `thought_task_nodes` でタスクに紐づく → 思考マップに線で結ばれる
- メモのAI会話で出現 → `knowledge_master_entries` に登録される → タスクの流れには乗らない
- ジョブからは抽出しない（思考マップのノイズ防止）

---

## 3. DBスキーマ変更

### 3.1 新規テーブル: `jobs`

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done'
  source_message_id TEXT,                  -- インボックスから作成時
  source_channel TEXT,                     -- 'email' | 'slack' | 'chatwork'
  ai_draft TEXT,                           -- AIが生成した下書き/提案
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
```

### 3.2 新規テーブル: `idea_memos`

```sql
CREATE TABLE IF NOT EXISTS idea_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- メモのAI会話用
CREATE TABLE IF NOT EXISTS memo_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id UUID NOT NULL REFERENCES idea_memos(id) ON DELETE CASCADE,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  turn_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_idea_memos_user_id ON idea_memos(user_id);
CREATE INDEX idx_memo_conversations_memo_id ON memo_conversations(memo_id);
```

### 3.3 `tasks` テーブル変更

```sql
-- タスク種類の追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'personal';
-- 'personal' | 'group'

-- グループタスク用: 参加メンバー
-- （project経由で組織メンバーを参照するため、別テーブルは不要。
--   project_id が NOT NULL ならグループタスク）

-- 構想フェーズの初期コンテキスト（旧seedのcontent相当）
-- ※ 既存の ideation_summary カラムで代用可能
```

### 3.4 `seeds` テーブル → 廃止（段階的移行）

**Phase 1（今回）**: 新規の種作成を停止。新しいフローではタスクまたはアイデアメモとして作成。
**Phase 2（次回以降）**: 既存の種データを移行（confirmed → tasks に統合済み、pending → idea_memos に移行）。
**Phase 3**: seeds テーブルと関連テーブル（seed_conversations）を削除。

### 3.5 `thought_task_nodes` テーブル変更

```sql
-- アイデアメモからのノード紐づけ用
ALTER TABLE thought_task_nodes ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE CASCADE;

-- 既存のCHECK制約を更新（task_id OR seed_id OR memo_id のいずれかが必須）
-- ※ seed_id は移行完了まで残す
ALTER TABLE thought_task_nodes DROP CONSTRAINT IF EXISTS chk_task_or_seed;
ALTER TABLE thought_task_nodes ADD CONSTRAINT chk_task_or_seed_or_memo
  CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL OR memo_id IS NOT NULL);

-- UNIQUE制約追加
ALTER TABLE thought_task_nodes ADD CONSTRAINT uq_thought_memo_node UNIQUE (memo_id, node_id);
```

### 3.6 `thought_edges` テーブル変更

```sql
-- アイデアメモからのエッジ用
ALTER TABLE thought_edges ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES idea_memos(id) ON DELETE CASCADE;

ALTER TABLE thought_edges DROP CONSTRAINT IF EXISTS chk_edge_task_or_seed;
ALTER TABLE thought_edges ADD CONSTRAINT chk_edge_task_or_seed_or_memo
  CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL OR memo_id IS NOT NULL);
```

---

## 4. キーワード抽出プロンプトの改定

### 現在のプロンプト（問題あり）

```
あなたはテキスト分析の専門家です。
与えられたテキストから以下の3種類の情報を抽出してください。

1. keywords: 業務に関連する重要なキーワード（名詞・専門用語・概念）
2. persons: 人名（敬称を除く）
3. projects: プロジェクト名・案件名・サービス名

ルール：
- 各項目にconfidence（信頼度 0.0〜1.0）を付与
- 一般的すぎる単語（「件」「こと」「もの」等）は除外
- 同じ意味の表現は正規化して1つにまとめる
- 最大でkeywords 10個、persons 5個、projects 3個まで
```

### 改定後のプロンプト

```
あなたはナレッジ抽出の専門家です。
与えられたテキストから、個人の知識体系を構成する「名詞」のみを抽出してください。

## 抽出ルール

### keywords（名詞・専門用語のみ）
以下に該当するものだけを抽出すること：
- 固有名詞（製品名・サービス名・企業名）: Google Analytics, Slack, Salesforce
- 専門用語・業界用語: 損益分岐点, KPI, リードタイム, LTV
- 技術用語: React, PostgreSQL, REST API, Docker
- 業務概念（名詞形のみ）: 顧客管理, 在庫管理, 採用計画, SEO対策

以下は絶対に抽出しないこと：
- 動詞・形容詞: 「検討する」「重要な」「新しい」
- 曖昧な一般名詞: 「件」「こと」「もの」「方法」「内容」「状況」「対応」「作業」「確認」「報告」「連絡」「相談」
- 文脈がないと意味が定まらない語: 「今月の施策」「あのプロジェクト」「新しいやり方」
- 時間表現: 「来週」「今月」「先日」
- 人称・代名詞: 「自分」「相手」「チーム」

### persons（人名のみ）
- 敬称（さん・様・氏）を除いた人名のみ
- 役職名（部長・マネージャー）は除外

### projects（案件名のみ）
- 明確に案件・プロジェクト・サービスとして言及されているもののみ

## 品質基準
- confidence は 0.7 以上のもののみ返すこと（0.7未満は除外）
- 迷ったら抽出しない（精度 > 網羅性）
- 最大 keywords 8個、persons 5個、projects 3個

必ず以下のJSON形式のみで返してください（前置きや説明は不要）：
{
  "keywords": [{"label": "...", "confidence": 0.9}],
  "persons": [{"label": "...", "confidence": 0.95}],
  "projects": [{"label": "...", "confidence": 0.8}]
}
```

**変更点まとめ**:
1. 抽出対象を「名詞のみ」に厳格化（具体例を豊富に提示）
2. 除外対象を明示的にリスト化（曖昧語・動詞・時間表現・人称）
3. confidence閾値を 0.6 → 0.7 に引き上げ
4. 最大keywords数を 10 → 8 に削減（精度重視）
5. 「迷ったら抽出しない」の原則を明記

---

## 5. 画面・ルートの変更

### 5.1 変更一覧

| 画面 | 現在のURL | 変更後 | 内容 |
|---|---|---|---|
| 種ボックス | /seeds | **廃止** | タスクとアイデアメモに分離 |
| ジョブ | なし | **/jobs（新設）** | 簡易作業リスト |
| アイデアメモ | なし | **/memos（新設）** | 断片的メモ＋AI深掘り |
| タスク | /tasks | /tasks（変更なし） | 個人/グループの区別を追加 |
| インボックス | /inbox | /inbox（変更なし） | 「種にする」→「タスクにする」or「メモにする」or「ジョブにする」に変更 |
| 思考マップ | /thought-map | /thought-map（変更なし） | タスクのみ表示（ジョブは除外） |
| ナレッジ | /master | /master（改善予定） | 未分類管理・確認フローを追加（別Phase） |

### 5.2 インボックスからの振り分けフロー

```
受信メッセージを選択
  ↓
振り分けメニュー:
  ├─「タスクにする」→ タスク作成（構想フェーズから開始）
  ├─「メモにする」→ アイデアメモ作成
  └─「ジョブにする」→ ジョブ作成（AIが下書き提案）
```

### 5.3 タスク作成フローの変更

**現在**:
```
インボックス → 種を作成 → 種でAI会話 → タスクに変換 → タスクでAI会話
```

**変更後**:
```
インボックス → タスクを作成（構想フェーズ）→ タスクでAI会話（最初から最後まで一貫）
```

タスク作成時に、旧 `confirmSeed` が行っていたAI構造化（タイトル・ゴール・内容の自動生成）は、タスクの初回AI会話として統合する。

---

## 6. API変更

### 6.1 新規API

```
POST   /api/jobs          → ジョブ作成
GET    /api/jobs          → ジョブ一覧取得
PUT    /api/jobs/[id]     → ジョブ更新（ステータス変更含む）
DELETE /api/jobs/[id]     → ジョブ削除

POST   /api/memos         → アイデアメモ作成
GET    /api/memos         → メモ一覧取得
PUT    /api/memos/[id]    → メモ更新
DELETE /api/memos/[id]    → メモ削除
POST   /api/memos/chat    → メモAI会話（深掘り）
```

### 6.2 変更API

```
POST /api/tasks
  → task_type ('personal' | 'group') パラメータ追加
  → sourceContent パラメータ追加（インボックスからの初期コンテキスト）
  → AI構造化を初回作成時に実行（旧confirmSeedの統合）

POST /api/tasks/chat
  → ナレッジノード抽出は従来通り実行
  → ジョブからは呼ばれない
```

### 6.3 廃止API（段階的）

```
POST   /api/seeds          → 廃止（Phase 1）
GET    /api/seeds          → 読み取り専用で残す（既存データ参照用）
POST   /api/seeds/chat     → 廃止（Phase 1）
POST   /api/seeds/[id]/confirm → 廃止（Phase 1）
POST   /api/seeds/convert  → 廃止（Phase 1）
```

---

## 7. ナレッジ抽出の実行条件

| 操作 | ナレッジ抽出 | 思考マップ表示 |
|---|---|---|
| タスクのAI会話 | ✅ 実行 | ✅ ノード＋エッジ表示 |
| アイデアメモのAI会話 | ✅ 実行 | ノードは登録されるがタスクの流れには乗らない |
| ジョブ | ❌ スキップ | ❌ 表示しない |
| Cronメッセージ抽出 | ✅ 実行 | ノードは登録されるがタスクの流れには乗らない |

---

## 8. 思考マップへの影響

### 変更点
1. **種フェーズの扱い**: タスク内の構想フェーズ（`appear_phase = 'ideation'`）として統合。`seed_id` 経由の統合処理は段階的に不要になる
2. **ジョブは除外**: 思考マップAPIでジョブからのノードをフィルタリング（そもそもジョブからは抽出しないので自動的に除外）
3. **メモからのノード**: `thought_task_nodes` に `memo_id` で紐づくが、エッジがないためマップ上では孤立点。タスクのAI会話で同じキーワードが出れば自動的にタスクの流れに組み込まれる

### 変更不要な点
- Canvas描画ロジック（力学シミュレーション、パン＆ズーム等）
- 全体マップ / 個別トレース のモード切替
- 比較モード / リプレイモード
- スナップショット（initial_goal / final_landing）

---

## 9. 実装順序

### Phase A: タスク構造変更（優先度: 高）
1. `tasks` テーブルに `task_type` カラム追加
2. タスク作成APIにAI構造化を統合（旧confirmSeedの機能）
3. タスク一覧UIに個人/グループ表示を追加
4. インボックスの「種にする」を「タスクにする」に変更

### Phase B: ジョブ機能（優先度: 高）
1. `jobs` テーブル作成
2. ジョブCRUD API
3. /jobs ページ作成
4. インボックスに「ジョブにする」を追加

### Phase C: アイデアメモ（優先度: 中）
1. `idea_memos` / `memo_conversations` テーブル作成
2. メモCRUD API + AI会話API
3. /memos ページ作成
4. インボックスに「メモにする」を追加
5. `thought_task_nodes` に `memo_id` カラム追加

### Phase D: キーワード抽出の品質改善（優先度: 高）
1. `keywordExtractor.service.ts` のプロンプト改定
2. confidence閾値を 0.7 に引き上げ
3. 既存の低品質ノードのクリーンアップ（オプション）

### Phase E: 種の段階的廃止（優先度: 低）
1. 新規種作成の停止（UI・APIのルーティング変更）
2. 既存pendingの種 → アイデアメモへの移行スクリプト
3. /seeds ページの廃止
4. seeds テーブル・seed_conversations テーブルの削除（最終段階）

### Phase F: ナレッジ活用の強化（優先度: 中、別設計書で詳細化）
1. AI会話にナレッジコンテキストを追加
2. /master ページの実用化（確認フロー・未分類管理）
3. メッセージノード抽出のバグ修正

---

## 10. 移行時の注意事項

### データ互換性
- 既存の `seed_id` を持つタスクは、移行後も `seed_id` カラムで参照可能（段階的廃止のため）
- `thought_task_nodes` の `seed_id` は移行完了まで残す
- 思考マップAPIの種統合ロジック（`seed_id` 経由）は、全ての種が移行されるまで維持

### 既存ユーザーへの影響
- 種ボックスの既存データは閲覧可能のまま残す（Phase E完了まで）
- 新規作成のみ新しいフロー（タスク/メモ/ジョブ）に誘導
- 既存の種からタスクへの変換は、移行期間中は旧フローも動作させる
