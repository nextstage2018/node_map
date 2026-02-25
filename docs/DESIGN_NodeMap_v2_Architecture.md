# NodeMap v2 アーキテクチャ設計書

## 1. 現状の課題と進化の方向性

### 1.1 現行NodeMapの到達点
- 統合インボックス（Gmail / Slack / Chatwork）
- コンタクト管理（関係タイプ分類、ブロックリスト）
- 種ボックス（メッセージからのメモ保存）
- ナレッジパイプライン（キーワード抽出 → マスター登録 → 個人ノード追加）
- 思考マップ（ノード可視化）
- AI下書き、スレッド要約

### 1.2 根本的な課題
1. **案件の全体像が見えない** — 個人の受信メッセージは見えるが、案件単位の経緯（受領資料、提出物、会議決定事項、議事録）が蓄積される場所がない。他メンバーが途中から参加しても状況を掴めない。
2. **情報が個人に閉じている** — タスクもナレッジも個人スコープ。チーム（4名〜将来数十名）で共有できるビジネスコンテキストがない。
3. **ツールの方向性** — 「統合メッセージツール」を超えるには、個人の秘書的エージェント＋案件ベースのビジネスログが必要。

### 1.3 進化の方向性
NodeMapを「統合メッセージツール」から**「種（Seeds）を中心とした案件ベースのビジネスプラットフォーム」**に進化させる。

---

## 2. コアコンセプト：種（Seeds）がすべての入り口

### 2.1 思想
> すべての情報はまず「種」に放り込む。
> 種の中で会話し、育て、アイデア化する。
> そこからナレッジも思考マップもビジネスログも自然に育つ。

種は「NotebookLM + 個人アイデア帳」のようなもの。形式を問わず、何でも放り込める場所。

### 2.2 種に入るもの
- メッセージからのメモ（現行機能）
- 会議の議事録・決定事項
- 受領資料・提出資料のリンクや要約
- 思いつきのアイデア・メモ
- AIエージェントからの提案・分析結果
- 外部ドキュメント（Google Docs等）の参照

### 2.3 種の成長フロー
```
[投入]                [育成]                [結実]
何でも種に放り込む → 種の中で会話・整理 → ナレッジ/タスク/ビジネスログに自然変換

 メール断片          AI と対話            思考マップに反映
 会議メモ            タグ付け・分類        ビジネスログに蓄積
 アイデア            関連種とリンク        タスクとして提案
 資料リンク          チームに共有          ナレッジとして定着
```

### 2.4 種の中での会話
種は単なるメモではなく、**会話可能なオブジェクト**。
- 種に対してAIと対話し、アイデアを深掘りできる
- 会話履歴が種に蓄積される
- 十分に育った種は、AIが「ナレッジ化」「タスク化」「ビジネスログ登録」を提案する
- ユーザーが落ち着いた時に自分で整理してもよい

---

## 3. 2つのレイヤー構造

### 3.1 概要
```
┌─────────────────────────────────────────────────────┐
│  個人レイヤー（NodeMap）                               │
│  ・インボックス（Gmail/Slack/Chatwork）                 │
│  ・種ボックス（すべての入り口）                          │
│  ・思考マップ（ノード可視化）                            │
│  ・ナレッジ（個人の知識ベース）                          │
│  ・パーソナルエージェント（秘書）                        │
└───────────────────┬─────────────────────────────────┘
                    │ 個人が普通に使う → 自然にチームに蓄積
┌───────────────────▼─────────────────────────────────┐
│  チームレイヤー（ビジネスログ）                          │
│  ・プロジェクト別タイムライン                            │
│  ・議事録・意思決定ログ                                │
│  ・タスク（AI提案 → 人が採用/修正/削除）                 │
│  ・資料ログ（受領/提出）                               │
│  ・サブエージェント群                                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 自然蓄積の仕組み
ビジネスログは「意識して書くもの」ではない。個人がNodeMapを普通に使っていたら自然に溜まる。

| 個人の行動 | 自動的にビジネスログに蓄積されるもの |
|---|---|
| メールを送受信 | クライアントとのやり取り履歴 |
| 会議に参加（Google Calendar） | イベント＋議事録＋決定事項 |
| 種にメモを投入 | プロジェクト紐付きの種 → ナレッジ |
| タスクを完了 | 進捗ログ |
| 資料を共有 | 受領/提出資料ログ |

---

## 4. 個人レイヤー（NodeMap）詳細

### 4.1 既存機能の位置づけ
| 機能 | 維持/変更 | 備考 |
|---|---|---|
| インボックス | 維持 | 個人のメッセージハブとして継続 |
| コンタクト | 維持 | プロジェクト紐付けを追加 |
| 種ボックス | **大幅拡張** | 全情報の入り口に昇格。会話機能追加 |
| ナレッジ | 維持 | 種からの自然生成を強化 |
| 思考マップ | 維持 | 種・ナレッジからの自動反映を強化 |

### 4.2 種ボックスの拡張仕様
```
種（Seed）{
  id: string
  title: string
  content: string              // 本文（マークダウン）
  source_type: 'manual' | 'message' | 'calendar' | 'document' | 'agent'
  source_id?: string           // 元メッセージID、カレンダーイベントID等
  project_id?: string          // プロジェクト紐付け（任意）
  tags: string[]
  conversations: SeedConversation[]  // AI との会話履歴
  status: 'raw' | 'growing' | 'mature' | 'archived'
  visibility: 'personal' | 'team'   // チーム共有フラグ
  created_by: string
  created_at: timestamp
  updated_at: timestamp
}

SeedConversation {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: timestamp
}
```

### 4.3 パーソナルエージェント（秘書）
個人専属のAIエージェント。以下を参照して動作する：
- 個人のインボックス、種、ナレッジ、思考マップ
- ビジネスログ（チーム共有情報）

**できること：**
- 質問応答（「A社の最新の状況は？」「先週の会議で何が決まった？」）
- タスク提案（「この種、そろそろタスク化しませんか？」）
- 情報収集（「A社関連のメールと議事録をまとめました」）
- 種の整理提案（「これらの種は関連しています。統合しますか？」）

---

## 5. チームレイヤー（ビジネスログ）詳細

### 5.1 画面構成（UIデザイン参照）

**左サイドバー：**
- ナビゲーション（タイムライン / カレンダー / タスク管理）
- プロジェクト一覧（クライアント単位 or 自社プロダクト単位）
- グループ一覧（チーム単位）
- 今日の概要（進行中タスク / 期限間近 / 完了済み）

**中央：タイムライン**
- 日付ごとにイベントを時系列表示
- イベント種別：会議 / 通話 / メール / タスク
- ステータスバッジ：upcoming / completed
- プロジェクト名表示
- プロジェクト × グループでフィルタ可能

**右パネル：イベント詳細（4タブ）**
1. **会議チェック** — Google Docs連携で議事録を読み込み・表示
2. **タスク** — AIが提案するタスクカード。採用/修正/削除を選択。AI信頼度・担当者表示
3. **議事録** — 議題、決定事項、アクションアイテム（担当者+期限）
4. **過去ログ** — 同一会議体の過去回の主要決定事項・議論された課題・次回アクションを時系列表示

### 5.2 データモデル

```
Project {
  id: string
  name: string                 // 例: "AIチャットボット開発", "ECサイトリニューアル"
  type: 'client' | 'internal'  // クライアント案件 or 自社プロダクト
  client_name?: string
  description: string
  members: string[]            // user_id[]
  status: 'active' | 'completed' | 'on_hold'
  created_at: timestamp
}

Group {
  id: string
  name: string                 // 例: "AIエンジニアチーム", "QAチーム"
  members: string[]
  created_at: timestamp
}

BusinessEvent {
  id: string
  project_id: string
  type: 'meeting' | 'call' | 'email' | 'task' | 'document'
  title: string
  description: string
  status: 'upcoming' | 'completed'
  scheduled_at: timestamp
  participants: string[]
  google_calendar_event_id?: string
  google_doc_id?: string       // 議事録ドキュメント
  related_seed_ids: string[]   // 紐付く種
  metadata: Record<string, any>
  created_at: timestamp
}

MeetingMinutes {
  id: string
  event_id: string             // BusinessEvent.id
  series_name?: string         // 例: "週次進捗報告会議" （過去ログ用）
  series_number?: number       // 例: 8 （第8回）
  agenda: string[]             // 議題
  decisions: string[]          // 決定事項
  action_items: ActionItem[]
  discussed_topics: string[]   // 議論された課題
  google_doc_url?: string
  created_at: timestamp
}

ActionItem {
  id: string
  minutes_id: string
  description: string
  assignee: string             // user_id
  due_date?: date
  status: 'pending' | 'in_progress' | 'done'
}

DocumentLog {
  id: string
  project_id: string
  event_id?: string
  type: 'received' | 'submitted'  // 受領 or 提出
  title: string
  url?: string                 // Google Drive等のリンク
  description: string
  uploaded_by: string
  created_at: timestamp
}

ProposedTask {
  id: string
  event_id: string
  title: string
  description: string
  assignee?: string
  ai_confidence: number        // 0.0〜1.0
  priority: 'high' | 'medium' | 'low'
  status: 'proposed' | 'adopted' | 'modified' | 'rejected'
  source: string               // どのエージェントが提案したか
  created_at: timestamp
}
```

### 5.3 Google Calendar API連携
- Googleカレンダーからイベントを自動取得 → BusinessEventに変換
- 会議の参加者、日時、Google Meetリンク等を自動設定
- 会議に紐付くGoogleドキュメント（議事録）を自動検出・読み込み
- カレンダーの変更をWebhookまたはポーリングで同期

---

## 6. エージェントアーキテクチャ

### 6.1 全体構成
```
┌─────────────────────────────────────────────────────┐
│          パーソナルエージェント（秘書）                   │
│  参照: インボックス / 種 / ナレッジ / ビジネスログ        │
│  機能: 質問応答 / タスク提案 / 情報収集 / 種の整理       │
└──────────────────┬──────────────────────────────────┘
                   │
    ┌──────────────┼──────────────────┐
    │              │                  │
    ▼              ▼                  ▼
┌────────┐  ┌──────────┐  ┌──────────────┐
│ 請求     │  │ 営業      │  │ 工数管理      │
│エージェント│  │エージェント │  │エージェント    │
└────────┘  └──────────┘  └──────────────┘
    │              │                  │
    └──────────────┼──────────────────┘
                   ▼
          ビジネスログに反映
          タスク提案・分析結果
```

### 6.2 パーソナルエージェント（秘書）
- 各ユーザーに1体
- 個人の種・ナレッジ・インボックス＋チームのビジネスログを横断的に参照
- 「A社の件、最近どうなってる？」→ ビジネスログ + メール + 議事録から要約
- 「来週の会議、何を準備すべき？」→ 過去ログ + タスク状況から提案
- 種が溜まってきたら整理・タスク化・ナレッジ化を提案

### 6.3 サブエージェント群（将来拡張）
| エージェント | 参照データ | アウトプット |
|---|---|---|
| 請求エージェント | 工数ログ、契約情報、タスク完了履歴 | 請求書ドラフト、請求漏れアラート |
| 営業エージェント | メール履歴、コンタクト、商談ログ | フォローアップ提案、案件ステータス分析 |
| 工数管理エージェント | タスクログ、カレンダー、ビジネスイベント | 工数レポート、稼働率分析、リソース配分提案 |

サブエージェントの提案はすべて**ProposedTask**としてビジネスログに登録され、人が「採用/修正/削除」を判断する。

---

## 7. データフロー全体像

```
[外部サービス]
  Gmail ─────┐
  Slack ─────┤
  Chatwork ──┤──→ インボックス ──→ 種に保存（任意）
  Google     │                        │
  Calendar ──┤──→ ビジネスイベント ──→ 種に保存（自動）
  Google     │         │
  Docs ──────┘         ├──→ 議事録
                       ├──→ タスク提案
                       └──→ 意思決定ログ

[種ボックス（すべての入り口）]
  ├── AI会話で深掘り
  ├── タグ付け・プロジェクト紐付け
  ├── visibility: personal → team に昇格
  │
  ├──→ ナレッジ（自然生成）
  ├──→ 思考マップ（自動反映）
  ├──→ ビジネスログ（チーム共有）
  └──→ タスク（提案 or 手動作成）

[エージェント]
  パーソナル秘書 ──→ 種の整理提案 / タスク提案 / 質問応答
  サブエージェント ──→ 専門分析 / ProposedTask生成
```

---

## 8. コンタクト強化設計（マスターデータ + 簡単登録 + 既存統合）

### 8.1 現状の課題
1. **登録手段がない** — コンタクトはメッセージ受信時の自動生成のみ。自社メンバーやクライアント企業を能動的に登録できない。
2. **情報がバラバラ** — 各ユーザーが個別にコンタクトを持つため、同じクライアントの情報が人によって異なる。
3. **プロジェクト紐付けがない** — コンタクトとプロジェクトの関係性が管理されていない。

### 8.2 設計思想：共有マスターデータ
コンタクト情報を「個人のアドレス帳」から「チーム共有のマスターデータ」に昇格させる。

```
[共有マスター]                    [個人ビュー]
Organization（企業）              各ユーザーのインボックスに
  └── Contact（人物）             自動生成されたコンタクトは
        └── Project紐付け         マスターと自動マッチング
```

### 8.3 データモデル

#### 組織（Organization）— 新規テーブル
```
Organization {
  id: string (UUID)
  name: string                    // "株式会社ネクストステージ", "クライアントA社"
  type: 'own' | 'client' | 'partner' | 'vendor'
  domain?: string                 // "nextstage.co.jp" — メールドメインで自動マッチ用
  description?: string
  website?: string
  industry?: string
  address?: string
  created_by: string
  created_at: timestamp
  updated_at: timestamp
}
```

#### コンタクト（Contact）— 既存テーブル拡張
```
Contact（既存 + 拡張）{
  // --- 既存フィールド ---
  id: string
  name: string
  address: string                 // メールアドレス
  channels: json                  // {channel, address, frequency}[]
  relationship_type: string       // 'internal' | 'client' | 'partner' | 'unknown'
  confidence: number
  confirmed: boolean
  main_channel: string
  message_count: number
  last_contact_at: timestamp
  company_name: string
  department: string
  notes: string
  visibility: string

  // --- 新規フィールド ---
  organization_id?: string        // → Organization.id（マスター紐付け）
  role?: string                   // "プロジェクトマネージャー", "エンジニア"
  phone?: string
  is_team_member: boolean         // 自社メンバーフラグ（=ログインユーザー候補）
  source: 'auto' | 'manual' | 'import' | 'invite'  // 登録元
  master_matched: boolean         // マスターとマッチ済みか
  master_matched_at?: timestamp
}
```

#### プロジェクトメンバー（ProjectMember）— 新規テーブル
```
ProjectMember {
  id: string
  project_id: string              // → Project.id
  contact_id: string              // → Contact.id
  role: 'owner' | 'member' | 'observer' | 'client_contact'
  joined_at: timestamp
}
```

### 8.4 簡単登録UI

#### A. 初回セットアップウィザード
新規ユーザーまたはチーム管理者が最初に実行。3ステップ。
```
Step 1: 自社情報
  ・会社名、ドメイン（メール自動マッチに利用）

Step 2: 自社メンバー登録
  ・名前 + メールアドレスで追加（1行1名、複数一括入力可）
  ・CSV インポートボタン
  ・招待メール送信（Supabase Auth の invite）

Step 3: 最初のプロジェクト（任意）
  ・プロジェクト名 + クライアント企業名
  ・メンバーをドラッグ or チェックで割り当て
```

#### B. クイック登録（通常利用時）
コンタクト一覧ページ・ビジネスログ画面から常時アクセス可能。

```
[＋ コンタクト追加] ボタン
  → モーダル表示
  ┌────────────────────────────────┐
  │ 名前:    [____________]        │
  │ メール:  [____________]        │
  │ 所属:    [▼ 組織を選択/新規作成] │
  │ 役割:    [____________]        │
  │ タイプ:  ○自社 ○クライアント    │
  │          ○パートナー ○その他    │
  │ プロジェクト: [▼ 紐付け（任意）] │
  │                                │
  │      [キャンセル]  [登録]       │
  └────────────────────────────────┘
```

#### C. CSVインポート
```
テンプレートCSV:
名前,メールアドレス,会社名,部署,役割,タイプ
田中太郎,tanaka@nextstage.co.jp,ネクストステージ,開発部,エンジニア,自社
佐藤花子,sato@client-a.co.jp,クライアントA社,企画部,PM,クライアント
```
- テンプレートダウンロード → 記入 → アップロードの3ステップ
- インポート時にOrganizationを自動作成（会社名が新規なら）
- 重複チェック（メールアドレスで検出）

#### D. コンタクトページからの昇格
既存の自動生成コンタクトを「マスター登録」する動線。
```
コンタクト詳細パネル（既存）
  ├── [🏢 組織に紐付け] ボタン追加
  │     → 既存組織を選択 or 新規作成
  ├── [📋 プロジェクトに追加] ボタン追加
  │     → プロジェクト選択
  └── [👥 自社メンバーに設定] トグル追加
```

### 8.5 自動マッチングロジック

メッセージ受信で自動生成されたコンタクトを、マスターデータと自動紐付けする。

```
自動マッチングのトリガー:
  1. 新規コンタクト自動生成時
  2. 新規Organization登録時（既存コンタクトを再スキャン）
  3. 日次バッチ（未マッチコンタクトを再チェック）

マッチングルール（優先順位順）:
  1. メールアドレス完全一致
     → contact.address === master_contact.address
  2. メールドメイン一致
     → contact.address のドメイン === organization.domain
     → organization_id を設定、relationship_type を推定
  3. 名前 + チャネル一致
     → Slack/Chatworkの表示名がマスターの name と一致
  4. AI推定（将来）
     → メール署名やメッセージ内容から所属組織を推定

マッチング結果:
  - 高確信（ルール1,2）→ 自動紐付け + confirmed = true
  - 中確信（ルール3）  → 自動紐付け + confirmed = false（ユーザー確認待ち）
  - 低確信（ルール4）  → 提案のみ（UI上で「この人はA社ですか？」）
```

### 8.6 共有と権限

```
データの共有範囲:
  Organization  → チーム全員が参照・編集可能
  Contact       → マスター紐付き = チーム共有
                   マスター未紐付き = 個人のみ（既存動作を維持）
  Project       → メンバーのみ参照可能
  ProjectMember → プロジェクトオーナーが管理

編集の競合防止:
  - 楽観的ロック（updated_at チェック）
  - 編集履歴ログ（誰がいつ何を変更したか）
```

### 8.7 UI変更まとめ

| 画面 | 変更内容 |
|---|---|
| サイドバー | 「組織管理」メニュー追加 |
| コンタクト一覧 | 「+コンタクト追加」「CSVインポート」ボタン追加。組織カラム強化 |
| コンタクト詳細パネル | 組織紐付け、プロジェクト追加、自社メンバー設定ボタン追加 |
| 設定画面 | 初回セットアップウィザード、組織CRUD |
| ビジネスログ | プロジェクトメンバー管理（コンタクトから選択） |

### 8.8 DB マイグレーション

```sql
-- 新規テーブル: organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'client'
    CHECK (type IN ('own', 'client', 'partner', 'vendor')),
  domain TEXT,
  description TEXT,
  website TEXT,
  industry TEXT,
  address TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 新規テーブル: project_members
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'member', 'observer', 'client_contact')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, contact_id)
);

-- 既存テーブル拡張: contacts に新カラム追加
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_team_member BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'auto'
  CHECK (source IN ('auto', 'manual', 'import', 'invite'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS master_matched BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS master_matched_at TIMESTAMPTZ;

-- インデックス
CREATE INDEX idx_organizations_domain ON organizations(domain);
CREATE INDEX idx_contacts_organization_id ON contacts(organization_id);
CREATE INDEX idx_contacts_is_team_member ON contacts(is_team_member);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_contact_id ON project_members(contact_id);

-- RLS ポリシー
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- organizations: 認証ユーザー全員が参照・編集可能
CREATE POLICY "organizations_select" ON organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "organizations_insert" ON organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "organizations_update" ON organizations FOR UPDATE TO authenticated USING (true);

-- project_members: プロジェクトメンバーのみ参照可能
CREATE POLICY "project_members_select" ON project_members FOR SELECT TO authenticated USING (
  project_id IN (SELECT project_id FROM project_members WHERE contact_id IN (
    SELECT id FROM contacts WHERE address = auth.email()
  ))
);
```

---

## 9. 実装ロードマップ

### Phase 30: コンタクト強化 + ビジネスログ基盤
**30a: マスターデータ基盤**
- organizations テーブル作成 + API（CRUD）
- contacts テーブル拡張（organization_id, is_team_member 等）
- project_members テーブル作成

**30b: 簡単登録UI**
- コンタクト追加モーダル（クイック登録）
- CSVインポート機能
- 初回セットアップウィザード（自社情報 → メンバー → プロジェクト）
- コンタクト詳細パネルへの組織紐付け・プロジェクト追加ボタン

**30c: 自動マッチング**
- メールアドレス完全一致マッチング
- ドメインマッチング（organization.domain ↔ contact.address）
- 新規コンタクト生成時の自動マッチ処理
- 未マッチコンタクトの提案UI（「この人はA社ですか？」）

**30d: ビジネスログ基盤**
- プロジェクト・グループのCRUD（DB + API + UI）
- ビジネスイベントのCRUD
- タイムラインUI（左サイドバー + 中央タイムライン + 右パネル）
- 既存サイドバーにビジネスログへのナビゲーション追加

### Phase 31: Google Calendar連携
- Google Calendar API OAuth認証
- カレンダーイベント → ビジネスイベント自動同期
- Google Docs連携（議事録読み込み）

### Phase 32: 種ボックス拡張
- 種の会話機能（AI対話）
- 種のステータス管理（raw → growing → mature）
- プロジェクト紐付け
- visibility切り替え（personal ↔ team）

### Phase 33: 議事録・意思決定ログ
- MeetingMinutes データモデル実装
- 過去ログタイムライン（同一会議体の履歴）
- アクションアイテム管理
- AI要約（Google Docs → 議題・決定事項・アクション自動抽出）

### Phase 34: タスク提案システム
- ProposedTask モデル
- AIによるタスク自動提案（会議後、メール受信後）
- 採用/修正/削除UI
- AI信頼度スコア表示

### Phase 35: パーソナルエージェント
- 秘書エージェントUI（チャット形式）
- コンテキスト参照（種 + ナレッジ + ビジネスログ横断検索）
- タスク提案・種の整理提案

### Phase 36+: サブエージェント群
- 請求エージェント
- 営業エージェント
- 工数管理エージェント

---

## 10. 技術的な留意点

### 9.1 DB設計
- 既存テーブルはそのまま維持
- 新テーブル: projects, groups, business_events, meeting_minutes, action_items, document_logs, proposed_tasks, seed_conversations
- seeds テーブルに project_id, visibility, status, conversations カラムを追加

### 9.2 認証・権限
- 個人レイヤー: 現行のユーザー認証をそのまま利用
- チームレイヤー: プロジェクトメンバーシップに基づくアクセス制御
- 種の visibility で個人/チーム共有を制御

### 9.3 Google API
- Google Calendar API: OAuth 2.0 認証
- Google Docs API: 議事録読み込み用
- Google Drive API: 資料リンク取得用（将来）

### 9.4 エージェント基盤
- AIモデル: OpenAI GPT-4o or Anthropic Claude（既存aiClient.serviceを拡張）
- コンテキストウィンドウ管理: 種の会話履歴 + 関連ビジネスログを動的に組み立て
- サブエージェント: 独立したプロンプトテンプレート + 専用ツール定義

---

## 11. まとめ

NodeMap v2 の核心は**「種がすべての入り口」**という設計思想。

個人が自然にNodeMapを使う → 種が溜まる → 種が育つ → ナレッジ・タスク・ビジネスログが自然に蓄積される → チーム全体の業務が可視化される

この「自然蓄積」の仕組みが実現できれば、「わざわざ記録する」負荷なく、案件の全体像が常に最新の状態で共有される。
