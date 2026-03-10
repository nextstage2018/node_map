# NodeMap v4.0 仕様書 — タスク管理リアーキテクチャ

最終更新: 2026-03-10

---

## 1. 背景と課題

### 現状の問題点

1. **秘書AI集約の限界**: タスク・MS・PJ管理を秘書との会話に集約したが、ステップが多く摩擦が大きい
2. **個人タスクの俯瞰ができない**: タスクはプロジェクト詳細の中に埋まっており、「今日やること」が横断的に見えない
3. **タスク発生の入口が少ない**: 現在はプロジェクト詳細画面 or 秘書AI経由のみ。Slack/Chatworkの会話から直接タスク化できない
4. **階層構造の任意性**: テーマ（ゴール/フェーズ相当）が任意で、進行管理の骨格が崩れうる

### 目指す姿

「議事録・チャット会話から自動でプロジェクト構造が生まれ、個人は自分のタスク一覧だけ見ていれば仕事が進む」

---

## 2. 設計思想

### 2つの入口、1つの構造

```
【ボトムアップ】個人の日常会話からタスクが生まれる
  Slack/Chatworkメッセージ → Bot検知 → AI解析 → タスク自動生成
  → チャネルからプロジェクト自動判定（1Ch=1PJ）
  → マイルストーンはAI推定 or 後から紐づけ

【トップダウン】チームの会議からプロジェクト構造が生まれる
  会議録 → AI解析 → ゴール/マイルストーン/タスク一括生成
  → 参加者が合意 → チーム全体で共有

両方が同じ階層構造に合流:
  Project → Goal（フェーズ） → Milestone → Task
```

### 3つの場所の役割分担

| 場面 | 場所 | やること |
|---|---|---|
| タスクを生む | Slack/Chatwork（ボトムアップ）or 会議録（トップダウン） | ワンアクションで生成 |
| タスクを見る・管理する | **タスク管理ページ（新設）** | 今日/今週/期限切れの俯瞰、完了操作 |
| タスクを深く考える | 思考マップ | シンジメソッドでAI壁打ち |
| タスクを完了する | タスク管理ページ or Slack/Chatwork | ワンタップで完了 |

---

## 3. 階層構造の確定

### 変更前（v3.x）

```
Organization > Project > Theme（任意） > Milestone > Task
```

### 変更後（v4.0）

```
Organization > Project > Goal（必須） > Milestone > Task
```

### 変更内容

| 項目 | 変更前 | 変更後 | 理由 |
|---|---|---|---|
| 名称 | Theme（テーマ） | **Goal（ゴール）** | 段階的な進行管理の意図を明確化 |
| 必須性 | 任意 | **必須** | 階層構造を崩さない |
| UI表現 | 折りたたみグループ | **フェーズ進行バー** | 進捗の可視化 |

### 各階層の定義（v4.0）

| 階層 | 定義 | 例 | 補足 |
|---|---|---|---|
| Organization | 取引先・所属組織 | A社、B社 | 変更なし |
| Project | 具体的な案件 | A社リブランディング | 変更なし |
| **Goal** | フェーズ・段階的なゴール | Phase1: 現状分析、Phase2: 戦略策定 | 旧Theme。必須化 |
| Milestone | ゴール内の到達点 | 競合分析完了、ペルソナ確定 | 変更なし（1週間サイクル推奨） |
| Task | 最小作業単位 | 競合3社のLP収集 | 変更なし |

### テーブル変更

#### themes → goals（リネーム）

```sql
-- テーブル名変更
ALTER TABLE themes RENAME TO goals;

-- カラム変更
-- sort_order → phase_order（フェーズ順序の意図を明確化）
ALTER TABLE goals RENAME COLUMN sort_order TO phase_order;

-- milestones テーブルの FK も変更
ALTER TABLE milestones RENAME COLUMN theme_id TO goal_id;
-- goal_id を NOT NULL に変更（新規作成時。既存データは移行スクリプトで対応）
```

#### goals テーブル（変更後）

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  phase_order INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. タスク管理ページ（新設）

### サイドメニュー追加

| 画面 | URL | アイコン |
|---|---|---|
| 秘書 | / | MessageSquare |
| **タスク** | **/tasks** | **CheckSquare** |
| インボックス | /inbox | Mail |
| 組織・プロジェクト | /organizations | Building |
| 設定 | /settings | Settings |
| ガイド | /guide | BookOpen |

※ 現在 `/tasks` は `/` にリダイレクト。v4.0でリダイレクトを解除して専用ページ化

### ページ構成

```
/tasks
├── フィルタータブ
│   ├── 今日（today）     — due_date = today OR scheduled_start ≤ today ≤ scheduled_end
│   ├── 今週（this_week） — due_date が今週内
│   ├── 期限切れ（overdue）— due_date < today AND status ≠ done
│   └── すべて（all）     — 全タスク（プロジェクト/ゴール/MSでグルーピング）
│
├── タスクカード（各タスク）
│   ├── タスク名
│   ├── プロジェクト名 > ゴール名 > MS名（パンくず）
│   ├── 期限（残り日数 or 超過日数）
│   ├── ステータス変更（todo → in_progress → done）
│   └── 思考マップへのリンク（タスクを深掘りしたい場合）
│
└── クイックアクション
    ├── タスク追加（手動。プロジェクト/MS選択）
    └── Slack/CWからの提案タスク一覧（承認/却下）
```

### タスクカードのデザイン方針

- ワンタップでステータス変更（チェックボックス）
- プロジェクト情報はパンくず形式で最小表示
- 期限が近いものは色で強調（赤: 期限切れ、黄: 今日、通常: 灰）
- 完了したタスクは取消線 + フェードアウト

### API

| メソッド | エンドポイント | 用途 |
|---|---|---|
| GET | `/api/tasks/my` | 自分のタスク一覧（フィルター対応） |
| PATCH | `/api/tasks/[id]/status` | ステータス更新（クイック完了用） |

---

## 5. Slack/Chatworkからのボトムアップタスク生成

### トリガー方式

| サービス | トリガー | 仕組み |
|---|---|---|
| Slack | Botメンション `@NodeMap タスクにして` or リアクション絵文字 ✅ | Slack Events API / Reactions API |
| Chatwork | Botメンション `[To:BotのaccountId] タスクにして` | Chatwork Webhook or Polling |

### 処理フロー

```
1. トリガー検知（Slack Event or Chatwork Webhook）
2. メッセージ取得（本文 + スレッド文脈）
3. AI解析
   - タスク内容の要約
   - 期限の自動検出（「明日まで」「来週中」→ 具体的日付に変換）
   - 担当者の推定（メンション先 or メッセージ送信者）
4. プロジェクト自動判定
   - チャネル → project_channels → project_id（1Ch=1PJ）
5. マイルストーン推定（オプション）
   - プロジェクトの進行中MS一覧を取得
   - タスク内容とMS名/説明を照合 → 最も近いMSに紐づけ
   - 確信度が低い場合は「未分類」として保留
6. タスク作成（tasks テーブルに INSERT）
7. Slack/Chatworkにレスポンス返信
   - 「タスクを作成しました: [タスク名] / 期限: [日付] / MS: [MS名]」
   - 修正ボタン or 「違う場合はこちら」リンク
```

### 完了通知フロー

```
タスク管理ページで完了操作
  → tasks.status = 'done' 更新
  → 元のSlack/Chatworkスレッドに完了通知を自動投稿
  「✅ タスク完了: [タスク名]」
```

### Webhookエンドポイント

| メソッド | エンドポイント | 用途 |
|---|---|---|
| POST | `/api/webhooks/slack/events` | Slack Events API受信 |
| POST | `/api/webhooks/chatwork/events` | Chatwork Webhook受信 |

### テーブル追加・変更

#### tasks テーブルへのカラム追加

```sql
-- タスクの発生元を追跡
ALTER TABLE tasks ADD COLUMN source_type TEXT DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'meeting_record', 'slack', 'chatwork', 'secretary'));
ALTER TABLE tasks ADD COLUMN source_message_id TEXT;  -- 元メッセージのID
ALTER TABLE tasks ADD COLUMN source_channel_id TEXT;   -- 元チャネルのID
ALTER TABLE tasks ADD COLUMN assigned_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL;
```

---

## 6. 会議録からのトップダウン生成（既存強化）

### 現状（v3.x）

会議録AI解析で `action_items` → `task_suggestions` に保存 → 秘書ブリーフィングで承認

### v4.0 強化

AI解析の出力を拡張し、ゴール/マイルストーン/タスクの階層構造を一括提案。

```
会議録AI解析の出力（v4.0）:
{
  "topics": [...],           // 既存: 検討ツリーノード用
  "action_items": [...],     // 既存: タスク提案用
  "goal_suggestions": [      // 新規: ゴール提案
    {
      "title": "Phase1: 現状分析",
      "description": "競合・市場・自社の現状を把握する",
      "milestones": [
        {
          "title": "競合分析完了",
          "target_date": "2026-03-17",
          "tasks": [
            { "title": "競合3社のLP収集", "assignee_hint": "鈴木", "due_date": "2026-03-14" },
            { "title": "競合のSNS分析", "assignee_hint": "田中", "due_date": "2026-03-15" }
          ]
        }
      ]
    }
  ],
  "open_issues": [...],      // v3.4: 未確定事項
  "decisions": [...]          // v3.4: 決定事項
}
```

### 承認UI

プロジェクト詳細 or タスク管理ページで、AI提案をプレビュー → 一括承認 or 個別編集 → 確定

---

## 7. サイドメニュー再構成

### 変更後のメニュー構成

| # | アイコン | ラベル | URL | 説明 |
|---|---|---|---|---|
| 1 | MessageSquare | 秘書 | / | AIアシスタント（会話型） |
| 2 | **CheckSquare** | **タスク** | **/tasks** | **個人タスク管理（新設）** |
| 3 | Mail | インボックス | /inbox | メッセージ管理 |
| 4 | Building | 組織・PJ | /organizations | プロジェクト構造管理 |
| 5 | Settings | 設定 | /settings | 個人設定 |
| 6 | BookOpen | ガイド | /guide | 操作ガイド |

---

## 8. 実装フェーズ

### Phase 1: 階層構造リネーム（Theme → Goal） ✅ 完了

- テーブル: themes → goals リネーム、milestone.theme_id → goal_id
- UI: 全コンポーネントの「テーマ」→「ゴール」表記変更
- API: `/api/goals` 新設、`/api/themes` は後方互換として残存
- 影響ファイル: GoalForm.tsx, GoalSection.tsx, TaskHierarchyView.tsx, 秘書AI intent

### Phase 2: タスク管理ページ（新設） ✅ 完了

- `/tasks` ページ作成（リダイレクト解除）
- タスクカードコンポーネント（MyTaskCard.tsx）
- フィルター（今日/今週/期限切れ/すべて）
- API: `/api/tasks/my`（横断取得）、`/api/tasks/[id]/status`（クイック更新）
- サイドメニューに「タスク」追加

### Phase 3: Slack Bot タスク生成 ✅ 完了

- Slack Events API Webhook受信（`/api/webhooks/slack/events`）
- 共通サービス: `taskFromMessage.service.ts`（シンプルキーワード抽出で高速化）
- プロジェクト自動判定（resolveProjectFromChannel 活用）
- マイルストーン推定ロジック（直近MSに自動紐づけ）
- 2段階レスポンス（即レス + 結果通知）
- tasks テーブルへの source_type / source_message_id / source_channel_id / assigned_contact_id カラム追加
- Slack App設定済み（Events API、app_mention/reaction_added）

### Phase 4: Chatwork Bot タスク生成 ✅ 完了

- Chatwork Webhook受信（`/api/webhooks/chatwork/events`）
- Bot専用アカウント（NodeMap AIエージェント）で運用
- アカウントイベント（mention_to_me）対応
- `CHATWORK_BOT_API_TOKEN` で返信（既存トークンと分離）
- Phase 3の共通ロジックを再利用

### Phase 5: 会議録からの階層一括生成強化 ⬚ 未着手

- AI解析の出力拡張（goal_suggestions 追加）
- 承認UIコンポーネント
- 一括作成API

### Phase 6: 完了通知・双方向同期 ⬚ 未着手

- タスク完了時にSlack/Chatworkへ通知
- Slack/Chatworkからの完了操作（リアクションで完了）

---

## 9. テーブル変更まとめ

### リネーム

| 変更前 | 変更後 |
|---|---|
| themes | goals |
| milestones.theme_id | milestones.goal_id |

### 新規カラム（tasks テーブル）

| カラム | 型 | 用途 |
|---|---|---|
| source_type | TEXT | タスクの発生元（manual/meeting_record/slack/chatwork/secretary） |
| source_message_id | TEXT | 元メッセージのID |
| source_channel_id | TEXT | 元チャネルのID |
| assigned_contact_id | TEXT | 担当者（contact_persons FK） |

### 新規テーブル

なし（既存テーブルの拡張で対応）

---

## 10. 既存機能への影響

| 機能 | 影響 | 対応 |
|---|---|---|
| 秘書AI（44 intent） | theme → goal の用語変更 | プロンプト・分類ロジック更新 |
| プロジェクト詳細 タスクタブ | テーマ → ゴール表記変更 | コンポーネント更新 |
| 会議録AI解析 | goal_suggestions 出力追加 | プロンプト拡張 |
| 検討ツリー | 影響なし | — |
| タイムライン | タスク完了イベントの強化 | business_events 生成ロジック更新 |
| 思考マップ | 影響なし（タスク単位の会話は変わらない） | — |
| `/tasks` リダイレクト | リダイレクト解除 → 専用ページ化 | ルーティング変更 |

---

## 11. 配色・デザイン方針

既存の nm-* カラートークンを踏襲。新規コンポーネントも同じ配色ルール（Slate基調 + Blueアクセント）を適用。

### タスクカードの色ルール

| 状態 | 背景 | ボーダー |
|---|---|---|
| 通常 | nm-surface (白) | nm-border (slate-200) |
| 期限切れ | red-50 | red-200 |
| 今日期限 | amber-50 | amber-200 |
| 完了 | nm-surface + opacity-50 | nm-border |

---

## 12. 参考: サポットさん（Sapot-san）との差別化

| 機能 | サポットさん | NodeMap v4.0 |
|---|---|---|
| Slackからタスク化 | ◯ | ◯ |
| Chatworkからタスク化 | × | ◯ |
| 期限自動検出 | ◯ | ◯ |
| リマインド | ◯（自動DM） | ◯（タスク管理ページ + 秘書ブリーフィング） |
| プロジェクト構造 | △（ポータルで分類） | ◯（Goal→MS→Task 階層構造） |
| 会議録からの自動生成 | × | ◯（検討ツリー・ゴール・MS・タスク一括） |
| 思考プロセスの記録 | × | ◯（思考マップ + シンジメソッド） |
| 意思決定の追跡 | × | ◯（検討ツリー + 決定ログ） |
| AI壁打ち | × | ◯（タスクAI会話） |
