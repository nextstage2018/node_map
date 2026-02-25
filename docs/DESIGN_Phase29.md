# Phase 29 設計書: ノード登録リデザイン＆会話ログ構造化

> 作成日: 2026-02-24
> 対象リポジトリ: node_map_git
> 前提: Phase 28 までの実装が完了済み

---

## 1. ノード登録リデザイン

### 1.1 現状分析

#### 現在のノード登録フロー
1. **自動登録**: メッセージ閲覧・返信・AI会話時に `NodeService.processText()` → `extractKeywords()` → `upsertNode()` でキーワード/人名/プロジェクト名が自動蓄積される
2. **手動登録**: `MapControls` の「ノード追加」ボタン → `NodeRegistrationDialog` モーダルで `POST /api/nodes` により登録
3. **クイック登録**: `MapControls` の検索バーで完全一致しない場合「新規登録」ボタン表示 → `NodeRegistrationDialog` にラベルを引き継いで起動
4. **編集・削除**: グラフ上のノードクリック → 右サイドバーに `NodeDetailPanel` 表示 → `PUT /api/nodes` で更新、`DELETE /api/nodes?nodeId=xxx` で削除

#### 既存コンポーネントの状態

| コンポーネント | ファイルパス | 状態 |
|---|---|---|
| `NodeRegistrationDialog` | `src/components/nodemap/NodeRegistrationDialog.tsx` | 実装済み（ラベル・タイプ・ドメイン・フィールド・メモ） |
| `NodeDetailPanel` | `src/components/nodemap/NodeDetailPanel.tsx` | 実装済み（表示・編集・削除） |
| `MapControls` | `src/components/nodemap/MapControls.tsx` | 実装済み（+ノード追加ボタン・検索バー・クイック登録） |
| ノードAPI (`/api/nodes`) | `src/app/api/nodes/route.ts` | GET/POST/PUT/DELETE 全メソッド実装済み |
| `NodeService` | `src/services/nodemap/nodeClient.service.ts` | `getNodes`/`upsertNode`/`updateNode`/`deleteNode` 実装済み |

#### 問題点・改善対象
1. **型定義の不整合**: `NodeInteractionTrigger` と `interactionCount` が `src/lib/types.ts` に未定義だが、`nodeClient.service.ts` で使用されている。TypeScript の型安全性が壊れている
2. **NodeRegistrationDialog のドメイン/フィールド選択が API に送信されない**: フォームで `domainId`/`fieldId` を選択できるが、`handleSubmit` の `POST /api/nodes` リクエストボディに含まれていない
3. **NodeRegistrationDialog のメモが活用されていない**: `memo` state があるが送信されない
4. **NodeDetailPanel のインタラクションカウント表示**: 「出現回数」と「頻度」の2列表示が冗長（`interactionCount` と `frequency` はほぼ同値）
5. **検索バーの候補クリック時にグラフ上のノードにフォーカスする機能がない**: 検索候補をクリックしても何も起きない

### 1.2 既存コンポーネント改善仕様

#### A) NodeRegistrationDialog.tsx の改善

**ファイルパス**: `src/components/nodemap/NodeRegistrationDialog.tsx`

**改善内容**:

(1) ドメイン・フィールド選択結果を API に送信する

```typescript
// handleSubmit 内の fetch body を拡張
body: JSON.stringify({
  label: label.trim(),
  type,
  domainId: domainId || undefined,
  fieldId: fieldId || undefined,
  sourceId: 'manual',
  direction: 'self',
})
```

(2) POST /api/nodes のリクエスト処理でドメイン・フィールドを受け取りノードに設定する

**変更箇所**: `src/app/api/nodes/route.ts` の `POST` ハンドラ

```typescript
// body から domainId, fieldId も取得
const { label, type, sourceId, direction, domainId, fieldId } = body;

// upsertNode 後にドメイン/フィールド設定（Supabase更新）
if (node && (domainId || fieldId)) {
  // NodeService.updateNodeClassification(node.id, userId, { domainId, fieldId })
}
```

(3) メモフィールドの扱い: メモは当面UIから削除するか、将来のノート機能として保持。現時点ではAPIに送信しないため、UIフォームからも除去して混乱を防ぐ。

**Props定義（変更なし）**:
```typescript
interface NodeRegistrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeAdded: (node: NodeData) => void;
  initialLabel?: string;
}
```

#### B) NodeDetailPanel.tsx の改善

**ファイルパス**: `src/components/nodemap/NodeDetailPanel.tsx`

**改善内容**:

(1) 統計情報の表示改善: 「出現回数」と「頻度」の2列を「インタラクション回数」1列に統合

```typescript
// 現在の grid grid-cols-2 gap-3 を変更
<div className="bg-slate-50 rounded-lg p-3">
  <div className="text-xs text-slate-500">インタラクション回数</div>
  <div className="text-lg font-bold text-slate-900 mt-0.5">
    {node.interactionCount ?? node.frequency ?? 0}回
  </div>
</div>
```

(2) ソースコンテキスト一覧の追加: ノードがどのメッセージ/タスクから蓄積されたかの履歴表示

```typescript
// 新規セクション: sourceContexts が存在する場合のみ表示
{node.sourceContexts.length > 0 && (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1.5">出現元</label>
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {node.sourceContexts.slice(0, 10).map((ctx, i) => (
        <div key={i} className="text-xs text-slate-500 flex items-center gap-2">
          <span>{ctx.sourceType}</span>
          <span className="text-slate-300">|</span>
          <span>{formatDate(ctx.timestamp)}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Props定義（変更なし）**:
```typescript
interface NodeDetailPanelProps {
  node: NodeData | null;
  onClose: () => void;
  onNodeUpdated: (node: NodeData) => void;
  onNodeDeleted: (nodeId: string) => void;
}
```

#### C) MapControls.tsx の改善 - 検索候補クリックでノードフォーカス

**ファイルパス**: `src/components/nodemap/MapControls.tsx`

**改善内容**: 検索候補をクリックしたときに `onNodeClick` コールバックでそのノードを選択・フォーカスする

**Props拡張**:
```typescript
interface MapControlsProps {
  // ... 既存のprops全て ...
  /** 検索候補クリック時にノードを選択する */
  onNodeSelect?: (node: NodeData) => void;
}
```

**UI変更**: 検索結果ドロップダウンの候補をクリック可能にする

```typescript
// 現在の cursor-default を cursor-pointer に変更し onClick を追加
<div
  key={node.id}
  onClick={() => {
    onNodeSelect?.(node);
    setSearchQuery('');
  }}
  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-blue-50 cursor-pointer"
>
```

**page.tsx 側の統合**:
```typescript
// MapControls に onNodeSelect を渡す
<MapControls
  // ... 既存のprops ...
  onNodeSelect={handleNodeClick}
/>
```

### 1.3 API拡張仕様

#### POST /api/nodes の拡張（ドメイン/フィールド対応）

**変更箇所**: `src/app/api/nodes/route.ts`

**リクエストボディ拡張**:
```typescript
{
  label: string;       // 必須
  type: NodeType;      // 必須
  sourceId?: string;   // デフォルト: 'manual'
  direction?: string;  // デフォルト: 'self'
  domainId?: string;   // 新規: ドメインID
  fieldId?: string;    // 新規: フィールドID
}
```

**処理フロー**:
1. 既存の `upsertNode` でノードを登録
2. `domainId` または `fieldId` が指定されている場合、Supabase の `user_nodes` テーブルの `domain_id`/`field_id` を更新
3. レスポンスに更新後のノードデータを返す

**認証**: `getServerUserId()` による認証は既存のまま維持

### 1.4 サービス層拡張

#### NodeService.updateNodeClassification（新規メソッド）

```typescript
/**
 * ノードのドメイン・フィールド分類を更新する
 */
static async updateNodeClassification(
  nodeId: string,
  userId: string,
  classification: { domainId?: string; fieldId?: string }
): Promise<NodeData | null>
```

**処理**:
1. Supabase が有効な場合: `user_nodes` テーブルの `domain_id`/`field_id` を更新
2. デモモード: `nodesStore` のインメモリデータを更新
3. 所有者チェック: `userId` が一致するノードのみ更新可能

### 1.5 型定義の整合性修正

**変更箇所**: `src/lib/types.ts`

以下の型を追加して `nodeClient.service.ts` との整合性を確保する:

```typescript
// Phase 16: 能動的インタラクションのトリガー種別
export type NodeInteractionTrigger =
  | 'reply'
  | 'task_link'
  | 'ai_conversation'
  | 'seed'
  | 'manual_mark';
```

`NodeSourceContext` インターフェースに `trigger` フィールドを追加:
```typescript
export interface NodeSourceContext {
  sourceType: 'message' | 'task_conversation' | 'task_ideation' | 'task_result';
  sourceId: string;
  direction: 'received' | 'sent' | 'self';
  trigger?: NodeInteractionTrigger; // Phase 16: トリガー種別
  phase?: TaskPhase;
  timestamp: string;
}
```

`NodeData` インターフェースに `interactionCount` フィールドを追加:
```typescript
export interface NodeData {
  // ... 既存フィールド ...
  interactionCount?: number; // Phase 16: 能動的インタラクション回数
}
```

`NodeFilter` インターフェースに `minInteractionCount` フィールドを追加:
```typescript
export interface NodeFilter {
  // ... 既存フィールド ...
  minInteractionCount?: number;
}
```

---

## 2. 会話ログ構造化

### 2.1 現状分析

#### 現在の会話表示フロー
1. **受信箱 (Inbox)**: `useMessages` フックで `/api/messages` から全メッセージを取得 → `MessageGroup` にグループ化 → 一覧表示
2. **メッセージ詳細**: `MessageDetail.tsx` でメッセージ本文・リアクション・返信フォームを表示
3. **スレッド表示**: `ThreadView.tsx` でスレッド内メッセージをチャット形式で表示（日付区切り・時間差表示・折りたたみ機能付き）
4. **会話サマリー**: `ConversationSummary.tsx` でスレッド上部に折りたたみ可能な要約パネルを表示（AI要約生成ボタン、参加者リスト、メッセージ数、期間）
5. **会話メタデータ**: `ConversationMeta.tsx` でチャネル、参加者、メッセージ数、期間、最終やり取り等を表示

#### 既存コンポーネントの状態

| コンポーネント | ファイルパス | 状態 |
|---|---|---|
| `ConversationSummary` | `src/components/inbox/ConversationSummary.tsx` | 実装済み（折りたたみ可能なAI要約パネル） |
| `ConversationMeta` | `src/components/inbox/ConversationMeta.tsx` | 実装済み（会話統計情報） |
| `ThreadView` | `src/components/inbox/ThreadView.tsx` | 実装済み（日付区切り・時間差表示・折りたたみ） |
| `MessageDetail` | `src/components/inbox/MessageDetail.tsx` | 実装済み（上記3コンポーネントを統合済み） |

#### 問題点・改善対象
1. **ConversationSummary の要約キャッシュがない**: 毎回パネルを開くたびにAI要約を生成する必要がある。一度生成した要約はローカル state にのみ保持され、ページ遷移で消える
2. **ConversationMeta の情報が限定的**: 返信速度（平均応答時間）やアクティブ時間帯の分析がない
3. **ThreadView の検索機能がない**: 長いスレッド内で特定のメッセージを探す方法がない
4. **メッセージ間のコンテキストリンクがない**: あるスレッドで話題になったキーワードが思考マップのノードとどう関連するかが見えない
5. **ConversationSummary と ConversationMeta の表示位置**: ConversationSummary はメッセージ詳細内（`mx-6 mt-3`）に配置されているが、ConversationMeta との視覚的な整合性が弱い

### 2.2 既存コンポーネント改善仕様

#### A) ConversationSummary.tsx の改善 - 要約キャッシュ機能

**ファイルパス**: `src/components/inbox/ConversationSummary.tsx`

**改善内容**:

(1) ブラウザ内キャッシュの導入: 生成した要約をセッション内にキャッシュする

```typescript
// モジュールレベルのキャッシュ（useMessages.ts と同じパターン）
const summaryCache = new Map<string, { summary: string; timestamp: number }>();
const SUMMARY_CACHE_TTL = 10 * 60 * 1000; // 10分
```

(2) コンポーネント初期化時にキャッシュを確認し、存在すればAI要約を即表示する

```typescript
// useEffect でキャッシュチェック
useEffect(() => {
  const cacheKey = getCacheKey(group, message);
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
    setSummary(cached.summary);
  }
}, [group, message]);
```

(3) 要約生成成功時にキャッシュに保存

```typescript
// handleGenerateSummary 内
if (data.success && data.data?.summary) {
  setSummary(data.data.summary);
  summaryCache.set(cacheKey, {
    summary: data.data.summary,
    timestamp: Date.now(),
  });
}
```

**Props定義（変更なし）**:
```typescript
interface ConversationSummaryProps {
  group?: MessageGroup | null;
  message?: UnifiedMessage | null;
  threadMessages?: ThreadMessage[];
}
```

#### B) ConversationMeta.tsx の改善 - 応答時間分析の追加

**ファイルパス**: `src/components/inbox/ConversationMeta.tsx`

**改善内容**: メタデータに「平均応答時間」と「最速応答」を追加

**ConversationMetaData の拡張**:
```typescript
interface ConversationMetaData {
  // ... 既存フィールド ...
  avgResponseTime?: string;   // 新規: 平均応答時間（例: "約15分"）
  fastestResponse?: string;   // 新規: 最速応答時間
}
```

**計算ロジック**: 自分のメッセージと相手のメッセージの交互パターンから応答時間を算出

```typescript
function computeResponseTimes(messages: Array<{ timestamp: string; isOwn: boolean }>):
  { avg: string; fastest: string } | null {
  const responses: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].isOwn !== messages[i - 1].isOwn) {
      const diff = new Date(messages[i].timestamp).getTime()
                 - new Date(messages[i - 1].timestamp).getTime();
      if (diff > 0) responses.push(diff);
    }
  }
  if (responses.length === 0) return null;

  const avg = responses.reduce((a, b) => a + b, 0) / responses.length;
  const fastest = Math.min(...responses);
  return {
    avg: formatDuration(avg),
    fastest: formatDuration(fastest),
  };
}
```

**UI追加**:
```typescript
{meta.avgResponseTime && (
  <MetaItem label="平均応答時間" value={meta.avgResponseTime} />
)}
```

**Props定義（変更なし）**:
```typescript
interface ConversationMetaProps {
  group?: MessageGroup | null;
  message?: UnifiedMessage | null;
}
```

#### C) ThreadView.tsx の改善 - スレッド内検索機能

**ファイルパス**: `src/components/inbox/ThreadView.tsx`

**改善内容**: スレッドヘッダーに検索バーを追加し、入力に応じてメッセージをハイライトフィルタする

**ThreadViewProps の拡張**:
```typescript
interface ThreadViewProps {
  messages: ThreadMessage[];
  collapseThreshold?: number;
  /** スレッド内検索を有効にする（デフォルト: true、メッセージ5件以上で表示） */
  enableSearch?: boolean;
}
```

**UI追加**: ヘッダー部分に検索入力を追加

```typescript
// 新規 state
const [searchQuery, setSearchQuery] = useState('');

// ヘッダー内に検索バーを追加（メッセージ5件以上の場合のみ）
{enableSearch !== false && messages.length >= 5 && (
  <div className="px-6 py-2 border-b border-slate-100">
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="スレッド内を検索..."
      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  </div>
)}
```

**ハイライトロジック**: `MessageBubble` にハイライト対応を追加

```typescript
// MessageBubble に searchQuery prop を追加
function MessageBubble({
  message,
  highlightQuery,
}: {
  message: ThreadMessage;
  highlightQuery?: string;
}) {
  // body内のクエリ文字列をハイライト表示
  const renderBody = () => {
    if (!highlightQuery) return message.body;
    // 文字列分割 + <mark> でハイライト
  };
}
```

#### D) 新規コンポーネント: ConversationNodeLinks.tsx - ノードリンク表示

**ファイルパス**: `src/components/inbox/ConversationNodeLinks.tsx`

**責務**: メッセージ/スレッドに含まれるキーワードのうち、思考マップにノードとして存在するものをタグ表示する。クリックで思考マップの該当ノードに遷移できる。

**Props定義**:
```typescript
interface ConversationNodeLinksProps {
  /** スレッド内の全メッセージのbodyから抽出するノードリスト */
  relatedNodes: NodeData[];
  /** ノードクリック時（思考マップへの遷移） */
  onNodeClick?: (node: NodeData) => void;
}
```

**UI仕様**:
- `ConversationMeta` の下部に配置
- 関連ノードをタグ形式で横並び表示（タイプ別色分け: keyword=青、person=琥珀、project=緑）
- 各タグクリックで `/nodemap?highlight=<nodeId>` に遷移
- ノードが0件の場合は非表示

```typescript
export default function ConversationNodeLinks({
  relatedNodes,
  onNodeClick,
}: ConversationNodeLinksProps) {
  if (relatedNodes.length === 0) return null;

  return (
    <div className="px-6 py-2 border-t border-slate-100">
      <span className="text-[11px] font-semibold text-slate-500 mr-2">
        関連ノード:
      </span>
      <div className="inline-flex flex-wrap gap-1 mt-1">
        {relatedNodes.slice(0, 10).map((node) => (
          <button
            key={node.id}
            onClick={() => onNodeClick?.(node)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors',
              node.type === 'keyword' ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' :
              node.type === 'person' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' :
              'bg-green-50 text-green-700 hover:bg-green-100'
            )}
          >
            {node.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**データ取得**: `MessageDetail.tsx` 側で、表示中のメッセージの `body` テキストを用いて `/api/nodes?q=<keyword>` で関連ノードを検索するか、既にクライアント側にあるノードデータとマッチングする。

### 2.3 既存コンポーネント変更箇所

#### MessageDetail.tsx への統合ポイント

**ファイルパス**: `src/components/inbox/MessageDetail.tsx`

`MessageDetail.tsx` は既に以下を統合済み:
- `ConversationSummary` (line 13 でインポート)
- `ConversationMeta` (line 14 でインポート)
- `ThreadView` (line 15 でインポート)

**新規追加ポイント**:

(1) `ConversationNodeLinks` コンポーネントの追加

```typescript
// インポート追加
import ConversationNodeLinks from '@/components/inbox/ConversationNodeLinks';

// ConversationMeta の下に配置
<ConversationMeta group={selectedGroup} message={selectedMessage} />
<ConversationNodeLinks
  relatedNodes={relatedNodes}
  onNodeClick={(node) => router.push(`/nodemap?highlight=${node.id}`)}
/>
```

(2) 関連ノードの取得ロジック: 表示中メッセージのbodyからキーワードを抽出し、ノード一覧とマッチングする簡易ロジック

```typescript
// メッセージ表示時に関連ノードを検索
const [relatedNodes, setRelatedNodes] = useState<NodeData[]>([]);

useEffect(() => {
  if (!selectedMessage && !selectedGroup) {
    setRelatedNodes([]);
    return;
  }
  const body = selectedMessage?.body || selectedGroup?.latestMessage.body || '';
  if (!body) return;

  // 簡易マッチング: /api/nodes で全ノードを取得し、body内に含まれるラベルを抽出
  fetch('/api/nodes')
    .then((res) => res.json())
    .then((json) => {
      if (json.success && json.data) {
        const matches = json.data.filter((n: NodeData) =>
          body.includes(n.label) && n.label.length >= 2
        );
        setRelatedNodes(matches.slice(0, 10));
      }
    })
    .catch(() => {});
}, [selectedMessage, selectedGroup]);
```

---

## 3. 実装順序

依存関係を考慮した段階的実装順序:

### Step 1: 型定義の修正（前提条件）
- `src/lib/types.ts` に `NodeInteractionTrigger`、`interactionCount`、`trigger` を追加
- 全コンパイルエラーが解消されることを確認

### Step 2: ノード登録リデザイン
1. `NodeRegistrationDialog.tsx` の改善（ドメイン/フィールド送信、メモ除去）
2. `POST /api/nodes` のリクエスト処理拡張（domainId/fieldId 受け取り）
3. `NodeService.updateNodeClassification()` の追加
4. `NodeDetailPanel.tsx` の統計表示改善（2列→1列統合、ソースコンテキスト表示）
5. `MapControls.tsx` に `onNodeSelect` 追加、検索候補クリックでノードフォーカス
6. `page.tsx` に `onNodeSelect` の配線

### Step 3: 会話ログ構造化
1. `ConversationSummary.tsx` の要約キャッシュ機能追加
2. `ConversationMeta.tsx` の応答時間分析追加
3. `ThreadView.tsx` のスレッド内検索機能追加
4. `ConversationNodeLinks.tsx` の新規作成
5. `MessageDetail.tsx` への `ConversationNodeLinks` 統合

### Step 4: 動作確認
- 手動登録フロー（ドメイン/フィールド選択 → 登録 → ノードに反映確認）
- 編集フロー（ラベル/タイプ/理解度変更 → 保存 → グラフ反映確認）
- 削除フロー（確認ダイアログ → 削除 → グラフから消失確認）
- 検索候補クリック → ノード詳細パネル表示確認
- 会話サマリーキャッシュの動作確認
- スレッド内検索のハイライト確認
- 関連ノードリンクの表示と遷移確認

---

## 4. ファイル変更一覧

### 修正ファイル（既存）

| ファイルパス | 変更内容 |
|---|---|
| `src/lib/types.ts` | `NodeInteractionTrigger` 型追加、`NodeSourceContext.trigger` 追加、`NodeData.interactionCount` 追加、`NodeFilter.minInteractionCount` 追加 |
| `src/components/nodemap/NodeRegistrationDialog.tsx` | ドメイン/フィールドをAPI送信に追加、メモフィールド除去 |
| `src/components/nodemap/NodeDetailPanel.tsx` | 統計表示を1列に統合、ソースコンテキスト表示追加 |
| `src/components/nodemap/MapControls.tsx` | `onNodeSelect` prop追加、検索候補クリックイベント追加 |
| `src/app/nodemap/page.tsx` | `MapControls` に `onNodeSelect={handleNodeClick}` を配線 |
| `src/app/api/nodes/route.ts` | POST の `domainId`/`fieldId` 対応 |
| `src/services/nodemap/nodeClient.service.ts` | `updateNodeClassification()` メソッド追加 |
| `src/components/inbox/ConversationSummary.tsx` | 要約キャッシュ機能（モジュールレベルMap + TTL） |
| `src/components/inbox/ConversationMeta.tsx` | 応答時間分析（`avgResponseTime`/`fastestResponse`） |
| `src/components/inbox/ThreadView.tsx` | スレッド内検索バー、メッセージハイライト |
| `src/components/inbox/MessageDetail.tsx` | `ConversationNodeLinks` 統合、関連ノード取得ロジック |

### 新規作成ファイル

| ファイルパス | 内容 |
|---|---|
| `src/components/inbox/ConversationNodeLinks.tsx` | メッセージ内キーワードと思考マップノードの関連リンク表示 |

### 変更なし（参照のみ）

| ファイルパス | 備考 |
|---|---|
| `src/hooks/useNodeMap.ts` | 変更不要（既に `refreshData` がノード追加/更新/削除後の再読み込みに対応） |
| `src/hooks/useMessages.ts` | 変更不要 |
| `src/components/nodemap/NetworkGraph.tsx` | 変更不要（`onNodeClick` 既に対応済み） |
| `src/lib/serverAuth.ts` | 変更不要（認証パターン既存を踏襲） |
