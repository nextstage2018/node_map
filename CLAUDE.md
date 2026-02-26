# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-02-26（Phase 37b まで反映）

---

## プロジェクト概要

**NodeMap** は「情報を受け取り → 整理し → 活用する」個人・チーム向けコミュニケーション＆ビジネスログツール。

- **フレームワーク**: Next.js 14 / TypeScript / Tailwind CSS
- **DB**: Supabase（PostgreSQL）
- **AI**: Claude API（claude-sonnet-4-20250514）
- **デプロイ**: Vercel（本番: https://node-map-eight.vercel.app）
- **リポジトリ**: https://github.com/nextstage2018/node_map.git
- **ローカル**: ~/Desktop/node_map_git

---

## 重要なテーブル仕様（必ず守ること）

| テーブル名 | 備考 |
|---|---|
| `contact_persons` | コンタクト本体。id は TEXT型（自動生成なし）→ 必ず `'team_${Date.now()}_${random}'` 等で生成して渡す |
| `contact_channels` | コンタクトの連絡先。UNIQUE(contact_id, channel, address) 制約あり |
| `inbox_messages` | 受信メッセージ本体（unified_messages ではない）。user_id カラムは存在しない |
| `unified_messages` | 現在は空。inbox_messages を使うこと |
| `organizations` | 自社・取引先組織。domain で重複チェック。relationship_type / address / phone / memo カラムあり |
| `organization_channels` | 組織に紐づくチャネル（Slack/CW/Email）。UNIQUE(organization_id, service_name, channel_id) |

---

## 画面・ルート一覧

| 画面 | URL | 主なテーブル |
|---|---|---|
| インボックス | /inbox | inbox_messages |
| タスク | /tasks | tasks / task_conversations |
| 思考マップ | /nodemap | user_nodes / node_edges |
| コンタクト | /contacts | contact_persons / contact_channels |
| 組織 | /organizations | organizations / organization_channels |
| 組織詳細 | /organizations/[id] | organizations / organization_channels / contact_persons |
| ナレッジ | /master | knowledge_domains / knowledge_fields / knowledge_master_entries |
| ビジネスログ | /business-log | projects / business_events |
| 秘書 | /agent | tasks / seeds / user_nodes（読み取り専用） |
| 種ボックス | /seeds | seeds |
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

---

## Phase 35 実装内容（コンタクトマージ）

- `/api/contacts/duplicates` GET: 同名コンタクトの重複候補を返す
- `/api/contacts/merge` POST: primaryId にチャンネル・イベント・プロジェクトを移行し重複を削除
- `/api/contacts/route.ts`: contact_persons 主体で取得（1人1行保証）。inbox_messages の集約キーは from_address
- コンタクト詳細パネル: 「基本情報」「活動履歴」「コミュニケーション分析」「連絡先結合」の4タブ
- チャンネル名表示: 数字のみ or Slack形式（UXXXXX）の場合は他コンタクトの名前に置き換え。自分自身のIDは「マイチャット」

---

## Phase 36 実装内容（AIコミュニケーション分析）

- `/api/contacts/[id]/analyze` POST
  - inbox_messages から該当アドレスの直近50件を取得（user_id フィルタなし）
  - Claude API で関係性・口調・話題・返信速度・意思決定パターンを分析
  - 結果を `contact_persons.notes` に保存（手動実行は上書き）
  - メッセージ0件・notes入力済みの場合はスキップ
- `/api/cron/analyze-contacts` POST（毎日22:00 UTC = 翌7:00 JST）
  - notes が NULL または空文字のコンタクトのみ対象（自動は上書きしない）
  - CRON_SECRET 環境変数で認証
- UIは「コミュニケーション分析」タブ内に「コミュニケーション分析を実行」ボタン

### DBマイグレーション（Supabase実行済み）
```sql
ALTER TABLE contact_persons 
ADD COLUMN IF NOT EXISTS ai_context TEXT,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
```

---

## Phase 37 実装内容（組織チャネル連携・メンバー管理）

- `organization_channels` テーブル新設: UNIQUE(organization_id, service_name, channel_id)
- `contact_persons` に `auto_added_to_org BOOLEAN` カラム追加
- `/api/organizations/[id]/channels` GET/POST/DELETE: チャネルのCRUD
- `/api/organizations/[id]/members` GET/POST/DELETE: メンバー管理
  - POST: 組織横断ガード（1人=1組織、409で拒否）、company_name 連動
  - GET: company_name 未設定メンバーの自動修復
  - DELETE: company_name もクリア
- `/api/organizations/[id]/detect-members` POST: リンク済みチャネルから inbox_messages を走査しメンバー候補を検出・追加
- `/organizations/[id]/page.tsx`: 3タブ構成（基本情報 / チャネル / メンバー）
- 組織一覧: クリックで詳細遷移、ChevronRight アイコン

### DBマイグレーション（Supabase実行済み）
```sql
-- 014_phase37_organization_channels.sql
CREATE TABLE organization_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  channel_type TEXT,
  is_active BOOLEAN DEFAULT true,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, service_name, channel_id)
);
ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS auto_added_to_org BOOLEAN DEFAULT false;
```

---

## Phase 37b 実装内容（組織関係性・コンタクト連動）

- `organizations` テーブルに relationship_type / address / phone / memo カラム追加
- 関係性タイプ統一ラベル: 自社 / 取引先 / パートナー / 仕入先 / 見込み
- `RELATIONSHIP_TYPE_CONFIG` を全画面で統一（constants.ts / contacts/page.tsx / ContactCard.tsx / SetupWizard.tsx）
- 組織 → コンタクト関係性カスケード: 組織の relationship_type 変更時に所属コンタクトも連動更新
- 組織 → コンタクト company_name 連動: メンバー追加・自動検出・組織名変更時に contact_persons.company_name を設定
- 組織詳細ページ: 基本情報タブに住所・電話番号・メモ欄追加
- コンタクト詳細: 組織名クリックで組織詳細に遷移（リンク化）
- 組織一覧: 関係性バッジ表示

### DBマイグレーション（Supabase実行済み）
```sql
-- 015_phase37b_organization_detail.sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS relationship_type TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS memo TEXT;
```

### 組織 → コンタクトの関係性マッピング
| 組織の関係性 | コンタクトの関係性 |
|---|---|
| internal（自社） | internal（自社） |
| client（取引先） | client（取引先） |
| partner（パートナー） | partner（パートナー） |
| vendor（仕入先） | partner（パートナー） |
| prospect（見込み） | client（取引先） |

---

## 残課題（未実装）

1. **送信メッセージの保存**: 現在 inbox_messages は受信のみ。Chatwork/Slack の送信メッセージも取得・保存することで双方向のコミュニケーション分析が可能になる
2. **auto生成コンタクト同士の連絡先結合**: 現状は DBに登録済みコンタクト（confirmed: true）のみ結合可能。isAutoGenerated: true 同士の統合は未実装
3. **ビジネスログの活動履歴連携**: business_events の contact_id が未設定のため、コンタクト詳細の活動履歴タブにビジネスイベントが表示されない。多対多（1イベント複数参加者）の設計見直しも必要

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

### Vercel Cron
- vercel.json に crons 設定済み
- 環境変数 `CRON_SECRET` が必要

### ビルドエラー対処
```bash
# キャッシュエラーの場合
rm -rf .next && npm run dev
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
