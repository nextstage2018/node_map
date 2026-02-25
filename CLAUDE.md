# CLAUDE.md — NodeMap プロジェクトルール

> このファイルはClaude Codeが最初に読む必須ルールファイルです。
> すべての作業はこのルールに従ってください。

---

## 1. プロジェクト概要

NodeMapは統合コミュニケーション＆ビジネスログツール。
Gmail / Slack / Chatworkのメッセージを統合インボックスで管理し、
ナレッジ・思考マップ・種ボックスで情報を蓄積する。

### 技術スタック
- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイル**: Tailwind CSS
- **DB/認証**: Supabase (PostgreSQL + Auth)
- **AI**: Anthropic Claude API (@anthropic-ai/sdk)
- **デプロイ**: Vercel
- **パッケージマネージャー**: npm

---

## 2. 絶対にやってはいけないこと（CRITICAL）

### デプロイ関連
- ❌ `vercel` コマンドでデプロイしない（デプロイはgit pushでVercelが自動実行）
- ❌ Vercelの設定を変更しない（vercel.json の crons 設定以外）
- ❌ 新しいVercelプロジェクトを作成しない
- ❌ `vercel link` や `vercel env` を実行しない

### DB関連
- ❌ Supabaseのテーブルを直接DROP/TRUNCATEしない
- ❌ 既存テーブルのカラムを削除しない（追加はOK）
- ❌ RLSポリシーを無断で無効化しない
- ❌ Supabaseの環境変数やプロジェクト設定を変更しない

### Git関連
- ❌ mainブランチに直接force pushしない
- ❌ git reset --hard で履歴を消さない
- ❌ .env.local や認証情報をコミットしない

### 既存機能
- ❌ 既存の画面・APIの動作を壊さない
- ❌ 既存ファイルを大幅に書き換える場合は必ずブランチを切る
- ❌ 既存のimport/exportの構造を無断で変更しない

---

## 3. 必ず守ること（REQUIRED）

### 作業フロー
1. **作業前**: `git checkout -b feature/phase-XX-description` でブランチを切る
2. **作業中**: こまめにコミットする（1機能1コミット）
3. **ビルド確認**: `npm run build` でエラーがないことを確認してからコミット
4. **動作確認**: 既存機能（インボックス、コンタクト、タスク等）が壊れていないことを確認
5. **マージ**: mainにマージする前にビルド成功を再確認

### コーディングルール
- 日本語コメントを使用する（ユーザーが非エンジニアのため）
- Phase番号をコメントに含める（例: `// Phase 30: 組織マスター追加`）
- 既存のコード規約に従う（既存ファイルのスタイルを参照）
- console.log のプレフィックスは `[機能名]` 形式（例: `[Contacts API]`）

### DB変更
- SQLマイグレーションファイルは `sql/` ディレクトリに保存
- ファイル名は連番: `011_phase30_organizations.sql` のように
- 既存テーブルの変更は ALTER TABLE ... ADD COLUMN IF NOT EXISTS を使用
- 新テーブルにはRLSポリシーを必ず設定

---

## 4. 環境情報

### ディレクトリ構成
```
node_map_git/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # APIルート（55+エンドポイント）
│   │   ├── inbox/page.tsx      # インボックス画面
│   │   ├── contacts/page.tsx   # コンタクト管理画面
│   │   ├── tasks/page.tsx      # タスク管理画面
│   │   ├── seeds/page.tsx      # 種ボックス画面
│   │   ├── nodemap/page.tsx    # 思考マップ画面
│   │   ├── master/page.tsx     # ナレッジマスター画面
│   │   ├── settings/page.tsx   # 設定画面
│   │   ├── login/page.tsx      # ログイン
│   │   ├── signup/page.tsx     # サインアップ
│   │   └── layout.tsx          # ルートレイアウト
│   ├── components/             # UIコンポーネント
│   │   ├── auth/               # 認証（AuthProvider）
│   │   ├── inbox/              # インボックス関連
│   │   ├── contacts/           # コンタクト関連
│   │   ├── tasks/              # タスク関連
│   │   ├── seeds/              # 種ボックス関連
│   │   ├── nodemap/            # 思考マップ関連
│   │   ├── knowledge/          # ナレッジ（KnowledgeToast等）
│   │   ├── settings/           # 設定関連
│   │   ├── shared/             # 共有（Header, Sidebar, DailyDigest等）
│   │   ├── timeline/           # タイムライン関連
│   │   ├── thinking/           # 思考ログ関連
│   │   ├── weekly/             # 週次ノード関連
│   │   ├── master/             # マスター関連
│   │   └── ui/                 # 汎用UI（Button, Badge等）
│   ├── services/               # ビジネスロジック
│   │   ├── ai/                 # AI関連（Claude API）
│   │   ├── email/              # Gmail連携
│   │   ├── slack/              # Slack連携
│   │   ├── chatwork/           # Chatwork連携
│   │   ├── inbox/              # インボックス永続化
│   │   ├── nodemap/            # ノードマップ関連
│   │   ├── contact/            # コンタクト関連
│   │   ├── task/               # タスク関連
│   │   ├── settings/           # 設定関連
│   │   └── thinking/           # 思考ログ関連
│   └── lib/                    # ユーティリティ
│       ├── supabase.ts         # Supabaseクライアント
│       ├── serverAuth.ts       # サーバーサイド認証
│       ├── types.ts            # 型定義
│       ├── cache.ts            # キャッシュ
│       ├── utils.ts            # ユーティリティ
│       └── knowledgePipeline.ts # ナレッジパイプライン
├── docs/                       # 設計書
├── public/                     # 静的ファイル
├── vercel.json                 # Vercel設定（cronジョブ）
├── next.config.mjs             # Next.js設定
├── package.json                # 依存関係
└── .env.local.example          # 環境変数テンプレート
```

### 環境変数（.env.local）
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<SupabaseプロジェクトURL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase匿名キー>
SUPABASE_SERVICE_ROLE_KEY=<Supabaseサービスロールキー>

# Email (IMAP/SMTP) — Gmail連携
EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASSWORD
SMTP_HOST / SMTP_PORT

# Slack
SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET

# Chatwork
CHATWORK_API_TOKEN

# AI
ANTHROPIC_API_KEY
```
※ .env.local は .gitignore に含まれており、リポジトリにはコミットされない。
※ 本番環境の環境変数はVercelのダッシュボードで設定済み。

### デプロイ
- mainブランチにpushすると、Vercelが自動でビルド＆デプロイする
- 開発ブランチ（feature/*）のpushでもプレビューデプロイが生成される
- CLIでの手動デプロイは不要（やらないこと）

### Supabase
- Supabase側のDBスキーマ変更はSQLファイルとして記録する
- テーブル作成後、Supabase Dashboard で手動実行する運用
- ユーザーがSupabase DashboardのSQL Editorでマイグレーションを実行する

---

## 5. 既存の重要パターン

### 認証パターン（APIルート）
```typescript
import { getServerUserId } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: '認証が必要です' },
      { status: 401 }
    );
  }
  // ... 処理
}
```
※ getServerUserId() はSupabase未設定時に 'demo-user-001' を返す（デモモード）

### APIレスポンスパターン
```typescript
// 成功
return NextResponse.json({ success: true, data: result });

// エラー
return NextResponse.json(
  { success: false, error: 'エラーメッセージ' },
  { status: 400 }
);
```

### Supabaseクライアント
```typescript
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

const supabase = createServerClient();
if (!supabase) {
  // デモモード: Supabase未設定
  return fallbackData;
}
```

### ナレッジパイプライン統合
メッセージ送信やシード保存の後にナレッジパイプラインを呼ぶパターン:
```typescript
import { handleKnowledgeResponse } from '@/components/knowledge/KnowledgeToast';

// API成功後
handleKnowledgeResponse(data, 'message_send');
```

---

## 6. 開発時の確認手順

### 新機能追加時
1. `git checkout -b feature/phase-XX-name`
2. SQLマイグレーションファイルを `sql/` に作成
3. APIルートを `src/app/api/` に追加
4. サービスを `src/services/` に追加
5. コンポーネントを `src/components/` に追加
6. ページを `src/app/` に追加
7. `npm run build` でビルド確認
8. `npm run dev` で動作確認
9. コミット＆プッシュ

### 既存機能が壊れていないかの確認
以下の画面が正常に動作することを確認:
- `/inbox` — メッセージ一覧が表示される
- `/contacts` — コンタクト一覧が表示される
- `/tasks` — タスクボードが表示される
- `/seeds` — 種ボックスが表示される
- `/nodemap` — 思考マップが表示される

### ビルドエラーの既知の問題
- `/login` と `/signup` のSSGエラー（Supabase環境変数未設定時）→ 無視してOK
- `/api/clusters/diff` のDynamic Server Usageエラー → 無視してOK

---

## 7. 設計書の場所

開発の参照資料:
- `docs/DESIGN_NodeMap_v2_Architecture.md` — v2全体アーキテクチャ（種中心設計、ビジネスログ、エージェント構想、コンタクト強化、ロードマップ）
- `docs/DESIGN_Phase29.md` — Phase 29 設計書
- `docs/DESIGN_Phase30.md` — Phase 30 設計書（あれば）
- `docs/handoff/` — Phase間の引き継ぎ文書

---

## 8. デザインガイドライン

### カラーパレット（3色基調）
日本人が好むクリーンで落ち着いたデザイン。3色を基調とし、過度な装飾を避ける。

```
プライマリ:   #2563EB (Blue-600)  — メインアクション、選択状態、リンク
セカンダリ:   #475569 (Slate-600) — テキスト、アイコン、ラベル
アクセント:   #F8FAFC (Slate-50)  — 背景、カード、パネル

補助色（控えめに使用）:
  成功:       #16A34A (Green-600)  — 完了、成功
  警告:       #EA580C (Orange-600) — 注意、期限間近
  エラー:     #DC2626 (Red-600)    — エラー、削除
```

### デザイン原則
- **余白を十分に取る** — 詰め込みすぎない。padding/margin は 16px 以上を基本に
- **フォントサイズ** — 本文 14px、見出し 18px、小テキスト 12px。極端に小さい文字は使わない
- **角丸** — rounded-lg (8px) を標準。ボタンやカードに統一感を持たせる
- **影** — shadow-sm 程度にとどめる。ドロップシャドウは控えめに
- **アイコン** — lucide-react を使用（既存と統一）。テキストと併記し、アイコンだけにしない
- **ステータスバッジ** — 既存の StatusBadge / ChannelBadge パターンに従う
- **レスポンシブ** — モバイル対応は後回しでOK。デスクトップファーストで実装

### 既存UIとの統一
- Header コンポーネント（`src/components/shared/Header.tsx`）を全ページで使用
- Sidebar コンポーネント（`src/components/shared/Sidebar.tsx`）のナビゲーション構造を踏襲
- Button コンポーネント（`src/components/ui/Button.tsx`）を使用（variant: primary / secondary / ghost）
- テーブルのスタイルは contacts/page.tsx を参考にする（sticky header, hover効果）

---

## 9. Phase 30 の実装タスク（次のマイルストーン）

参照: `docs/DESIGN_NodeMap_v2_Architecture.md`（コンタクト強化 = セクション8、ロードマップ = セクション9）

### Phase 30a: マスターデータ基盤
- `sql/011_phase30_organizations.sql` 作成（organizations, project_members, contacts拡張）
- `/api/organizations` CRUD API
- `/api/project-members` API

### Phase 30b: 簡単登録UI
- コンタクト追加モーダル
- CSVインポート機能
- 初回セットアップウィザード
- コンタクト詳細パネルの強化（組織紐付け、プロジェクト追加）

### Phase 30c: 自動マッチング
- メールアドレス完全一致マッチング
- ドメインマッチング
- 新規コンタクト生成時の自動マッチ処理

### Phase 30d: ビジネスログ基盤
- projects, groups, business_events テーブル
- タイムラインUI（左サイドバー + 中央タイムライン + 右パネル）
- 既存サイドバーにビジネスログへのナビゲーション追加
