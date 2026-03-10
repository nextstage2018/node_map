# 引き継ぎ書：検討ツリー・タイムライン強化（v3.4）

## 前提：完了済み作業（v3.3）

v3.3のプロジェクト中心リストラクチャリングは全Phase完了・デプロイ済み。

### 直近の完了タスク
- **関連資料タブ全面改修**: ファイルアップロード、書類種別10種プリセット、命名規則（YYYY-MM-DD_種別_名前）、タグ自動付与（種別・MS・タスク・ジョブ・登録者名）、サブタブ（登録資料/受領資料）、編集・削除機能
- **バグ修正**: web_view_linkカラム名修正、日付二重付与解消、フォルダ解決ロジック修正
- **MeetGeek Webhook → Drive保存**: PJ配下「会議議事録」フォルダに年月別で自動保存（実装済み）
- **ガイドページ更新**: 関連資料・MeetGeek連携・Driveフォルダの説明追加
- **重複ファイル整理**: macOSコピー（* 2.tsx等）27件削除、.gitignoreに再発防止ルール追加

---

## 今回の着手内容：検討ツリー・タイムラインの強化

### 背景・課題

現在のAI解析の限界を調査した結果、以下が判明：

| 項目 | 現状 | 問題 |
|---|---|---|
| **会議録AI解析** | その会議のテキストだけをAIに渡す | 過去の文脈を知らない |
| **チャネルメッセージ同期** | 過去24時間分のメッセージだけ | 25h以上前は忘れる |
| **ノード重複判定** | 既存ツリーのタイトル類似度（65%以上）でマージ | 「方針変更」として認識はしない |
| **未確定事項の追跡** | 仕組みなし | 会議で触れなければ忘れ去られる |
| **決定変更の検知** | ノード名の類似度で間接的に検知のみ | 明示的な変更検知なし |
| **タスク進捗との連携** | タイムラインとタスクは独立 | 会議で触れないと反映なし |
| **定期確認項目** | 仕組みなし | アジェンダ的な機能がない |

**核心の問題**: AIは「都度の会話データで得られた範囲」しか見ていないため、過去の残課題・未着手内容・決定変更がスルーされる。

### 合意済みの設計方針

**3つの常設データ（プロジェクト単位）を新設し、AI解析のコンテキストに注入する**

```
① open_issues（未確定事項トラッカー）
  - 「まだ決まっていないこと」の一覧
  - 会議やメッセージで話題に出たが結論が出なかった事項を追跡
  - 解決したらclosedに
  - 滞留日数で優先度自動算出

② decision_log（意思決定ログ）
  - 「決まったこと」の変遷記録
  - 最初の決定 → 変更 → 再変更…と履歴をたどれる
  - 検討ツリーノードと連動

③ meeting_agenda（会議アジェンダ）
  - 次回会議で話すべきことを自動生成
  - ①の未確定事項 + ②の確認事項 + タスク進捗から構成
  - 会議前日に準備完了状態にする狙い
```

### AI解析の改修イメージ

```
【現在】
AI入力 = 会議テキストのみ

【改修後】
AI入力 = 会議テキスト
       ＋ 未確定事項リスト（①から、最大20件）
       ＋ 直近の決定事項（②から、最大10件）
       ＋ 進行中タスク一覧（既存tasksから）

→ AIが「この未確定事項は今回の会議で解決された」等を判定可能に
```

### 検討ツリーのカードUI拡張

既存のステータス（有効/選択肢/決定/議題）に加えて、以下を各ノードに表示：
- **進行状況**: 今どこまで進んでいるか
- **課題**: 何がブロッカーか（①未確定事項から自動表示）
- **決定履歴**: いつ何が変わったか（②決定ログから自動表示）
- **停止理由**: なぜ止まっているか

### 実装Phase案

| Phase | 内容 |
|---|---|
| Phase 1 | テーブル設計（open_issues, decision_log, meeting_agenda） |
| Phase 2 | AI解析の改修（①②をコンテキスト注入） |
| Phase 3 | 検討ツリーのカードUI拡張（進行状況・課題・決定履歴の表示） |
| Phase 4 | アジェンダ自動生成（Cron or 秘書コマンド） |

### 追加で検討したいアイデア
- 自動クローズ: ①の未確定事項がAI解析で「解決済み」と判定されたら自動closed
- 優先度自動計算: 滞留日数が長いほどアジェンダ上位に
- メンバー別アジェンダ: 各自の担当タスク進捗＋関連未確定事項を抽出

---

## 現在のデータフロー（参考）

### 会議録経路
```
会議録登録（手動 or MeetGeek Webhook）
  → POST /api/meeting-records/[id]/analyze（AI解析）
    → topics, action_items, milestone_feedback を抽出
    → business_events自動追加
    → knowledge_master_entries自動抽出
    → task_suggestions保存
  → POST /api/decision-trees/generate（ツリー生成）
    → 既存ノードと類似度判定（≥0.65でマージ、<0.65で新規作成）
    → decision_tree_node_history に変更履歴記録
```

### チャネルメッセージ経路
```
毎日01:30 UTC Cron実行
  → 過去24hのSlack/Chatworkメッセージ取得（上限100件）
  → metadata → project_channels でプロジェクト判定
  → AI でトピック抽出（バッチ5件ずつ）
  → 既存ツリーと類似度判定 → マージ or 新規作成
```

### 重複判定ロジック（topicMatcher.service.ts）
- Tier 1: 正規化後の完全一致 → スコア1.0
- Tier 2: 部分文字列含有 → スコア0.80〜0.95
- Tier 3: キーワード重複率 → スコア0.50〜0.80
- 閾値: 0.65以上でマージ推奨

### ハイブリッドソース（v3.0）
- 同じ議題が会議録とチャネル両方から言及 → source_type='hybrid'、confidence_score加重平均で更新

---

## 関連ファイル

| ファイル | 用途 |
|---|---|
| `src/app/api/meeting-records/[id]/analyze/route.ts` | 会議録AI解析 |
| `src/app/api/decision-trees/generate/route.ts` | 検討ツリー生成・ノード作成 |
| `src/app/api/cron/sync-channel-topics/route.ts` | チャネルメッセージ同期Cron |
| `src/services/nodemap/topicMatcher.service.ts` | トピック類似度マッチング |
| `src/services/ai/topicExtractor.service.ts` | チャネルメッセージからのトピック抽出 |
| `src/components/v2/DecisionTreeView.tsx` | 検討ツリーUI |
| `src/components/v2/DecisionTreeNode.tsx` | 検討ツリーノードカード |
| `src/components/v2/NodeDetailPanel.tsx` | ノード詳細パネル（右サイド） |
| `docs/TABLE_SPECS.md` | 全テーブルのCREATE文・制約 |
| `docs/ARCHITECTURE_V2.md` | V2設計書 |

---

## 注意事項
- CLAUDE.mdの「10のルール」を必ず確認してから作業開始
- テーブル操作がある場合はdocs/TABLE_SPECS.mdを確認
- Vercel互換params: `{ params }: { params: Promise<{ id: string }> }`
- サービス層では `const supabase = getServerSupabase() || getSupabase();`
- decision_tree_nodesのparent_node_idで階層構造を表現
- source_type: 'meeting' | 'channel' | 'hybrid'
- confidence_score: 0.0〜1.0
