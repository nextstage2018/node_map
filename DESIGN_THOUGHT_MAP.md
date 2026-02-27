# 思考マップ 体験価値設計書

**NodeMap Phase 42 設計ドキュメント**
最終更新: 2026-02-27

---

## 1. ビジョン

思考マップは「自分（とチーム）の思考の足跡が地形のように広がる風景」である。

整理されたダッシュボードではなく、知識ノードの集合体の上に、タスクごとの思考動線が描かれる。個人の振り返りだけでなく、チームの認識ズレを可視化し、過去の自分と対話して新しいオペレーションを生むための基盤。

### 1.1 思考マップで見える3つの層

**第1層：知識の全体地図（俯瞰）**
全ノードが広がり、密集＝よく考えた領域、疎＝手薄な領域。自分がどんな知識を持っているかの自己認識。

**第2層：タスクごとの思考動線（個別）**
タスクを選ぶとメインルート（黄色）と飛地（ピンク）が浮かぶ。「設計時の出口想定」と「実際の着地点」のズレが学びと発見を表す。

**第3層：次のアクション示唆（未来）**
飛地で止まったノード群＝検討したが深掘りしなかった領域が、次の種やタスクの候補になる。

### 1.2 組織的価値

**認識ズレの可視化**: AさんとBさんの同じタスクに対する思考動線を重ねると、分岐ポイント＝認識のズレの正体が見える。歩み寄りの出発点になる。

**思考の追体験**: タスク完了後の動線を見れば、新メンバーが「先輩はこのタスクをどう考えたか」を視覚的に理解できる。マニュアルではなく思考の道筋そのものがナレッジ。

**過去の自分との対話**: AIがその時点の思考状態（使ったノード、動線、飛地）をコンテキストとして持ち、「あのときの自分」として会話。新しいオペレーション創出。

---

## 2. ナレッジマスタ＝共有ノードDB

### 2.1 位置づけ

ナレッジマスタ（/master の knowledge_master_entries）が全従業員の共有ノードDBになる。個人の思考マップはこの共有DBの上に描かれる。誰かが使った知識は全員のマップの「地形」になる。

### 2.2 ノードの3つの供給源

| 供給源 | データ元 | 抽出タイミング |
|---|---|---|
| **種情報** | seeds + seed_conversations | 種の作成時・AI会話の毎ターン |
| **送受信メッセージ** | inbox_messages（Email/Slack/Chatwork） | メッセージ受信・送信時 |
| **タスク情報** | tasks + task_conversations | タスク進行中のAI会話の毎ターン |

### 2.3 承認フロー（知識保有の証明）

1. 上記3つの供給源からAIがキーワードを自動抽出
2. 「今週のノード振り返り」で本人に提示（週次 or 任意タイミング）
3. 本人が承認 → `is_confirmed = true` → その知識を保有している証明
4. 未承認ノード → マップ上で薄く表示（まだ自分のものになっていない知識）

---

## 3. データ構造設計

### 3.1 新規テーブル

#### thought_nodes（知識ノード ≒ ナレッジマスタの拡張）

既存の `knowledge_master_entries` を拡張する方針。

```
knowledge_master_entries（既存テーブルに以下カラムを追加）
  + category TEXT              -- analytics / tool / comm / tech / concept
  + source_type TEXT           -- seed / message / task / manual
  + source_id TEXT             -- 供給元のID（seed_id / message_id / task_id）
  + source_conversation_id UUID -- どの会話ターンで生まれたか
  + extracted_at TIMESTAMPTZ   -- 抽出日時
  + is_confirmed BOOLEAN DEFAULT false -- 本人が承認したか
  + confirmed_at TIMESTAMPTZ   -- 承認日時
```

#### thought_task_nodes（タスク/種とノードの紐づけ） ✅ 実装済み

```sql
CREATE TABLE thought_task_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,     -- NULLable（種の場合）
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,     -- NULLable（タスクの場合）
  node_id UUID NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  appear_order INT,            -- そのタスク/種内で何番目に出てきたか
  is_main_route BOOLEAN,       -- メインルートか飛地か（完了時に確定）
  appear_phase TEXT,            -- seed / ideation / progress / result
  source_conversation_id UUID,  -- どの会話ターンで生まれたか
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL),
  CONSTRAINT uq_thought_task_node UNIQUE (task_id, node_id),
  CONSTRAINT uq_thought_seed_node UNIQUE (seed_id, node_id)
);
```

> **設計変更**: 当初 task_id のみだったが、種（seed）フェーズでもノードを記録するため seed_id を追加。task_id/seed_id のどちらか一方が必須（CHECK制約）。

#### thought_edges（思考動線） ✅ 実装済み

```sql
CREATE TABLE thought_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,     -- NULLable（種の場合）
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,     -- NULLable（タスクの場合）
  from_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'main',  -- main / detour
  edge_order INT,              -- 動線の順序
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_edge_task_or_seed CHECK (task_id IS NOT NULL OR seed_id IS NOT NULL),
  CONSTRAINT uq_thought_edge_task UNIQUE (task_id, from_node_id, to_node_id),
  CONSTRAINT uq_thought_edge_seed UNIQUE (seed_id, from_node_id, to_node_id)
);
```

> **設計変更**: from_node_id/to_node_id の型を UUID → TEXT に変更（knowledge_master_entries.id がTEXT型のため）。seed_id を追加。UNIQUE制約でエッジの重複を防止。

#### thought_snapshots（出口想定と着地点） ⏳ 未実装（Phase 42e）

```sql
CREATE TABLE thought_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,  -- initial_goal / final_landing
  node_ids UUID[],             -- その時点の出口ノード群
  summary TEXT,                -- AIによる要約テキスト
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### thought_decisions（判断記録） ⏳ 未実装（Phase 42d後半）

```sql
CREATE TABLE thought_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES knowledge_master_entries(id),
  user_id TEXT NOT NULL,
  decision_text TEXT,          -- なぜこの選択をしたか
  alternatives TEXT[],         -- 検討した他の選択肢
  conversation_id UUID,        -- 判断が記録された会話ターン
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 既存テーブルとの関係

```
knowledge_master_entries ←──── thought_task_nodes ────→ tasks
        ↑                           ↑
        │                           │
   ノードの実体               タスクとの紐づけ
   （全従業員共有）            （個人のタスク内での位置づけ）
        │
        ↓
  thought_edges          thought_snapshots       thought_decisions
  （動線の記録）          （出口の記録）          （判断の記録）
```

---

## 4. 検索設計：過去の記憶をどう引っ張るか

### 4.1 3つの検索軸

#### 軸1：ノード（キーワード）検索

「GAに関連する過去の思考」→ thought_task_nodes で node_id = 'GA' のタスクを検索

```
入力: 現在のタスクで使っているノード群
出力: 同じノードを通った過去のタスク（重なりスコア順）
用途: 「前にもGAとBigQueryの組み合わせで考えたことがある」
```

#### 軸2：パターン（構造）検索

「出口がズレたタスク群」→ thought_snapshots で initial_goal と final_landing のノード重複率が低いタスク

```
入力: パターンの種類（出口ズレ / 飛地が多い / 一直線）
出力: 該当パターンの過去タスク
用途: 「同じように出口がズレた経験から学ぶ」
```

#### 軸3：文脈（プロジェクト・人）検索

「この組織で過去に考えたこと」→ tasks.project_id → projects.organization_id で検索

```
入力: プロジェクトID or 組織ID or ユーザーID
出力: その文脈内の全タスクの思考動線
用途: 「チームメンバーの思考動線との比較」
```

### 4.2 自動サジェスト

タスク進行中、AIが自動で関連タスクをサジェストする：

1. 会話でノードが抽出されるたびに、そのノードを含む過去タスクを裏で検索
2. 重なりスコアが閾値を超えたら「過去に似た思考パターンがあります」と提示
3. ユーザーが興味を示したら、その過去タスクの動線を思考マップ上で重ねて表示

---

## 5. 進行中の体験設計：何を・いつ・どのくらい会話するか

### 5.1 フェーズ1：種→タスク化（構想期）

**AIの役割**: 曖昧なアイデアを明確化する伴走パートナー

**記録すべきデータと会話アクション**:

| タイミング | AIのアクション | 記録されるデータ |
|---|---|---|
| 会話の毎ターン | キーワード自動抽出 | thought_task_nodes（seed_idとして） |
| 会話の毎ターン | 前のキーワードとの関連を記録 | thought_edges |
| タスク化の瞬間 | 「つまりゴールはこのあたりですね」と確認 | thought_snapshots(initial_goal) |
| タスク化の瞬間 | 種の全会話から構造化 | tasks.ideation_summary |

**会話頻度**: ユーザーが考えたいときに自由に。強制しない。

**AIの問いかけ例**:
- 「この中で一番大事なのはどれですか？」（優先ノードの特定）
- 「最終的にどうなっていれば成功ですか？」（出口想定の明確化）

### 5.2 フェーズ2：タスク進行中（実行期）

**AIの役割**: 伴走しながら思考の記録を残す

**記録すべきデータと会話アクション**:

| タイミング | AIのアクション | 記録されるデータ |
|---|---|---|
| 作業セッション開始時 | 「今どの辺りですか？」と進捗チェックイン | appear_order の更新 |
| 新しいキーワード出現時 | ノード自動抽出 + 「これは新しい方向ですね。メインの流れですか？」 | thought_task_nodes + is_main_route のヒント |
| 選択の分岐時 | 「AではなくBを選んだのはなぜですか？」 | thought_decisions |
| 寄り道が検出されたとき | 「これは検討したけど、本筋ではない感じですか？」 | edge_type = 'detour' |

**会話頻度**:
- 進捗チェックイン → 1日1回 or 作業セッション開始時（通知 or 自発的に開く）
- 分岐検出 → リアルタイム（会話中に自動）
- 判断記録 → 分岐が検出されたときのみ（頻繁すぎない）

**AIの問いかけ例**:
- 「Slackの話が出てきましたね。これはダッシュボードの件と繋がっていますか、それとも別の検討ですか？」（飛地判定）
- 「BigQueryではなくスプレッドシートを使うことにしたんですね。その判断の理由を教えてもらえますか？」（判断記録）

### 5.3 フェーズ3：タスク完了時（結果期）

**AIの役割**: 全体を振り返って構造化する

**記録すべきデータと会話アクション**:

| タイミング | AIのアクション | 記録されるデータ |
|---|---|---|
| タスク完了宣言時 | 全会話を振り返り、ノードのメイン/飛地を最終分類 | is_main_route の確定 |
| タスク完了宣言時 | 実際の着地点ノード群を特定 | thought_snapshots(final_landing) |
| タスク完了宣言時 | 出口想定との差分を明示 | summary テキスト |
| タスク完了宣言時 | 「今週のノード振り返り」用データを準備 | is_confirmed 候補リスト |

**AIの問いかけ例**:
- 「振り返ると、最初はGA周辺が出口のつもりでしたが、AI×Chatwork連携に着地しましたね。この変化はどう感じますか？」
- 「飛地で止まったAdobe AnalyticsとTableauの検討、今後また考える可能性はありますか？」（飛地→種の候補）

### 5.4 週次振り返り（承認フロー）

**タイミング**: 週1回（金曜 or 設定可能）

**内容**:
1. 今週の全ソース（種・メッセージ・タスク）から抽出されたノード一覧を提示
2. 「これは理解した」→ 承認（is_confirmed = true）
3. 「まだよくわからない」→ 未承認のまま（薄く表示）
4. 「これは違う」→ 削除 or 修正

---

## 6. AI対話モード：過去の自分と会話する

### 6.1 仕組み

タスク完了後、そのタスクの全データ（ノード、動線、飛地、判断記録、スナップショット）をコンテキストとしてAIに渡す。AIは「そのタスクを実行していた時点の自分」として応答する。

### 6.2 コンテキスト構成

```
あなたは以下のタスクを実行した人物の思考を再現してください。

タスク: {task.title}
期間: {task.created_at} → {task.completed_at}

使用したノード（メインルート順）: GA → サーチコンソール → GTM → ...
飛地で検討したノード: Adobe Analytics, Tableau, Python

出口想定（開始時）: GA周辺で完結するはず
実際の着地点: AI × Chatwork連携によるレポート自動化

判断記録:
- BigQueryではなくスプレッドシートを選んだ理由: コスト面
- Adobe Analyticsを断念した理由: 月額コストが見合わない
- PythonではなくAPI連携を選んだ理由: メンテナンス性

会話履歴: {task_conversations の全文}
```

### 6.3 活用場面

- 「あのとき別の選択肢もあったよね？」→ 飛地のノードを起点に別シナリオを検討
- 「なぜTableauをやめたの？」→ 判断記録から理由を返答
- 「今の知識で同じタスクをやるなら？」→ 新しいオペレーション案の創出
- チームメンバーが「あなたのこのタスクについて聞きたい」→ 本人不在でもAIが代理応答

---

## 7. 比較モード：チームの認識ズレを可視化

### 7.1 仕組み

同じプロジェクト内で、2人のユーザーの思考動線を重ねて表示する。

### 7.2 可視化要素

- **Aさんのメインルート（黄色）** と **Bさんのメインルート（青）**
- **分岐ポイント**（赤い円）: 同じノードを通ったのに、次に違うノードに進んだ地点
- **共通ノード**: 両者が通ったノードを強調表示
- **片方だけのノード**: 薄く表示（「この知識は相手にはない」）

### 7.3 活用場面

- 1on1ミーティングで「ここで考え方が分かれていたんだね」と共有
- プロジェクト振り返りで「チーム全体の思考パターン」を俯瞰
- 新メンバーのオンボーディングで「先輩たちはこう考えた」を追体験

---

## 8. 実装ロードマップ（優先順位）

### Phase 42a：ノード自動抽出の基盤 ✅ 実装完了（14fd589）
- ✅ AI会話（種・タスク）の毎ターンでキーワード自動抽出（Claude sonnet使用）
- ✅ knowledge_master_entries へのノード自動登録（id手動生成: `me_auto_${timestamp}_${random}`）
- ✅ thought_task_nodes テーブル作成・紐づけ（SELECT→INSERT方式）
- ✅ field_id NOT NULL制約解除（AI抽出では未分類が普通のため）
- ✅ classifyKeyword ルールベース分類（3段階マッチ: 完全一致→前方一致→部分一致）

### Phase 42b：送受信メッセージからのノード抽出 ⏳ 未実装
- inbox_messages からのキーワード自動抽出（受信時バッチ or Cron）
- 送信メッセージからも同様に抽出

### Phase 42c：週次振り返り・承認フロー ✅ 基盤実装済み
- ✅ 「今週のノード」提示UI（/master 画面内）
- ✅ 承認操作（is_confirmed フラグ管理）
- ⏳ 未承認・削除の操作UI改善

### Phase 42d：思考動線の記録 ✅ 実装完了（81abb4b）
- ✅ thought_edges テーブル作成（UNIQUE制約: 026マイグレーション）
- ✅ AI会話の毎ターンでノード間エッジを自動生成（前回最後のノード→今回の最初のノードも接続）
- ⏳ 飛地判定AI（is_main_route の自動判定）
- ⏳ thought_decisions（判断記録）

### Phase 42e：スナップショット（出口想定・着地点） ⏳ 未実装
- thought_snapshots テーブル作成
- タスク化時の出口想定自動保存
- タスク完了時の着地点自動生成

### Phase 42f：思考マップUI ✅ 基盤実装完了（81abb4b）
- ✅ Canvas描画（ノード・エッジ・ベジェ曲線）
- ✅ 3ステップUI: ユーザー選択→タスク/種選択→思考フロー可視化
- ✅ フェーズ別行レイアウト（seed/ideation/progress/result）
- ✅ ホバーツールチップ、順序番号表示
- ⏳ 時間スライダー
- ⏳ ノードタップ→会話ジャンプ

### Phase 42g：検索・サジェスト ⏳ 未実装
- ノード検索（キーワード軸）
- パターン検索（構造軸）
- 進行中タスクへの自動サジェスト

### Phase 42h：比較モード・AI対話モード ⏳ 未実装
- 2人の動線重ね表示
- 分岐ポイント検出
- 過去の思考再現AI対話

### Phase 42-fix：パイプライン安定化 ✅ 完了（eee93d5）
- ✅ Vercel fire-and-forget → await 対応
- ✅ knowledge_master_entries.id 手動生成
- ✅ field_id NOT NULL解除（マイグレーション025）
- ✅ JSON コードブロック除去（Claude API応答対応）
- ✅ classifyKeyword 変数未定義バグ修正（Supabase/デモ両ブランチ）
- ✅ linkToTaskOrSeed SELECT→INSERT化（UNIQUE制約なしでも動作）
- ✅ UNIQUE制約追加（マイグレーション026）
- ✅ extractKeywords モデル変更（opus → sonnet、コスト最適化）

---

## 9. データフロー全体図

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  種（Seed）   │   │ メッセージ    │   │ タスク（Task） │
│  + AI会話     │   │ Email/Slack/  │   │  + AI会話     │
│              │   │ Chatwork     │   │              │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          ▼
              ┌───────────────────────┐
              │   AI キーワード抽出    │
              │  （自動・毎ターン）    │
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │  knowledge_master_    │
              │  entries（共有ノードDB）│
              │  = ナレッジマスタ      │
              └───────────┬───────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │週次振り返り │  │thought_    │  │thought_    │
  │承認フロー   │  │task_nodes  │  │edges       │
  │is_confirmed│  │（紐づけ）   │  │（動線）     │
  └────────────┘  └────────────┘  └──────┬─────┘
                                         │
                    ┌────────────────────┼─────────────────┐
                    ▼                    ▼                 ▼
           ┌────────────┐     ┌──────────────┐    ┌────────────┐
           │thought_    │     │thought_      │    │思考マップ   │
           │snapshots   │     │decisions     │    │UI描画      │
           │（出口記録） │     │（判断記録）   │    │検索・比較   │
           └────────────┘     └──────────────┘    └────────────┘
```

---

## 10. モック

体験モックは `thought-map-mock.html` を参照。
インタラクティブなHTML/Canvasプロトタイプで以下を確認可能：
- 時間スライダーによるノード出現アニメーション
- タスク絞り込み
- 比較モード（AさんとBさんの動線重ね）
- AI対話モード（過去の思考再現）
- ノードクリック→会話表示
- 飛地→種化ボタン
