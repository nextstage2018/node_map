# NodeMap テーブル仕様書（SSOT）— DB現状マスタ

最終更新: 2026-03-11（v4.1 カレンダー連携強化 — tasks に estimated_hours/actual_hours、meeting_records に calendar_event_id 追加）

> **このドキュメントの目的**: 現在のデータベーススキーマの完全な記録。各テーブルについて、用途・CREATE TABLE文・インデックス・制約・注意事項を網羅しています。
>
> 新しいマイグレーションを作成する際は、このドキュメントを更新してください。

---

## ⚠️ よくある間違い（必ず避けること）

| 間違い | 正しい方法 | 理由 |
|---|---|---|
| `contact_persons` の id を自動生成 | `'team_${Date.now()}_${random}'` 形式で手動生成してから INSERT | TEXT型のため自動生成機能がない |
| `tasks` の id を `task-${Date.now()}` 形式で生成 | `crypto.randomUUID()` または DB の `gen_random_uuid()` を使用 | UUID型。形式を変えるとコード全体に影響 |
| `inbox_messages` に `user_id` カラムがあると仮定 | `direction` カラム（'received'/'sent'）で判別 | user_id カラムは存在しない |
| `unified_messages` テーブルを使用 | `inbox_messages` を使う | unified_messages は廃止、現在は空 |
| contact_channels の UNIQUE 制約を知らず重複登録 | 登録前に `UNIQUE(contact_id, channel, address)` で重複チェック | 制約違反で INSERT が失敗する |
| `knowledge_master_entries.field_id` が必須だと思う | `field_id` は NULL 可能（NOT NULL 制約は Phase 25 で解除） | Phase 42a の自動抽出では field が未分類 |
| タスク/種のノード id を UUID だと思う | ノード id は TEXT型（`'me_auto_...'` 形式） | knowledge_master_entries.id が TEXT型 |
| Supabase クライアントを mixing（getSupabase + getServerSupabase） | 同じテーブルは同じクライアント使用 | RLS 挙動が予測不可能になる |
| ジョブの type を明示せず登録 | POST 時に `type` パラメータを必ず含める | type は NOT NULL、DEFAULT値がない |

---

## 1. コンタクト関連テーブル

### contact_persons（コンタクト本体）

**目的**: 個人コンタクト・組織メンバーの基本情報管理

#### CREATE TABLE

```sql
CREATE TABLE contact_persons (
  id TEXT PRIMARY KEY,                           -- 手動生成: team_${Date.now()}_${random}
  name TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'internal',
  confidence NUMERIC NOT NULL DEFAULT 0.0,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  main_channel TEXT,
  associated_node_ids TEXT[] DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_name TEXT,
  department TEXT,
  notes TEXT,
  visibility TEXT DEFAULT 'private',
  owner_user_id UUID,                            -- ※ user_id ではない！UUID型
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  is_team_member BOOLEAN DEFAULT false,
  ai_context TEXT,
  ai_analyzed_at TIMESTAMPTZ,
  auto_added_to_org BOOLEAN DEFAULT false,
  linked_user_id UUID
);
```

#### インデックス

```sql
CREATE INDEX idx_contact_persons_owner_user_id ON contact_persons(owner_user_id);
CREATE INDEX idx_contact_persons_organization_id ON contact_persons(organization_id);
CREATE INDEX idx_contact_persons_linked_user_id ON contact_persons(linked_user_id);
```

#### 注意事項

- **ID型**: TEXT。自動生成なし。形式: `team_${Date.now()}_${random}`
- **⚠️ owner_user_id**: UUID型。`user_id` ではない。コード内で間違えやすいので注意
- **email/phone カラムは存在しない**: メール・電話は `contact_channels` テーブルに格納
- **RLS**: owner_user_id でフィルタ
- contact_id → contact_channels（1対多）
- contact_id → organization_id（多対1）。1コンタクトは最大1組織にのみ所属可
- 同一ユーザー内での名前は UNIQUE（推奨 but 強制なし）

---

### contact_channels（連絡先チャネル情報）

**目的**: 1コンタクトが複数チャネルに対応可能（メール+Slack+Chatwork等）

#### CREATE TABLE

```sql
CREATE TABLE contact_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  address TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN DEFAULT false,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, channel, address)
);
```

#### インデックス

```sql
CREATE INDEX idx_contact_channels_contact_id ON contact_channels(contact_id);
CREATE INDEX idx_contact_channels_channel ON contact_channels(channel);
CREATE INDEX idx_contact_channels_address ON contact_channels(address);
```

#### 注意事項

- **UNIQUE(contact_id, channel, address)**: 同一コンタクト内での同一チャネル重複を防止
- address には メアド（abc@example.com）/ Slack ユーザーID（UXXXXX）/ Chatwork アカウントID（12345）が混在
- メールアドレスはこのテーブルで正規化。contact_persons.email は非主キー（互換性のため保持）

---

### contact_patterns（コンタクトパターン分析）

**目的**: Phase 51: コンタクトとの連絡頻度・推奨アクション自動判定

#### CREATE TABLE

```sql
CREATE TABLE contact_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id),
  message_count_7d INT DEFAULT 0,
  message_count_30d INT DEFAULT 0,
  last_message_date TIMESTAMPTZ,
  avg_response_time_minutes INT,
  frequency_level TEXT,
  recommended_action TEXT,
  risk_level TEXT,
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_contact_patterns_user_contact ON contact_patterns(user_id, contact_id);
```

#### 注意事項

- 日次Cron（compute-patterns）で自動更新
- frequency_level: 'frequent'/'regular'/'occasional'/'dormant'
- risk_level: 'high'/'normal'

---

## 2. 組織・プロジェクト関連テーブル

### organizations（組織・企業情報）

**目的**: 自社・取引先組織の管理

#### CREATE TABLE

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  relationship_type TEXT NOT NULL DEFAULT 'self',
  address TEXT,
  phone TEXT,
  website TEXT,
  memo TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);
```

#### インデックス

```sql
CREATE INDEX idx_organizations_user_id ON organizations(user_id);
CREATE INDEX idx_organizations_domain ON organizations(domain);
```

#### 注意事項

- **UNIQUE(user_id, domain)**
- relationship_type: 'self'=自社 / 'client'=顧客 / 'vendor'=仕入先 / 'partner'=パートナー
- **RLS**: user_id でフィルタ
- organization_id → organization_channels（1対多）
- organization_id → projects（1対多）
- organization_id → contact_persons（1対多）。メンバー管理用

---

### organization_channels（組織に紐づくチャネル）

**目的**: 組織ごとに複数のSlack/Chatwork/Emailチャネルを管理

#### CREATE TABLE

```sql
CREATE TABLE organization_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  user_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, service_name, channel_id)
);
```

#### インデックス

```sql
CREATE INDEX idx_organization_channels_org_id ON organization_channels(organization_id);
```

#### 注意事項

- **UNIQUE(organization_id, service_name, channel_id)**: 組織内での同一チャネル重複防止
- service_name: 'slack'/'chatwork'/'email'
- channel_id: Slack: CXXXXX / CW: room_id / Email: domain

---

### projects（プロジェクト）

**目的**: 仕事の進捗・ビジネスログ管理

#### CREATE TABLE

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  drive_folder_id TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
```

#### 注意事項

- **RLS**: user_id でフィルタ
- status: 'active'/'paused'/'completed'
- project_id → project_channels（1対多）
- project_id → seeds（1対多）
- project_id → tasks（1対多）
- project_id → business_events（1対多）
- project_id → drive_folders（1対多）

---

### project_channels（プロジェクト-チャネル紐づけ）

**目的**: プロジェクトが複数チャネルに対応（Slack複数チャネル等）

#### CREATE TABLE

```sql
CREATE TABLE project_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_channel_id UUID REFERENCES organization_channels(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  channel_identifier TEXT NOT NULL,
  channel_label TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, service_name, channel_identifier)
);
```

#### インデックス

```sql
CREATE INDEX idx_project_channels_project_id ON project_channels(project_id);
CREATE INDEX idx_project_channels_org_channel_id ON project_channels(organization_channel_id);
```

#### 注意事項

- **UNIQUE(project_id, service_name, channel_identifier)**
- 種化時のプロジェクト自動検出（チャネル → project_channels → projects）で利用
- `/api/projects/[id]/messages` でプロジェクト関連メッセージ取得

---

### project_members（プロジェクトメンバー）

**目的**: プロジェクト単位のメンバー管理。チャネルからの自動取り込み or 手動追加。フォールバックなし（空なら空）

#### CREATE TABLE

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contact_persons(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, contact_id)
);
```

#### インデックス

```sql
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_contact_id ON project_members(contact_id);
```

#### 注意事項

- **UNIQUE(project_id, contact_id)**: 同一コンタクトの重複追加を防止
- **フォールバック廃止**: project_membersが空でも組織メンバーを返さない
- **自動取り込み**: `POST /api/projects/[id]/members/detect` でチャネルのメッセージ送信者を自動検出・追加
- role: 'owner' / 'member' / 'viewer'
- メンバーカード展開で contact_persons の編集 + contact_channels の管理が可能

---

## 3. タスク・ジョブ・メモ関連テーブル

### tasks（タスク）

**目的**: ユーザーのタスク・プロジェクト作業

#### CREATE TABLE

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  seed_id UUID REFERENCES seeds(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
  priority TEXT DEFAULT 'medium',
  phase TEXT DEFAULT 'ideation',
  task_type TEXT NOT NULL DEFAULT 'personal',
  ideation_summary JSONB,
  result_summary TEXT,
  due_date DATE,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  calendar_event_id TEXT,
  assigned_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  requester_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  source_type TEXT,
  source_message_id TEXT,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  theme_id UUID REFERENCES themes(id) ON DELETE SET NULL,
  estimated_hours NUMERIC(6,2) DEFAULT NULL,              -- v4.1: 見積もり工数（時間）
  actual_hours NUMERIC(6,2) DEFAULT NULL,                 -- v4.1: 実績工数（時間）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_seed_id ON tasks(seed_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_phase ON tasks(phase);
CREATE INDEX idx_tasks_requester ON tasks(requester_contact_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_contact_id);
CREATE INDEX idx_tasks_scheduled_start ON tasks(scheduled_start);
CREATE INDEX idx_tasks_calendar_event ON tasks(calendar_event_id);
```

#### 注意事項

- **ID型**: UUID。`crypto.randomUUID()` で生成
- **RLS**: user_id でフィルタ
- status: 'todo' / 'in_progress' / 'done'。done 時に business_events にアーカイブ→削除
- phase: 'ideation'/'progress'/'result'
- task_type: 'personal'/'group'
- **v4.1**: estimated_hours / actual_hours で工数管理（見積もり vs 実績）
- task_id → task_conversations（1対多）
- task_id → task_members（1対多）
- task_id → thought_task_nodes（1対多）
- task_id → thought_edges（1対多）
- task_id → thought_snapshots（1対多）
- task_id → drive_documents（1対多）

---

### task_members（グループタスクのメンバー管理）

**目的**: task_type='group' のタスクに複数メンバー参加

#### CREATE TABLE

```sql
CREATE TABLE task_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  calendar_event_id TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);
```

#### インデックス

```sql
CREATE INDEX idx_task_members_task ON task_members(task_id);
CREATE INDEX idx_task_members_user ON task_members(user_id);
```

#### 注意事項

- role: 'owner'=オーナー / 'member'=メンバー
- タスク作成時に task_members に複数登録→ 各メンバーのカレンダーに予定作成

---

### task_conversations（タスク内AI会話）

**目的**: タスク詳細ページの構想→進行→結果フェーズ別AI伴走会話

#### CREATE TABLE

```sql
CREATE TABLE task_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  phase TEXT,
  turn_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_task_conversations_task_id ON task_conversations(task_id);
CREATE INDEX idx_task_conversations_turn_id ON task_conversations(turn_id);
```

#### 注意事項

- phase: 'ideation'/'progress'/'result'
- turn_id: Phase 42f で会話ターン追跡用
- タスク完了時に business_events にアーカイブ→ task_conversations 削除

---

### jobs（ジョブ：簡易作業・自動実行タスク）

**目的**: Phase 32 以降: AI に委ねる日常簡易作業（返信・日程調整・確認等）

#### CREATE TABLE

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'executing', 'consulting', 'draft_ready', 'done', 'failed')),
  title TEXT NOT NULL,
  description TEXT,
  ai_draft TEXT,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_log TEXT,
  reply_to_message_id TEXT,
  target_contact_id TEXT REFERENCES contact_persons(id),
  target_address TEXT,
  target_name TEXT,
  execution_metadata JSONB,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  calendar_event_id TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_start ON jobs(scheduled_start);
CREATE INDEX idx_jobs_calendar_event ON jobs(calendar_event_id);
```

#### 注意事項

- type: 'reply'/'schedule'/'check'/'consult'/'todo'/'other'
- status遷移: pending → approved → executing → done / failed
- consulting → draft_ready → （ユーザーが手動で返信API実行）
- **RLS**: user_id でフィルタ

---

### consultations（社内相談）

**目的**: Phase 58: ユーザー間の相談→回答→自動返信フロー

#### CREATE TABLE

```sql
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL,
  responder_user_id TEXT NOT NULL,
  responder_contact_id TEXT REFERENCES contact_persons(id),
  source_message_id TEXT,
  source_channel TEXT,
  thread_summary TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  ai_generated_reply TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'answered')),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_consultations_requester ON consultations(requester_user_id);
CREATE INDEX idx_consultations_responder ON consultations(responder_user_id);
CREATE INDEX idx_consultations_status ON consultations(status);
```

#### 注意事項

- responder_user_id は Phase 58b で linked_user_id から自動填入
- ジョブから type='consult' で作成
- 回答入力後 → AI が返信下書き自動生成（jobs.ai_draft に保存） → ユーザーが送信

---

### idea_memos（アイデアメモ）

**目的**: Restructure後: タスク・種と異なる、断片的思いつき記録

#### CREATE TABLE

```sql
CREATE TABLE idea_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_idea_memos_user_id ON idea_memos(user_id);
```

#### 注意事項

- **RLS**: user_id でフィルタ
- memo_id → memo_conversations（1対多）
- memo_id → task（間接的：Phase 59 メモ→タスク直接変換）
- Phase 59 でメモ→タスク直接変換を実装（種を経由しない）

---

### memo_conversations（メモAI会話）

**目的**: メモに対する AI 伴走会話

#### CREATE TABLE

```sql
CREATE TABLE memo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id UUID NOT NULL REFERENCES idea_memos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  turn_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_memo_conversations_memo_id ON memo_conversations(memo_id);
CREATE INDEX idx_memo_conversations_turn_id ON memo_conversations(turn_id);
```

#### 注意事項

- turn_id で会話ジャンプ機能を実装
- 音声トランスクリプション段階での会話ログ

---

### seeds（種：廃止予定ボックス）

**目的**: Phase 40 の段階的廃止予定。種のAI会話記録

#### CREATE TABLE

```sql
CREATE TABLE seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  phase TEXT NOT NULL DEFAULT 'seed',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_from TEXT,
  source_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_seeds_user_id ON seeds(user_id);
CREATE INDEX idx_seeds_project_id ON seeds(project_id);
```

#### 注意事項

- phase: 'seed'/'ideation'
- source_from: Phase 41 で指定（'inbox'/'memo'等）
- seed_id → seed_conversations（1対多）
- seed_id → tasks（1対多）（種→タスク変換時） Phase 40c
- seed_id → thought_task_nodes（1対多）
- seed_id → thought_edges（1対多）
- Phase 41 で confirmSeed() を全面改修。種をタスクに変換する際に AI が ideation_summary を自動生成

---

### seed_conversations（種内AI会話）

**目的**: 種の構想段階AI会話（種→タスク変換時にタスク会話に引き継ぎ）

#### CREATE TABLE

```sql
CREATE TABLE seed_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id UUID NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  turn_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_seed_conversations_seed_id ON seed_conversations(seed_id);
CREATE INDEX idx_seed_conversations_turn_id ON seed_conversations(turn_id);
```

---

## 4. メッセージ・チャネル関連テーブル

### inbox_messages（受信・送信メッセージ本体）

**目的**: メール・Slack・Chatwork の全メッセージ統一DB

#### CREATE TABLE

```sql
CREATE TABLE inbox_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'slack', 'chatwork')),
  direction TEXT NOT NULL CHECK(direction IN ('received', 'sent')),
  from_address TEXT,
  from_name TEXT,
  to_address TEXT,
  to_name TEXT,
  cc_address TEXT,
  subject TEXT,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  metadata JSONB,
  ai_analyzed BOOLEAN DEFAULT false,
  drive_synced BOOLEAN DEFAULT false,
  thought_nodes_extracted BOOLEAN DEFAULT false,
  source_channel_name TEXT,
  thread_id TEXT,
  reply_to_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_inbox_messages_user_id ON inbox_messages(user_id);
CREATE INDEX idx_inbox_messages_channel ON inbox_messages(channel);
CREATE INDEX idx_inbox_messages_direction ON inbox_messages(direction);
CREATE INDEX idx_inbox_messages_thread_id ON inbox_messages(thread_id);
CREATE INDEX idx_inbox_messages_reply_to_id ON inbox_messages(reply_to_id);
CREATE INDEX idx_inbox_messages_received_at ON inbox_messages(received_at);
CREATE INDEX idx_inbox_messages_from_address ON inbox_messages(from_address);
```

#### 注意事項

- **user_id カラムは存在しない** — direction で判別。メッセージの「所有者」ではなく「ユーザーのメールボックス」
- direction='received' のメッセージの from_address / from_name から contact_persons を特定
- direction='sent' がユーザーの送信メッセージ
- **RLS**: 実装上は Supabase の auth.uid でフィルタしている（各ユーザーは自分のメッセージのみ見える）
- metadata には チャネル別の詳細情報（Slack → slackChannel, slackThreadTs, slackUserId など）

---

### inbox_sync_state（メッセージ同期状態管理）

**目的**: Phase 59: 各チャネルの同期進捗を記録（差分取得高速化）

#### CREATE TABLE

```sql
CREATE TABLE inbox_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  last_sync_token TEXT,
  last_sync_time TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_inbox_sync_state_user_channel ON inbox_sync_state(user_id, channel);
```

#### 注意事項

- channel: 'email' / 'slack' / 'chatwork'
- sync_status: 'pending' / 'syncing' / 'completed' / 'failed'
- last_sync_token: チャネル別の差分取得トークン（Gmail: historyId / Slack: cursor等）
- 毎回全メッセージ取得ではなく差分のみ取得（高速化）

---

### user_channel_subscriptions（ユーザーチャネル購読管理）

**目的**: Phase 59: インボックスフィルタリング（全メッセージDL後に表示フィルタ）

#### CREATE TABLE

```sql
CREATE TABLE user_channel_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  channel_identifier TEXT,
  user_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_user_channel_subscriptions_user_service ON user_channel_subscriptions(user_id, service_name);
```

#### 注意事項

- service_name: 'email' / 'slack' / 'chatwork'
- channel_identifier: Slack: CXXXXX / CW: room_id / Email: domain
- **設計思想**:
  - 購読登録 = インボックスで表示するチャネルの絞り込み
  - 購読なし → 全チャネルのメッセージを表示
  - 購読あり → 登録チャネルのメッセージのみ表示
  - トークン有無で全メッセージDL対象を判定（Phase 59）

---

## 5. ナレッジ・思考マップ関連テーブル

### knowledge_master_entries（ナレッジマスタ：キーワード基盤）

**目的**: AI会話から自動抽出された全キーワード。複数タスク/種で共有

#### CREATE TABLE

```sql
CREATE TABLE knowledge_master_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  domain_id UUID REFERENCES knowledge_domains(id),
  field_id UUID REFERENCES knowledge_fields(id),
  description TEXT,
  synonyms TEXT[],
  is_confirmed BOOLEAN DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  category TEXT,
  source_type TEXT,
  source_id TEXT,
  source_conversation_id UUID,
  extracted_at TIMESTAMPTZ,
  frequency INT DEFAULT 1,
  last_used_at TIMESTAMPTZ,
  source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,  -- v3.0: 会議録ソース追跡
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_knowledge_master_user_id ON knowledge_master_entries(user_id);
CREATE INDEX idx_knowledge_master_label ON knowledge_master_entries(label);
CREATE INDEX idx_knowledge_master_domain_id ON knowledge_master_entries(domain_id);
CREATE INDEX idx_knowledge_master_field_id ON knowledge_master_entries(field_id);
CREATE INDEX idx_knowledge_source_meeting ON knowledge_master_entries(source_meeting_record_id) WHERE source_meeting_record_id IS NOT NULL;  -- v3.0
```

#### 注意事項

- **id は TEXT型**。自動生成なし。形式: 'me_auto_${Date.now()}_${random}' または 'me_manual_...'
- 複数タスク/種で同じキーワードは1レコード（frequency で重複統計）
- domain_id / field_id は NULL 可能。未分類のキーワードも蓄積される
- knowledge_master_entries.id ← thought_task_nodes.node_id（1対多）
- knowledge_master_entries.id ← thought_edges.from/to_node_id（1対多）
- **v3.0**: source_meeting_record_id で会議録からの自動抽出を追跡

---

### knowledge_domains（ナレッジ領域：最上位階層）

**目的**: キーワードの最上位分類（例: "プロダクト"、"営業"）

#### CREATE TABLE

```sql
CREATE TABLE knowledge_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_knowledge_domains_user_id ON knowledge_domains(user_id);
```

#### 注意事項

- **RLS**: user_id でフィルタ
- domain_id → knowledge_fields（1対多）
- domain_id → knowledge_master_entries（1対多）

---

### knowledge_fields（ナレッジ分野：第二階層）

**目的**: 領域内の詳細分類（例："プロダクト" → "UI設計"、"バックエンド"）

#### CREATE TABLE

```sql
CREATE TABLE knowledge_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_knowledge_fields_domain_id ON knowledge_fields(domain_id);
```

#### 注意事項

- field_id → knowledge_master_entries（1対多）

---

### thought_task_nodes（タスク/種 ↔ ナレッジノード紐づけ）

**目的**: どのタスク/種がどのキーワード（ノード）を使ったかの記録

#### CREATE TABLE

```sql
CREATE TABLE thought_task_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  appear_order INT,
  is_main_route BOOLEAN DEFAULT true,
  appear_phase TEXT,
  source_conversation_id UUID,
  source_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, node_id),
  UNIQUE(seed_id, node_id),
  CHECK(task_id IS NOT NULL OR seed_id IS NOT NULL)
);
```

#### インデックス

```sql
CREATE INDEX idx_thought_task_nodes_task_id ON thought_task_nodes(task_id);
CREATE INDEX idx_thought_task_nodes_seed_id ON thought_task_nodes(seed_id);
CREATE INDEX idx_thought_task_nodes_node_id ON thought_task_nodes(node_id);
CREATE INDEX idx_thought_task_nodes_user_id ON thought_task_nodes(user_id);
```

#### 注意事項

- **UNIQUE(task_id, node_id)**: タスク内での同ノード重複登録防止
- **UNIQUE(seed_id, node_id)**: 種内での同ノード重複登録防止
- **CHECK(task_id IS NOT NULL OR seed_id IS NOT NULL)**: どちらか必須
- appear_phase: 'seed'/'ideation'/'progress'/'result'
- is_main_route: メイン思考ルートか脇道か
- 思考マップUI: ユーザーのタスク一覧→ノード可視化（多対多で統合）
- ノード検索: 特定キーワードが使われたタスク/種を逆検索

---

### thought_edges（思考動線：ノード間の遷移）

**目的**: AI会話内でキーワードがどの順序で出現し、どう繋がったかを記録

#### CREATE TABLE

```sql
CREATE TABLE thought_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES knowledge_master_entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  edge_type TEXT DEFAULT 'main',
  edge_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, from_node_id, to_node_id),
  UNIQUE(seed_id, from_node_id, to_node_id),
  CHECK(task_id IS NOT NULL OR seed_id IS NOT NULL)
);
```

#### インデックス

```sql
CREATE INDEX idx_thought_edges_task_id ON thought_edges(task_id);
CREATE INDEX idx_thought_edges_seed_id ON thought_edges(seed_id);
CREATE INDEX idx_thought_edges_from_node ON thought_edges(from_node_id);
CREATE INDEX idx_thought_edges_to_node ON thought_edges(to_node_id);
```

#### 注意事項

- **UNIQUE(task_id, from_node_id, to_node_id)**: タスク内での同エッジ重複防止
- **UNIQUE(seed_id, from_node_id, to_node_id)**: 種内での同エッジ重複防止
- **CHECK(task_id IS NOT NULL OR seed_id IS NOT NULL)**
- edge_type: 'main'=メインルート / 'sub'=脇道
- 思考マップUI: ノード間の矢印描画（ベジェ曲線） + 順序付きアニメーション
- ノードの関連性検索: from/to_node_id で依存関係を辿る

---

### thought_snapshots（思考スナップショット：初期ゴール vs 着地点）

**目的**: Phase 42e: タスク創成時と完了時の思考の状態を記録

#### CREATE TABLE

```sql
CREATE TABLE thought_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('initial_goal', 'final_landing')),
  node_ids TEXT[],
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_thought_snapshots_task_id ON thought_snapshots(task_id);
```

#### 注意事項

- snapshot_type: 'initial_goal'=タスク作成時 / 'final_landing'=完了時
- node_ids は TEXT型配列（knowledge_master_entries.id が TEXT型のため）
- 思考マップUI: 比較パネル（2つのスナップショットを並べて表示）
- 学習教材: 「初期ゴール → 最終結果」の乖離を可視化

---

### knowledge_clustering_proposals（ナレッジクラスタリング提案）

**目的**: Phase 47: 週次AI生成の領域/分野提案

#### CREATE TABLE

```sql
CREATE TABLE knowledge_clustering_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  proposal_week TEXT NOT NULL,
  proposed_domains JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  ai_confidence FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, proposal_week)
);
```

#### インデックス

```sql
CREATE INDEX idx_knowledge_proposals_user_week ON knowledge_clustering_proposals(user_id, proposal_week);
```

#### 注意事項

- proposal_week: ISO 週番号（'2026-W10'）。同週の重複防止
- status: 'pending'/'approved'/'rejected'
- proposed_domains: domains[]に fields[]を含む構造
- 秘書チャット: KnowledgeProposalCard で表示→承認/却下
- /master ページ: AI提案履歴タブで過去提案管理

---

## 6. Google Drive 関連テーブル

### drive_folders（Google Drive フォルダマッピング）

**目的**: ローカル組織/プロジェクト ↔ Google Drive フォルダの対応

#### CREATE TABLE

```sql
CREATE TABLE drive_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,     -- v3.3 Phase 3
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,                 -- v3.3 Phase 3
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,               -- v3.3 Phase 3
  drive_folder_id TEXT NOT NULL UNIQUE,
  drive_folder_name TEXT NOT NULL,
  parent_folder_id TEXT,
  hierarchy_level INT,
  resource_type TEXT,    -- v3.3: 'job' | 'meeting' | 'milestone' | null(L1/L2)
  direction TEXT,        -- 旧構造用（'received'/'submitted'）
  year_month TEXT,
  is_shared BOOLEAN DEFAULT false,
  shared_with_emails TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_drive_folders_user_id ON drive_folders(user_id);
CREATE INDEX idx_drive_folders_organization_id ON drive_folders(organization_id);
CREATE INDEX idx_drive_folders_project_id ON drive_folders(project_id);
CREATE INDEX idx_drive_folders_drive_folder_id ON drive_folders(drive_folder_id);
CREATE INDEX idx_drive_folders_milestone ON drive_folders(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX idx_drive_folders_job ON drive_folders(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_drive_folders_task ON drive_folders(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_drive_folders_resource_type ON drive_folders(resource_type) WHERE resource_type IS NOT NULL;
CREATE INDEX idx_drive_folders_project_resource ON drive_folders(project_id, resource_type) WHERE project_id IS NOT NULL;
```

#### 注意事項

- **v3.3 新フォルダ構造（用途別）**:
  ```
  [NodeMap] A社/                       ← level=1, organization_id
    プロジェクトX/                      ← level=2, project_id
      ジョブ/                           ← level=3, resource_type='job'
        SEOレポート/                   ← level=4, job_id
      会議議事録/                       ← level=3, resource_type='meeting'
        2026-03/                       ← level=4, year_month
      マイルストーン/                   ← level=3, resource_type='milestone'
        MS名/                          ← level=4, milestone_id
          タスク名/                    ← level=5, task_id
  ```
- **旧構造（互換性維持・残置）**:
  ```
  受領/                             ← level=3, direction='received'
    2026-03/                       ← level=4, year_month='2026-03'
  提出/                             ← level=3, direction='submitted'
  ```
- hierarchy_level: 1=組織 / 2=プロジェクト / 3=用途別(or旧方向) / 4=サブフォルダ / 5=タスク
- resource_type: 'job'/'meeting'/'milestone'（v3.3新構造用、level=3のみ）
- direction: 'received'/'submitted'（旧構造用、level=3のみ）
- milestone_id, job_id, task_id: 各レベルのリソース紐づけ
- **RLS**: user_id でフィルタ

---

### drive_documents（Google Drive ドキュメント追跡）

**目的**: NodeMap内で参照しているドキュメントの記録

#### CREATE TABLE

```sql
CREATE TABLE drive_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INT,
  drive_folder_id TEXT REFERENCES drive_folders(drive_folder_id),
  organization_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  link_type TEXT,
  link_url TEXT,
  direction TEXT,
  document_type TEXT,
  year_month TEXT,
  original_file_name TEXT,
  web_view_link TEXT,
  shared_with_emails TEXT[],
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_drive_documents_user_id ON drive_documents(user_id);
CREATE INDEX idx_drive_documents_project_id ON drive_documents(project_id);
CREATE INDEX idx_drive_documents_task_id ON drive_documents(task_id);
CREATE INDEX idx_drive_documents_milestone_id ON drive_documents(milestone_id);
CREATE INDEX idx_drive_documents_job_id ON drive_documents(job_id);
CREATE INDEX idx_drive_documents_drive_file_id ON drive_documents(drive_file_id);
CREATE INDEX idx_drive_documents_tags ON drive_documents USING GIN(tags);
```

#### 注意事項

- link_type: Phase 45a: 'embed'/'link'/'external_url'（v3.3）
- document_type: Phase 44: 書類種別（'見積書'/'契約書'等）/ 'reference'（v3.3 URL登録）
- direction: Phase 44: 'received'/'submitted'
- tags: TEXT[] — v3.3: タグ検索対応。GINインデックスで高速検索
- milestone_id: v3.3追加。マイルストーン紐づけ（ON DELETE SET NULL）
- job_id: v3.3追加。ジョブ紐づけ（ON DELETE SET NULL）
- **RLS**: user_id でフィルタ
- task_id / milestone_id / job_id ON DELETE SET NULL — 親削除時はファイルは残存

---

### drive_file_staging（ファイル一時保管・承認フロー）

**目的**: Phase 44: メール受信→秘書確認→最終配置の3段階管理

#### CREATE TABLE

```sql
CREATE TABLE drive_file_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  source_channel TEXT DEFAULT 'email',
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review', 'approved', 'rejected', 'expired')),
  ai_document_type TEXT,
  ai_direction TEXT,
  ai_year_month TEXT,
  ai_suggested_name TEXT,
  ai_confidence FLOAT,
  confirmed_document_type TEXT,
  confirmed_direction TEXT,
  confirmed_year_month TEXT,
  confirmed_file_name TEXT,
  final_drive_file_id TEXT REFERENCES drive_documents(drive_file_id),
  organization_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_drive_file_staging_user_id ON drive_file_staging(user_id);
CREATE INDEX idx_drive_file_staging_status ON drive_file_staging(status);
CREATE INDEX idx_drive_file_staging_created_at ON drive_file_staging(created_at);
```

#### 注意事項

- **ステータス遷移**:
  - pending_review → approved → uploaded
  - pending_review → rejected
  - pending_review → expired（14日放置）
- **クリーンアップCron**:
  - 14日経過 → status='expired'
  - 30日超 rejected/expired → Driveファイル削除 + DB削除
- source_channel: Phase 45a: 'email'/'slack'/'chatwork'
- AI分類（ai_*）と ユーザー確定（confirmed_*）の二段構成
- approved 時に approved_at + final_drive_file_id を設定→ drive_documents 登録

---

## 7. 秘書・会話関連テーブル

### secretary_conversations（秘書AI会話永続化）

**目的**: Phase 53: 秘書チャットのAIコンテキスト保持（UI復元はしない）

#### CREATE TABLE

```sql
CREATE TABLE secretary_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  cards JSONB,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_secretary_conversations_user_id ON secretary_conversations(user_id);
CREATE INDEX idx_secretary_conversations_session_id ON secretary_conversations(session_id);
CREATE INDEX idx_secretary_conversations_created_at ON secretary_conversations(created_at);
```

#### 注意事項

- role: 'user' / 'assistant'
- cards: JSONB で複数カード（InboxSummary+TaskResume 等）を一度に保存可能
- session_id で「セッション単位」の束ねが可能（オプション）
- 秘書チャット開く度に、過去15-30件の会話をDBから読み込み→ Claude API のコンテキストに注入
- UI は毎回ダッシュボード表示。過去会話は復元しない（テキスト形式での UI レンダリングなし）

### task_external_resources（Phase E: タスク外部資料）

**目的**: 外部AI成果物（Deep Research等）をタスクに取り込み、AI会話コンテキストとして活用

#### CREATE TABLE

```sql
CREATE TABLE task_external_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('text', 'file', 'url')),
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  file_name TEXT,
  file_mime_type TEXT,
  content_length INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_task_external_resources_task_id ON task_external_resources(task_id);
CREATE INDEX idx_task_external_resources_user_id ON task_external_resources(user_id);
```

#### 注意事項

- id は UUID 型（自動生成）
- task_id の FK CASCADE: タスク削除時に外部資料も自動削除
- resource_type: 'text'（テキストペースト）/ 'file'（ファイル内容）/ 'url'（URL参考資料）
- content: テキスト内容（最大50,000文字で切り詰め）
- AI会話コンテキスト注入時は各資料最大3,000文字に制限（トークン節約）
- 秘書AIの `task_external_resource` intentからもタスク一覧表示→取り込み導線あり

---

### task_suggestions（Phase 56 + v3.0: タスク提案）

**目的**: 会議録AI解析から自動抽出されたアクションアイテムの一時保存。秘書画面で承認/却下する。

#### CREATE TABLE

```sql
CREATE TABLE task_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  business_event_id UUID REFERENCES business_events(id) ON DELETE CASCADE,
  meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE CASCADE,  -- v3.0
  suggestions JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_task_suggestions_user ON task_suggestions(user_id, status);
CREATE INDEX idx_task_suggestions_event ON task_suggestions(business_event_id);
CREATE INDEX idx_task_suggestions_meeting ON task_suggestions(meeting_record_id);  -- v3.0
```

#### 注意事項

- **v3.0**: meeting_record_id で会議録からの直接リンクを追加
- suggestions JSONB の構造（v3.0形式）:
  - `meetingTitle`: 会議タイトル
  - `meetingDate`: 会議日
  - `projectId`: プロジェクトID
  - `items[]`: `{ title, assignee, assigneeContactId, due_date, priority, related_topic }`
- 旧形式（Phase 56）: `{ parentTask, childTasks[] }` — 後方互換で秘書画面が両形式に対応
- 秘書ブリーフィングで `status='pending'` のレコードを `task_proposal` カードとして表示

---

## 8. ビジネスイベント・分析テーブル

### business_events（ビジネスログ：活動記録）

**目的**: メッセージ・ドキュメント・会議等のプロジェクト活動を記録

#### CREATE TABLE

```sql
CREATE TABLE business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,                    -- ※ DBカラム名は content（descriptionではない）
  group_id UUID,
  contact_id TEXT,
  ai_generated BOOLEAN DEFAULT false,
  summary_period TEXT,
  event_date TIMESTAMPTZ,         -- ※ DB実型は TIMESTAMPTZ（DATEではない）
  source_message_id TEXT,
  source_channel TEXT,
  source_document_id TEXT,
  source_calendar_event_id TEXT,
  meeting_notes_url TEXT,
  event_start TIMESTAMPTZ,
  event_end TIMESTAMPTZ,
  keywords_extracted BOOLEAN DEFAULT false,
  meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_business_events_user_id ON business_events(user_id);
CREATE INDEX idx_business_events_project_id ON business_events(project_id);
CREATE INDEX idx_business_events_event_date ON business_events(event_date);
CREATE INDEX idx_business_events_event_type ON business_events(event_type);
CREATE INDEX idx_business_events_created_at ON business_events(created_at);
CREATE INDEX idx_business_events_meeting_record_id ON business_events(meeting_record_id) WHERE meeting_record_id IS NOT NULL;
```

#### 注意事項

- event_type: 'message_received'/'document_received'/'document_submitted'/'meeting'/'summary'等
- ai_generated: Phase 45c: AI自動生成フラグ（Cronで生成されたサマリー）
- summary_period: Phase 45c: AI要約の期間（'2026-W10'=ISO週番号）
- keywords_extracted: Phase 57: キーワード抽出済みフラグ
- meeting_record_id: V2-D: 会議録との紐づけ（nullable）
- **用途**:
  - Cron sync-business-events（毎日1:00）で過去24時間のメッセージから自動生成
  - Cron summarize-business-log（毎週月曜2:00）で週間要約を自動生成
  - /business-log ページでプロジェクト別タイムラインを表示
  - keywords_extracted で思考マップキーワード抽出対象管理
  - 会議録登録時に event_type='meeting' で自動登録（V2-D）
- **RLS**: user_id でフィルタ

---

### meeting_records（会議録）

**目的**: 会議録のテキストを保存し、AI解析・検討ツリー生成・ビジネスイベント自動追加の起点とする

#### CREATE TABLE

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
  participants JSONB DEFAULT '[]'::jsonb,      -- 参加者情報 [{email?, name?}]
  meeting_start_at TIMESTAMPTZ,                -- 会議開始時刻（UTC）
  meeting_end_at TIMESTAMPTZ,                  -- 会議終了時刻（UTC）
  metadata JSONB DEFAULT '{}'::jsonb,          -- MeetGeekメタデータ {host_email, source, join_link, language, ...}
  highlights JSONB DEFAULT '[]'::jsonb,        -- MeetGeekハイライト [{highlightText, label}]
  calendar_event_id TEXT DEFAULT NULL,           -- v4.1: Googleカレンダーのイベント ID
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_meeting_records_project_id ON meeting_records(project_id);
CREATE INDEX idx_meeting_records_meeting_date ON meeting_records(meeting_date);
CREATE INDEX idx_meeting_records_source ON meeting_records(source_type, source_file_id) WHERE source_file_id IS NOT NULL;
```

#### 注意事項

- processed: AI解析が完了したかどうかのフラグ
- source_type: `'text'`（手動入力）、`'meetgeek'`（MeetGeek Webhook自動取り込み）
- participants: MeetGeek会議詳細APIから取得した参加者メール + トランスクリプトのspeaker名
- meeting_start_at / meeting_end_at: 会議の正確な開始・終了時刻（MeetGeek提供）
- metadata: host_email, source(google/outlook), join_link, language, timezone, template, team_ids, event_id
- highlights: MeetGeekが自動抽出したハイライト（アクションアイテム・キーポイント等）
- **録画リンク**: 4時間期限付きのため保存せず、`GET /api/meeting-records/[id]/recording` でオンデマンド取得
- source_file_id: TEXT型。MeetGeekの場合はmeeting_id（UUID文字列）を格納
- ai_summary: AI解析後に自動設定される要約テキスト（MeetGeekの場合は事前セットあり）
- 会議録登録 → AI解析 → business_events自動追加 → 検討ツリー自動生成の一連パイプライン
- MeetGeek重複防止: source_type='meetgeek' + source_file_id で一意チェック
- **v4.1**: calendar_event_id で [NM-Meeting] カレンダーイベントと紐づけ
- **RLS**: user_id でフィルタ（ただし user_id は nullable）

---

### decision_trees（検討ツリー：ルートテーブル）

**目的**: プロジェクトごとの検討ツリーのルートエンティティ

#### CREATE TABLE

```sql
CREATE TABLE decision_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '検討ツリー',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 注意事項

- 1プロジェクトにつき通常1つの検討ツリー
- 会議録AI解析時に自動作成される

---

### decision_tree_nodes（検討ツリー：ノード）

**目的**: 検討ツリーの各ノード（topic / option / decision）。階層構造

#### CREATE TABLE

```sql
CREATE TABLE decision_tree_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES decision_trees(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  node_type TEXT NOT NULL DEFAULT 'topic',  -- topic / option / decision
  status TEXT NOT NULL DEFAULT 'active',     -- active / completed / cancelled
  cancel_reason TEXT,
  cancel_meeting_id UUID,
  source_meeting_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  source_type TEXT CHECK (source_type IN ('meeting', 'channel', 'hybrid')),  -- v3.0
  confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1.0),  -- v3.0
  source_message_ids TEXT[] DEFAULT '{}',  -- v3.0
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_decision_tree_nodes_tree_id ON decision_tree_nodes(tree_id);
CREATE INDEX idx_decision_tree_nodes_parent ON decision_tree_nodes(parent_node_id);
CREATE INDEX idx_decision_nodes_source_type ON decision_tree_nodes(source_type);  -- v3.0
CREATE INDEX idx_decision_nodes_confidence ON decision_tree_nodes(confidence_score);  -- v3.0
```

#### 注意事項

- parent_node_id=NULL → ルートノード（topic）
- node_type: `'topic'`（議題）、`'option'`（選択肢）、`'decision'`（決定事項）
- **v3.0**: source_type でデータの出自を追跡（meeting=議事録由来、channel=チャネル由来、hybrid=両方）
- **v3.0**: confidence_score でソースの信頼度を管理（meeting=0.85、channel=0.6、hybrid=加重平均）
- **v3.0**: source_message_ids でチャネルメッセージIDを追跡
- topicMatcher.service.ts で類似度≥0.65のトピックをマージ、それ以下は新規作成

---

### decision_tree_node_history（検討ツリー：ノード変更履歴）

**目的**: ノードのステータス変更履歴

#### CREATE TABLE

```sql
CREATE TABLE decision_tree_node_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES decision_tree_nodes(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 注意事項

- ノードのステータス変更（active→completed, active→cancelled等）を全て記録
- reason にはソース情報（「会議録から自動生成」「チャネルメッセージから情報をマージ」等）

---

### user_thinking_tendencies（ユーザー思考傾向分析）

**目的**: Phase 61: AI会話パーソナライズ用の思考傾向記録

#### CREATE TABLE

```sql
CREATE TABLE user_thinking_tendencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  tendency_summary TEXT,
  thinking_patterns TEXT[],
  decision_style TEXT,
  risk_tolerance TEXT,
  collaboration_style TEXT,
  owner_policy_text TEXT,
  ai_analysis_raw JSONB,
  source_stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, analysis_date)
);
```

#### インデックス

```sql
CREATE INDEX idx_user_thinking_user_date ON user_thinking_tendencies(user_id, analysis_date DESC);
```

#### 注意事項

- **UNIQUE**: (user_id, analysis_date)
- decision_style: 'analytical'/'intuitive' 等
- risk_tolerance: 'high'/'medium'/'low'
- collaboration_style: 'independent'/'collaborative' 等
- **更新タイミング**: 日次Cron（analyze-thinking-tendency、毎日4:00）
- **用途**:
  - 秘書AI: buildPersonalizedContext() で取得→システムプロンプト注入
  - 全AI下書き生成エンドポイント: パーソナライズコンテキストとして活用

---

## 9. API・認証関連テーブル

### user_service_tokens（ユーザーサービストークン管理）

**目的**: Supabaseアカウント ↔ 外部サービス（Gmail/Slack/Chatwork）の認証トークン保存

#### CREATE TABLE

```sql
CREATE TABLE user_service_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### インデックス

```sql
CREATE INDEX idx_user_service_tokens_user_id ON user_service_tokens(user_id);
CREATE INDEX idx_user_service_tokens_service_name ON user_service_tokens(service_name);
```

#### 注意事項

- service_name: 'gmail'/'slack'/'chatwork'
- **RLS**: user_id でフィルタ
- Gmail OAuth: `scope` に 'calendar' / 'drive.file' を含める場合、トークン再取得が必要
- Slack: bot token + user token を別レコードで管理する可能性あり

---

### user_metadata（ユーザーメタデータ）

**目的**: Supabase auth の user_metadata で保存（テーブルではない）

#### 保存内容（user_metadata）

```typescript
{
  personality_type?: string,          // 性格タイプ
  ai_response_style?: string,         // AI応答スタイル（'formal'/'casual'等）
  email_signature?: string,           // Phase 58a: メール署名
  // 他のメタデータ
}
```

#### 注意事項

- Supabase の `auth.users.user_metadata` に保存
- `updateUserMetadata()` で更新
- `getServerUserMetadata()` で取得

---

### open_issues（未確定事項トラッカー）[v3.4]

**目的**: 会議やメッセージで話題に出たが結論が出なかった事項を追跡。自動クローズ・優先度自動計算対応。

```sql
CREATE TABLE open_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'stale')),
  source_type TEXT NOT NULL DEFAULT 'meeting'
    CHECK (source_type IN ('meeting', 'channel', 'manual')),
  source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  source_message_ids TEXT[] DEFAULT '{}',
  related_decision_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,
  assigned_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  priority_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
  priority_score NUMERIC(5,2) DEFAULT 0 CHECK (priority_score >= 0),
  days_stagnant INT DEFAULT 0,
  last_mention_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  resolved_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  resolved_by_decision_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, title, source_type)
);
```

#### インデックス
```sql
CREATE INDEX idx_open_issues_project_user ON open_issues(project_id, user_id);
CREATE INDEX idx_open_issues_status ON open_issues(status) WHERE status IN ('open', 'stale');
CREATE INDEX idx_open_issues_priority ON open_issues(priority_score DESC) WHERE status != 'resolved';
CREATE INDEX idx_open_issues_days_stagnant ON open_issues(days_stagnant DESC) WHERE status IN ('open', 'stale');
CREATE INDEX idx_open_issues_decision_node ON open_issues(related_decision_node_id) WHERE related_decision_node_id IS NOT NULL;
CREATE INDEX idx_open_issues_source_meeting ON open_issues(source_meeting_record_id) WHERE source_meeting_record_id IS NOT NULL;
```

#### 注意事項
- **status**: `open`=未解決、`resolved`=解決済み、`stale`=3週間以上放置（Cronで自動更新）
- **priority_score**: Cronで自動計算 `(priority_level点数 × 0.6) + (days_stagnant/30 × 0.4)`
- **自動クローズ**: AI解析で「解決済み」判定→status='resolved'、resolved_at/resolved_meeting_record_id自動設定
- **metadata**: `{mentions_count, related_tasks: [uuid], context_snippet, ai_suggested_next_steps}`

---

### decision_log（意思決定ログ）[v3.4]

**目的**: 「決まったこと」の変遷を不変ログとして記録。変更時は新レコード作成＋旧レコードをsuperseded。

```sql
CREATE TABLE decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  decision_content TEXT NOT NULL,
  rationale TEXT,
  decision_tree_node_id UUID REFERENCES decision_tree_nodes(id) ON DELETE SET NULL,
  previous_decision_id UUID REFERENCES decision_log(id) ON DELETE SET NULL,
  change_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'reverted', 'on_hold')),
  source_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  source_type TEXT DEFAULT 'meeting'
    CHECK (source_type IN ('meeting', 'channel', 'manual')),
  decided_by_contact_id TEXT REFERENCES contact_persons(id) ON DELETE SET NULL,
  implementation_status TEXT DEFAULT 'pending'
    CHECK (implementation_status IN ('pending', 'in_progress', 'completed', 'blocked')),
  implementation_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, title, created_at)
);
```

#### インデックス
```sql
CREATE INDEX idx_decision_log_project_status ON decision_log(project_id, user_id, status) WHERE status = 'active';
CREATE INDEX idx_decision_log_project_date ON decision_log(project_id, created_at DESC);
CREATE INDEX idx_decision_log_previous ON decision_log(previous_decision_id) WHERE previous_decision_id IS NOT NULL;
CREATE INDEX idx_decision_log_tree_node ON decision_log(decision_tree_node_id) WHERE decision_tree_node_id IS NOT NULL;
CREATE INDEX idx_decision_log_source_meeting ON decision_log(source_meeting_record_id) WHERE source_meeting_record_id IS NOT NULL;
CREATE INDEX idx_decision_log_implementation ON decision_log(implementation_status) WHERE status = 'active';
```

#### 注意事項
- **変更チェーン**: D1(active)→D2作成時にD1を`superseded`、D2.previous_decision_id=D1.id
- **status**: `active`=現在有効、`superseded`=新しい決定で置き換え済み、`reverted`=取り消し、`on_hold`=一時保留
- **implementation_status**: 決定が実行に移されたか（decision_tree_nodes.statusとは独立）
- **metadata**: `{impact_areas: [string], stakeholders: [contact_id], deadline: timestamp}`

---

### meeting_agenda（会議アジェンダ）[v3.4]

**目的**: 次回会議で話すべきことを自動生成。open_issues + decision_log + タスク進捗から構成。

```sql
CREATE TABLE meeting_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  title TEXT DEFAULT 'Agenda',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'completed')),
  linked_meeting_record_id UUID REFERENCES meeting_records(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, meeting_date)
);
```

#### インデックス
```sql
CREATE INDEX idx_meeting_agenda_project_date ON meeting_agenda(project_id, meeting_date DESC);
CREATE INDEX idx_meeting_agenda_project_status ON meeting_agenda(project_id, status) WHERE status IN ('draft', 'confirmed');
CREATE INDEX idx_meeting_agenda_linked_meeting ON meeting_agenda(linked_meeting_record_id) WHERE linked_meeting_record_id IS NOT NULL;
CREATE INDEX idx_meeting_agenda_user_upcoming ON meeting_agenda(user_id, meeting_date) WHERE status IN ('draft', 'confirmed');
```

#### items JSONB構造
```json
[{
  "id": "uuid string",
  "type": "open_issue | decision_review | task_progress | custom",
  "reference_id": "参照先テーブルのID (open_issues/decision_log/tasks)",
  "title": "議題タイトル",
  "description": "補足説明",
  "priority": "low | medium | high | critical",
  "assigned_contact_id": "contact_persons.id or null",
  "discussed": false,
  "resolution_note": null,
  "estimated_minutes": 15
}]
```

#### 注意事項
- **UNIQUE**: 1プロジェクト1日1アジェンダ
- **status**: `draft`=自動生成直後、`confirmed`=ユーザー確認済み、`completed`=会議実施後
- **linked_meeting_record_id**: 会議実施後にmeeting_recordsと紐づけ
- **items**: JSONB配列（Phase 3で個別追跡が必要になれば別テーブルに分離検討）
- **自動生成**: Cronで open_issues(優先度順) + decision_log(最新) + tasks(進行中) からアジェンダ項目を構成

---

## 🔑 テーブル間の主要な関係性（ER図）

```
users (Supabase auth)
  ├─ contact_persons (user_id)
  │  ├─ contact_channels (contact_id)
  │  ├─ contact_patterns (contact_id)
  │  └─ linked_user_id ← consultations (responder_user_id)
  ├─ organizations (user_id)
  │  ├─ organization_channels (organization_id)
  │  └─ projects (organization_id)
  │     ├─ project_channels (project_id)
  │     ├─ tasks (project_id)
  │     │  ├─ task_members (task_id)
  │     │  ├─ task_conversations (task_id)
  │     │  ├─ thought_task_nodes (task_id)
  │     │  ├─ thought_edges (task_id)
  │     │  ├─ thought_snapshots (task_id)
  │     │  ├─ drive_documents (task_id)
  │     │  └─ task_external_resources (task_id) [Phase E]
  │     ├─ seeds (project_id) [廃止予定]
  │     │  ├─ seed_conversations (seed_id)
  │     │  ├─ thought_task_nodes (seed_id)
  │     │  └─ thought_edges (seed_id)
  │     ├─ business_events (project_id)
  │     ├─ open_issues (project_id) [v3.4]
  │     ├─ decision_log (project_id) [v3.4]
  │     ├─ meeting_agenda (project_id) [v3.4]
  │     └─ drive_folders (project_id)
  ├─ drive_folders (user_id)
  ├─ drive_documents (user_id)
  ├─ drive_file_staging (user_id)
  ├─ jobs (user_id)
  │  └─ consultations (job_id / requester_user_id)
  ├─ idea_memos (user_id)
  │  ├─ memo_conversations (memo_id)
  │  └─ thought_task_nodes (memo_id)
  ├─ inbox_messages [チャネル別に複数]
  ├─ inbox_sync_state (user_id)
  ├─ user_channel_subscriptions (user_id)
  ├─ user_service_tokens (user_id)
  ├─ secretary_conversations (user_id)
  ├─ user_thinking_tendencies (user_id)
  └─ knowledge_* (user_id作成) ← ナレッジは複数ユーザー共有
     ├─ knowledge_master_entries (user_id)
     │  ├─ thought_task_nodes (node_id)
     │  └─ thought_edges (from/to_node_id)
     ├─ knowledge_domains (user_id)
     │  └─ knowledge_fields (domain_id)
     └─ knowledge_clustering_proposals (user_id)
```

---

## 最後に：運用上のコツ

### テーブル作成・マイグレーションのチェックリスト
- [ ] TEXT型 id は必ず手動生成フォーマットを指定
- [ ] NOT NULL 制約は慎重に（新規カラム追加時は NULL許容に）
- [ ] UNIQUE 制約を複合 (user_id, ...) にする（マルチテナント対応）
- [ ] RLS ポリシー設定（user_id でフィルタ）
- [ ] FK ON DELETE CASCADE か SET NULL か明示的に
- [ ] INDEX は頻出の WHERE/JOIN カラムに

### RLS の確認
- CREATE TABLE 後、必ず RLS ポリシーを個別に登録する
- Supabase管理画面 → Authentication → RLS で確認

### クエリ最適化
- WHERE user_id = $1 のフィルタを常に先行
- JOIN 前に WHERE で絞り込む
- INDEX 活用：user_id, channel, created_at 等で 複合INDEX 検討

---

**This document serves as the single source of truth for NodeMap database schema.**
Last updated: 2026-03-10 (v3.4 Phase 1)
