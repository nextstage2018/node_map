# NodeMap - Claude Code 作業ガイド（SSOT）

最終更新: 2026-02-26（Phase 39b まで反映）

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
| `inbox_messages` | メッセージ本体（受信＋送信）。user_id カラムは存在しない。direction カラムで送受信を区別（received/sent） |
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
| 38 | 送信メッセージDB保存・スレッド統合表示・送信済みフィルタ | mainにマージ済み |
| 38b | 返信修正・送信文字色改善・宛先サジェスト機能 | mainにマージ予定 |
| 39 | AIコミュニケーション分析を双方向（受信＋送信）対応に拡張 | 6cbc3c8 |
| 39b | 外部サービス送信検出＋AI分析ルーム/チャンネルマッチング | 82ecfdb |

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

## Phase 38 実装内容（送信メッセージDB保存・スレッド統合表示）

- `inbox_messages` テーブルに `direction TEXT DEFAULT 'received'` カラム追加
- `inbox_messages` テーブルに `sender_user_id TEXT` カラム追加
- `direction` + `timestamp` 複合インデックス追加
- `/api/messages/send`: 送信メッセージを `direction='sent'` で DB に保存。from.name を「あなた」に統一
- `/api/messages/reply`: 返信メッセージを新規レコードとして `direction='sent'` で DB に保存（元メッセージの metadata を引き継ぎ、同じスレッドにグループ化）
- `/api/messages` GET: `direction` クエリパラメータ対応（all/sent/received）
- `inboxStorage.service.ts`: saveMessages / loadMessages で direction 対応
- `types.ts`: `MessageDirection` 型追加、`UnifiedMessage` に `direction?` フィールド追加
- UI: `ConversationBubble` の送受信判定を `direction` フィールドベースに改善
- UI: サイドバーに「送信済み」フィルタ追加（Send アイコン + 送信数表示）
- UI: MessageList で `sent` フィルタ時に送信メッセージを含むグループのみ表示
- UI: インボックスのタイトルが「送信済み」フィルタ時に切り替わる

### DBマイグレーション（要 Supabase 実行）
```sql
-- 016_phase38_sent_messages.sql
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'received';
UPDATE inbox_messages SET direction = 'received' WHERE direction IS NULL;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS sender_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction ON inbox_messages(direction);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction_timestamp ON inbox_messages(direction, timestamp DESC);
```

---

## Phase 38b 実装内容（返信修正・送信文字色改善・宛先サジェスト）

### 返信API修正
- `/api/messages/reply`: サービス関数の引数形式をオブジェクト→位置引数に修正
- Slack返信: `metadata.slackChannel` でチャネルID取得、`metadata.slackThreadTs || metadata.slackTs` でスレッドTS取得
- Chatwork返信: `metadata.chatworkRoomId` でルームID取得
- `sendResult.messageId` の未定義参照エラーを修正（送信成功でもUI上「失敗」表示される原因）
- Chatwork To形式: `[To:名前]` → `[To:account_id]`（数値ID）に修正
- Gmail返信: 送信済みメッセージへの返信時、`message.to` から宛先を取得するよう修正

### 送信メッセージ文字色改善
- `ChatworkBody` コンポーネントに `isOwn?: boolean` プロップ追加
- 送信メッセージ（青背景）の文字色を白に変更
- `MessageDetail.tsx` の3箇所で `isOwn` を伝播（全文表示の白背景は除外）

### 宛先サジェスト機能
- `/api/messages/recipients` GET: 宛先候補検索API新設
  - Email: `contact_channels`（channel='email'）+ `inbox_messages` の from_address フォールバック
  - Slack チャネル: `organization_channels`（service_name='slack'）+ `inbox_messages` metadata フォールバック
  - Chatwork ルーム: `inbox_messages` metadata（chatworkRoomId + chatworkRoomName）
  - Chatwork コンタクト: `contact_channels`（channel='chatwork'、address=account_id）
- `ComposeMessage.tsx` 全面リライト
  - `RecipientInputWithSuggest`: デバウンス検索＋ドロップダウン＋キーボード操作
  - `ChannelSuggestInput`: Slack/Chatworkチャネル・ルーム選択（フォーカス時に初期ロード）
  - Email: To/Cc/Bcc にコンタクトサジェスト
  - Slack: チャネルサジェスト（フォーカスで一覧表示）
  - Chatwork: ルームサジェスト＋Toコンタクトサジェスト

### サービス関数シグネチャ（重要）
```typescript
// 位置引数（オブジェクトではない）
sendEmail(to: string|string[], subject: string, body: string, inReplyTo?: string, cc?: string[]): Promise<boolean>
sendSlackMessage(channelId: string, text: string, threadTs?: string, userId?: string): Promise<boolean>
sendChatworkMessage(roomId: string, body: string): Promise<boolean>
```

### 変更ファイル一覧
- `src/app/api/messages/reply/route.ts` — 返信API修正
- `src/app/api/messages/recipients/route.ts` — 新規：宛先候補検索API
- `src/app/api/messages/route.ts` — 送信済みメッセージ統合表示
- `src/components/inbox/ComposeMessage.tsx` — サジェスト付き宛先選択UI
- `src/components/inbox/ReplyForm.tsx` — Chatwork To・Gmail返信宛先修正
- `src/components/inbox/ChatworkBody.tsx` — isOwn対応（送信メッセージ白文字）
- `src/components/inbox/MessageDetail.tsx` — ChatworkBodyへisOwn伝播

---

## Phase 39 実装内容（AIコミュニケーション分析 双方向対応）

### 分析API修正（`/api/contacts/[id]/analyze`）
- 受信メッセージ（`from_address` IN 相手アドレス）+ 送信メッセージ（`direction='sent'` + `to_list` JSONフィルタ）の両方を取得
- `to_list` は `[{name, address}]` 形式のJSONB配列 → JSで相手アドレスに一致するものをフィルタ
- 受信・送信を統合して時系列ソート、最大80件を分析対象に
- プロンプトを双方向分析対応に改善:
  - 相手のコミュニケーション傾向（トピック、トーン、返信速度）
  - ユーザー自身の対応傾向（返信の積極性、やり取りの主導権）
  - 双方向のやり取りの特徴（会話の流れ、頻度、バランス）
- `max_tokens` を 600→800 に増加（分析内容拡充のため）
- メッセージサマリーに `←受信` / `→送信` の方向ラベルを付与
- デモモード（APIキーなし）も受信/送信件数を表示

### Cron一括分析修正（`/api/cron/analyze-contacts`）
- 同様に受信＋送信メッセージの両方を取得・統合
- 双方向分析プロンプトに更新
- ログに受信/送信件数を出力

### UI調整
- コンタクト詳細の分析タブ: 未分析時の説明文を「双方向の関係性やコミュニケーション傾向」に更新

### 変更ファイル一覧
- `src/app/api/contacts/[id]/analyze/route.ts` — 双方向分析対応
- `src/app/api/cron/analyze-contacts/route.ts` — Cron双方向分析対応
- `src/app/contacts/page.tsx` — UI説明文更新

---

## Phase 39b 実装内容（外部サービス送信検出＋AI分析マッチング修正）

### 外部サービスの送信メッセージ検出
- **Slack** (`slackClient.service.ts`): 既存の `auth.test()` で取得する `botUserId` と各メッセージの `msg.user` を比較。一致すれば `direction='sent'`、`from.name='あなた'` に設定
- **Chatwork** (`chatworkClient.service.ts`): `/me` APIで自分の `account_id` を取得。各メッセージの `msg.account.account_id` と比較し、一致すれば `direction='sent'`、`from.name='あなた'` に設定
- **Gmail** (`emailClient.service.ts`): IMAP の送信済みフォルダ（`[Gmail]/Sent Mail` 等、ロケール別にフォールバック）からメッセージを取得。`direction='sent'`、`from.name='あなた'` に設定

### AI分析の送信メッセージマッチング修正
- **問題**: Chatwork/Slackはルーム/チャンネルベースのため `to_list` が空。Phase 39 の `to_list` マッチングでは送信0件になっていた
- **解決**: 受信メッセージの metadata から `chatworkRoomId` / `slackChannel` を抽出し、送信メッセージを3つの方法でマッチング:
  1. `to_list` にコンタクトのアドレスが含まれる（Email向け）
  2. 同じ `chatworkRoomId` を持つ（Chatwork向け）
  3. 同じ `slackChannel` を持つ（Slack向け）
- `/api/contacts/[id]/analyze` と `/api/cron/analyze-contacts` の両方に適用

### 変更ファイル一覧
- `src/services/slack/slackClient.service.ts` — 送信メッセージ検出（botUserId比較）
- `src/services/chatwork/chatworkClient.service.ts` — 送信メッセージ検出（/me API + account_id比較）
- `src/services/email/emailClient.service.ts` — 送信済みフォルダ取得
- `src/app/api/contacts/[id]/analyze/route.ts` — ルーム/チャンネルメタデータマッチング
- `src/app/api/cron/analyze-contacts/route.ts` — 同上

---

## 残課題（未実装）

1. ~~**送信メッセージの保存**~~: Phase 38 で対応済み。Phase 39b で外部サービス（Chatwork/Slack/Gmail）の送信メッセージ検出にも対応
2. ~~**返信機能の修正**~~: Phase 38b で対応済み（引数形式修正、チャネルID修正、UI表示修正）
3. ~~**宛先サジェスト機能**~~: Phase 38b で対応済み（コンタクト・Slackチャネル・Chatworkルームのサジェスト付き選択）
4. ~~**送信メッセージのAIコミュニケーション分析連携**~~: Phase 39 で対応済み。受信＋送信の双方向分析を実現
5. **auto生成コンタクト同士の連絡先結合**: 現状は DBに登録済みコンタクト（confirmed: true）のみ結合可能。isAutoGenerated: true 同士の統合は未実装
6. **ビジネスログの活動履歴連携**: business_events の contact_id が未設定のため、コンタクト詳細の活動履歴タブにビジネスイベントが表示されない。多対多（1イベント複数参加者）の設計見直しも必要
7. **宛先サジェストのデータソース拡充**: Chatworkルーム・Slackチャネルは現在 inbox_messages の metadata ベース（過去やり取りがあったもののみ）。API直接取得による全ルーム・全チャネル表示は未対応

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
