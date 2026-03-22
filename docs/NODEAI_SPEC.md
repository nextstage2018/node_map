# NodeAI — 会議中リアルタイムアシスタント 仕様書

最終更新: 2026-03-22

---

## 1. コンセプト

NodeAIは、Google Meet会議に参加し、参加者の呼びかけに音声で応答するAIアシスタント。NodeMapのプロジェクト情報（タスク・決定事項・未確定事項・検討ツリー等）を参照し、会議中のリアルタイムな質疑に対応する。

### 1.1 解決する課題

- 過去の決定事項との食い違いを人間が見落とす
- タスク進捗の確認に時間がかかる
- 未確定事項が置き去りにされる
- 議事録は会議後にしか使えない（リアルタイムに参照できない）

### 1.2 完成イメージ

```
Google Meet
├── 人間参加者A
├── 人間参加者B
└── 🤖 "NodeAI"（Botアカウント）← 参加者全員に見える・聞こえる
```

### 1.3 基本方針

- **呼びかけ駆動**: 自律的な介入はしない。人間が明示的に呼んだときだけ応答
- **短く的確に**: 1回の応答は15秒以内（1〜2文）。詳しくは「もう少し教えて」で深掘り
- **議事録はMeetに委ねる**: Gemini会議メモが議事録。NodeAIは会議中のアシストに徹する
- **既存の公開レベルを踏襲**: internal/client/partnerで情報の出し分けを制御

---

## 2. アーキテクチャ

```
[Google Meet]
    ↓ 音声ストリーム（参加者の発言）
[Recall.ai Bot]
    ├── リアルタイム文字起こし → Webhook
    └── 話者識別（名前・メール付き）
    ↓
[NodeMap API: POST /api/nodeai/webhook]
    ├── 発言バッファ蓄積
    ├── トリガーワード検知（「NodeAI」「ノードさん」等）
    ├── 質問内容を抽出
    ├── 話者 → contact_persons マッチ（メール or 名前）
    └── プロジェクトコンテキスト取得（MCP既存ツール流用）
    ↓
[Claude API: claude-sonnet-4-5-20250929]
    ├── NodeMapコンテキスト注入
    ├── 会話バッファ（直近の議論の流れ）
    └── 応答生成（15秒以内・簡潔に）
    ↓
[ElevenLabs TTS API]
    ├── 日本語音声生成（落ち着いた女性ボイス）
    └── MP3形式で返却
    ↓
[Recall.ai Output Audio API]
    ├── Base64エンコードしたMP3を送信
    └── Google Meetの全参加者に聞こえる
```

---

## 3. 外部サービス

### 3.1 Recall.ai（Bot参加 + 文字起こし + 音声出力）

| 項目 | 値 |
|---|---|
| 用途 | Bot参加・リアルタイム文字起こし・音声出力 |
| 料金 | 録音 $0.50/時間 + 文字起こし $0.15/時間 = $0.65/時間 |
| 月額目安 | 週2回×1時間 = 月8時間 ≈ $5.20/月 |
| 対応プラットフォーム | Google Meet（Zoom, Teams, Webexも対応可） |

#### Bot作成 API

```
POST https://us-west-2.recall.ai/api/v1/bot/
```

```json
{
  "meeting_url": "https://meet.google.com/xxx-xxx-xxx",
  "bot_name": "NodeAI",
  "recording_config": {
    "transcript": {
      "provider": "recallai_streaming",
      "language_code": "ja"
    },
    "realtime_endpoints": [
      {
        "type": "webhook",
        "url": "https://node-map-eight.vercel.app/api/nodeai/webhook",
        "events": ["transcript.data"]
      }
    ]
  },
  "automatic_audio_output": {
    "in_call_recording_disclaimer": {
      "kind": "mp3",
      "b64_data": "<サイレントMP3のBase64>"
    }
  }
}
```

#### リアルタイム文字起こし Webhook ペイロード

```json
{
  "event": "transcript.data",
  "data": {
    "bot_id": "xxx",
    "data": {
      "words": [
        { "text": "ノードさん", "start_timestamp": 120.5, "end_timestamp": 121.0 },
        { "text": "タスクの", "start_timestamp": 121.0, "end_timestamp": 121.3 },
        { "text": "状況は", "start_timestamp": 121.3, "end_timestamp": 121.8 }
      ],
      "participant": {
        "id": 123,
        "name": "鈴木伸二",
        "email": "suzuki@next-stage.biz",
        "is_host": true,
        "platform": "google_meet"
      },
      "language_code": "ja"
    }
  }
}
```

#### 音声出力 API

```
POST https://us-west-2.recall.ai/api/v1/bot/{bot_id}/output_audio/
```

```json
{
  "kind": "mp3",
  "b64_data": "<Base64エンコードされたMP3>"
}
```

### 3.2 ElevenLabs（TTS: テキスト→音声変換）

| 項目 | 値 |
|---|---|
| 用途 | 日本語テキスト→音声変換 |
| 音声 | 落ち着いた女性ボイス（日本語対応モデル） |
| 料金 | Creator: $0.30/1000文字、Pro: $0.24/1000文字 |
| 月額目安 | 1回50文字×5回×8会議 = 2000文字 ≈ $0.60/月 |
| 出力形式 | MP3 |

#### TTS API

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

```json
{
  "text": "田中さんの担当タスクは3件で、うち1件が期限超過です。",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.7,
    "similarity_boost": 0.8,
    "style": 0.3
  }
}
```

レスポンス: `audio/mpeg` バイナリ（MP3）

### 3.3 Claude API（応答生成）

| 項目 | 値 |
|---|---|
| モデル | claude-sonnet-4-5-20250929（既存と統一） |
| Max Tokens | 200（短い応答を強制） |
| 月額目安 | 5回×8会議 = 40回/月 ≈ $2〜5/月 |

### 3.4 月額コスト合計

| サービス | 月額目安 |
|---|---|
| Recall.ai | $5.20 |
| ElevenLabs | $0.60（Creator）〜 $22（定額プラン） |
| Claude API | $2〜5 |
| **合計** | **$8〜32/月** |

※ 週2回×1時間・1会議5回呼びかけの場合

---

## 4. トリガーワード

### 4.1 対応パターン

| パターン | 例 |
|---|---|
| `NodeAI` | 「NodeAI、タスクの状況は？」 |
| `ノードさん` | 「ノードさん、前回何が決まりましたか？」 |
| `ノードAI` | 「ノードAI、未確定事項を教えて」 |
| `ヘイエージェント` | 「ヘイエージェント、田中さんの進捗は？」 |

### 4.2 検知ロジック

```typescript
const TRIGGER_PATTERNS = [
  /node\s*ai/i,
  /ノード\s*(さん|AI|エーアイ)/,
  /ヘイ\s*(エージェント|agent)/i,
];

function detectTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some(p => p.test(text));
}
```

- 文字起こしの各utterance（発言単位）でチェック
- トリガー後の文章を質問として抽出
- 同一話者の後続utterance（3秒以内）も質問に含める

### 4.3 誤検知対策

- 「ノード」単体では反応しない（「さん」「AI」等の接尾辞が必須）
- 発言中に含まれる場合のみ（文字起こしの信頼度が低い場合はスキップ）
- 直前の応答から10秒以内の再トリガーは無視（エコー防止）

---

## 5. 話者識別とコンタクト紐づけ

### 5.1 紐づけフロー（ユーザーの事前設定不要）

```
Recall.ai Webhook → participant.email
  ↓
contact_channels テーブル（channel='email', address=メール）
  ↓ 逆引き
contact_persons テーブル → 名前・所属組織・relationship_type
  ↓ linked_user_id があれば
user_service_tokens → ログインユーザーとして確定

フォールバック（emailなし or 未登録）:
  participant.name → contact_persons.name で部分一致
  → マッチしなければ「参加者N」として扱う
```

### 5.2 話者コンテキストの活用

```typescript
// 「ノードさん、私のタスクは？」の場合
// → 話者のcontact_idで assigned_contact_id をフィルタ
// → 「鈴木さんの担当タスクは3件です」のようにパーソナライズ
```

---

## 6. NodeMapコンテキスト取得

### 6.1 MCPサーバーの既存ツール流用

既存の `mcp-server/` の3ツールをサービス関数として切り出して利用:

| MCPツール | NodeAIでの用途 |
|---|---|
| `get_project_context` | タスク・MS・検討ツリー・会議録の全コンテキスト |
| `get_decision_tree` | 検討ツリーの詳細取得 |
| `list_projects` | プロジェクト一覧（プロジェクト特定用） |

### 6.2 追加で取得するデータ

| データ | テーブル | 用途 |
|---|---|---|
| 未確定事項 | `open_issues` | 「未確定事項を教えて」への回答 |
| 決定事項 | `decision_log` | 「前回何が決まった？」への回答 |
| タスク進捗 | `tasks` + `task_assignees` | 「タスクの状況は？」「田中さんの進捗は？」 |
| マイルストーン | `milestones` | 「今週のゴールは？」 |
| 上長フィードバック | `boss_feedback_learnings` | 過去の指摘事項をAIに注入 |

### 6.3 プロジェクト特定

会議 → どのプロジェクトの情報を参照するか:

```
1. Bot起動時に project_id が指定されている（定期イベント自動起動の場合）
   → そのまま使用

2. Bot起動時に meeting_url のみ（手動起動の場合）
   → 参加者メール → contact_channels → project_members → project_id
   → 複数PJにヒットする場合は最もメンバー一致率が高いPJを選択

3. フォールバック
   → 「どのプロジェクトの情報を確認しますか？」と音声で確認
```

---

## 7. Claude AI 応答生成

### 7.1 システムプロンプト

```typescript
const systemPrompt = `
あなたはNodeAI。会議に参加しているAIアシスタントです。
呼びかけられたときだけ、簡潔に応答してください。

【プロジェクト情報】
${projectContext}

【ルール】
- 1〜2文で簡潔に回答（15秒以内で読み上げられる長さ）
- 数字やファクトを優先。曖昧な表現を避ける
- NodeMapにデータがない場合は、会議サポートとして一般知識で補完する
- 質問者の名前がわかれば呼びかける（「鈴木さん、...」）
- 詳細が必要な場合は「詳しくお伝えしましょうか？」と聞く

【公開レベル: ${relationshipType}】
${relationshipType === 'internal'
  ? '全情報を回答可能（未確定事項・思考ログ含む）'
  : '未確定事項(open_issues)・思考ログは非公開。決定事項・タスク進捗のみ回答'}

【直近の会話の流れ】
${recentConversationBuffer}
`;
```

### 7.2 応答文字数の目安

| 種別 | 文字数 | 秒数 |
|---|---|---|
| 短い確認 | 30〜50文字 | 5〜8秒 |
| 通常の回答 | 50〜100文字 | 8〜15秒 |
| 詳細（聞かれた場合） | 100〜200文字 | 15〜30秒 |

### 7.3 応答パターン例

| 質問 | 応答例 |
|---|---|
| 「タスクの状況は？」 | 「現在進行中のタスクは5件です。うち田中さん担当の2件が期限超過しています。」 |
| 「前回何が決まった？」 | 「3月18日の会議で、リリース日を4月15日に確定、テスト期間を2週間に延長する決定がされています。」 |
| 「未確定事項を教えて」 | 「未確定事項は3件あります。一番古いのはAPI仕様の最終確認で、12日間未解決です。」 |
| 「佐藤さんのタスクは？」 | 「佐藤さんの担当タスクは2件です。デザインレビューが進行中、ドキュメント作成が着手前です。」 |

---

## 8. 公開レベル制御

v4.3チャネルボットと同じルールを踏襲。

| データ | internal | client/partner |
|---|---|---|
| タスク進捗 | ✅ | ✅ |
| 決定事項 | ✅ | ✅ |
| 未確定事項 | ✅ | ❌ |
| 思考ログ | ❌ | ❌ |
| マイルストーン | ✅ | ✅ |
| 上長フィードバック | ✅ | ❌ |

### 判定フロー

```
Bot起動時に project_id → projects → organization → relationship_type
→ Claude プロンプトに公開レベルとして注入
→ 質問がopen_issuesに関する場合 + client/partner → 「その情報は確認が必要です」
```

---

## 9. Bot起動方法

### 9.1 自動起動（定期イベント連携）

```
project_recurring_rules（type='meeting', enabled=true）
  ↓ Cron or カレンダーイベント検知
  ↓ metadata.nodeai_enabled = true の場合
POST Recall.ai /api/v1/bot/
  ↓ meeting_url = カレンダーイベントのMeet URL
  ↓ project_id をBotのmetadataに埋め込み
Bot が会議に自動参加
```

### 9.2 手動起動（NodeMap UI）

定期イベント管理画面（RecurringRulesManager）に「NodeAI参加」トグルを追加。

または、カレンダーウィジェットの会議予定に「NodeAI参加」ボタンを追加。

ボタン押下 → `POST /api/nodeai/join` → Recall.ai Bot作成 → 会議に参加

### 9.3 設定項目

| 項目 | 場所 | デフォルト |
|---|---|---|
| NodeAI自動参加 | 定期イベント設定 | OFF |
| NodeAI手動起動 | カレンダー or 定期イベント | 常時利用可能 |
| 音声の有効/無効 | プロジェクト設定 | ON |

---

## 10. 会話バッファ管理

### 10.1 バッファ構造

```typescript
interface ConversationBuffer {
  botId: string;          // Recall.ai bot ID
  projectId: string;      // 紐づくプロジェクト
  relationshipType: string; // internal/client/partner
  utterances: Array<{
    speakerName: string;
    speakerContactId?: string;
    text: string;
    timestamp: number;
  }>;
  nodeaiResponses: Array<{
    question: string;
    answer: string;
    timestamp: number;
  }>;
}
```

### 10.2 バッファの寿命

- 会議中のみメモリ（またはRedis/Vercel KV）に保持
- 直近5分間の発言のみClaude APIに送信（コンテキストウィンドウ節約）
- 会議終了時にバッファを破棄（議事録はGeminiに任せる）
- NodeAIの応答履歴は保存しない（会議中のサポートに徹する）

### 10.3 Vercelサーバーレス環境での考慮

```
課題: Vercelはリクエスト間でメモリを共有しない
解決案:
  1. Vercel KV（Redis）で会議ごとのバッファを管理
     キー: nodeai:session:{bot_id}
     TTL: 3時間（会議終了後に自動削除）
  2. またはSupabaseに一時テーブルを作成
     nodeai_sessions テーブル（TTLベースで自動クリーン）
```

---

## 11. APIエンドポイント（新規）

### 11.1 Webhook受信

```
POST /api/nodeai/webhook
```

Recall.aiからのリアルタイム文字起こしを受信。

```typescript
// リクエストボディ: Recall.ai Webhook ペイロード（セクション3.1参照）
// 処理フロー:
//   1. utteranceをバッファに追加
//   2. トリガーワード検知
//   3. 検知したら → 質問抽出 → Claude応答生成 → TTS → Recall.ai Output
//   4. 検知しなかったら → 200返却（バッファ蓄積のみ）
```

### 11.2 手動起動

```
POST /api/nodeai/join
```

```json
{
  "meeting_url": "https://meet.google.com/xxx-xxx-xxx",
  "project_id": "uuid"
}
```

### 11.3 Bot停止

```
POST /api/nodeai/leave
```

```json
{
  "bot_id": "recall-bot-id"
}
```

### 11.4 セッション状態取得

```
GET /api/nodeai/session?bot_id=xxx
```

現在のバッファ状態・応答回数・参加者一覧を返す。

---

## 12. データベース変更

### 12.1 新規テーブル: nodeai_sessions（一時データ）

```sql
CREATE TABLE nodeai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id TEXT NOT NULL UNIQUE,
  project_id UUID REFERENCES projects(id),
  meeting_url TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'internal',
  participants JSONB DEFAULT '[]',
  response_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodeai_sessions_bot ON nodeai_sessions(bot_id);
CREATE INDEX idx_nodeai_sessions_status ON nodeai_sessions(status);
```

### 12.2 既存テーブルへの追加

```sql
-- project_recurring_rules.metadata に nodeai_enabled フラグを追加（既存JSONBに含める）
-- 例: metadata = { "nodeai_enabled": true, "calendar_event_id": "xxx" }
```

テーブル追加は最小限。バッファはVercel KV（Redis）を推奨。

---

## 13. 環境変数（追加）

```bash
RECALL_API_KEY=            # Recall.ai APIキー
ELEVENLABS_API_KEY=        # ElevenLabs APIキー
ELEVENLABS_VOICE_ID=       # 日本語女性ボイスのID
NODEAI_ENABLED=true        # NodeAI機能の有効/無効
```

---

## 14. 処理フロー詳細（Webhook受信→音声応答）

```
[1] Recall.ai Webhook → POST /api/nodeai/webhook
    ↓
[2] utterance をバッファに追加（Vercel KV or Supabase）
    ↓
[3] トリガーワード検知
    ├── なし → 200返却（処理終了）
    └── あり → 続行
    ↓
[4] 質問テキストを抽出（トリガー以降の文字列）
    ↓
[5] 話者のcontact_persons を特定（メール → contact_channels）
    ↓
[6] プロジェクトコンテキスト取得
    ├── tasks（担当者・ステータス・期限）
    ├── decision_log（直近10件）
    ├── open_issues（publicレベルに応じて）
    ├── milestones（現在進行中）
    └── boss_feedback_learnings（internal時）
    ↓
[7] Claude API 呼び出し（max_tokens: 200）
    ├── system: プロジェクト情報 + 公開レベル + 直近会話
    └── user: 「{話者名}さんの質問: {質問テキスト}」
    ↓
[8] 応答テキスト取得
    ↓
[9] ElevenLabs TTS API（テキスト → MP3）
    ↓
[10] MP3 → Base64エンコード
    ↓
[11] Recall.ai Output Audio API
    POST /api/v1/bot/{bot_id}/output_audio/
    { "kind": "mp3", "b64_data": "<base64>" }
    ↓
[12] Google Meet全員に音声が流れる
    ↓
[13] 応答をバッファに記録（エコー防止用）
    ↓
[14] nodeai_sessions.response_count を +1
```

### 14.1 レイテンシ目標

| ステップ | 目標 | 備考 |
|---|---|---|
| Webhook受信 → トリガー検知 | <100ms | 文字列マッチのみ |
| コンテキスト取得 | <500ms | Supabase並列クエリ |
| Claude API | <2s | max_tokens: 200で高速 |
| ElevenLabs TTS | <1s | 50文字程度 |
| Recall.ai Output | <500ms | API呼び出し |
| **合計** | **<4秒** | 呼びかけから応答まで |

---

## 15. MVP実装スコープ

### Phase 1: 最小構成（MVP）— 呼びかけ + 質問応答

| # | タスク | 期間 |
|---|---|---|
| 1 | Recall.aiアカウント作成 + API検証 | 1日 |
| 2 | ElevenLabsアカウント作成 + 日本語ボイス選定 | 0.5日 |
| 3 | POST /api/nodeai/webhook 実装（文字起こし受信 + トリガー検知） | 1〜2日 |
| 4 | POST /api/nodeai/join 実装（Bot起動） | 0.5日 |
| 5 | コンテキスト取得サービス（MCPツール流用） | 1日 |
| 6 | Claude応答生成 + ElevenLabs TTS + Recall.ai Output の一気通貫 | 2日 |
| 7 | 会話バッファ管理（Vercel KV or Supabase） | 1日 |
| 8 | テスト・調整 | 1〜2日 |
| **合計** | | **7〜9日** |

### Phase 2: 話者認識 + パーソナライズ

- participant.email → contact_persons マッチ
- 「鈴木さん、あなたの担当タスクは...」のようにパーソナライズ
- 公開レベル分岐の実装

### Phase 3: 自動起動 + UI

- 定期イベントからの自動Bot参加
- NodeMap UIに「NodeAI参加」ボタン追加
- セッション管理画面

### Phase 4: 高度な機能（将来）

- 矛盾検知（呼びかけなしのパッシブ通知）
- 会議中のリアルタイムタスク作成
- 会議サマリーの即時共有

---

## 16. ファイル構成（予定）

```
src/
├── app/api/nodeai/
│   ├── webhook/route.ts          # Recall.ai Webhook受信
│   ├── join/route.ts             # Bot起動（手動）
│   ├── leave/route.ts            # Bot停止
│   └── session/route.ts          # セッション状態取得
├── services/nodeai/
│   ├── triggerDetector.service.ts # トリガーワード検知
│   ├── contextBuilder.service.ts  # NodeMapコンテキスト構築（MCP流用）
│   ├── responseGenerator.service.ts # Claude応答生成
│   ├── ttsService.ts             # ElevenLabs TTS
│   ├── recallClient.service.ts   # Recall.ai API クライアント
│   └── sessionManager.service.ts # 会話バッファ・セッション管理
sql/
└── nodeai_sessions.sql           # テーブル作成SQL
```

---

## 17. 事前準備チェックリスト

- [ ] Recall.ai アカウント作成（https://recall.ai）
- [ ] Recall.ai APIキー取得
- [ ] ElevenLabs アカウント作成（https://elevenlabs.io）
- [ ] ElevenLabs APIキー取得
- [ ] 日本語女性ボイスID選定（ElevenLabs Voice Library）
- [ ] Vercel KV 有効化（バッファ管理用）or Supabase一時テーブル方式の決定
- [ ] Vercel環境変数に追加（RECALL_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID）
- [ ] NodeMap Webhook URL（https://node-map-eight.vercel.app/api/nodeai/webhook）の疎通確認
