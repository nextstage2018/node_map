# NodeMap（仮）SSOT - Single Source of Truth

> **このファイルは各フェーズ間の引き継ぎ資料です。**
> 新しい会話を始めるとき、設計書（.docx）とこのファイルをエージェントに渡してください。
> 各フェーズ完了時にエージェントがこのファイルを更新します。

---

## 基本情報

| 項目 | 内容 |
|------|------|
| サービス名 | NodeMap（仮） |
| オーナー | sjinji |
| 開発方法 | v0.dev（デザイン）+ Claude Cowork（実装）|
| リポジトリ | https://github.com/nextstage2018/node_map |
| デプロイ先 | https://node-map-eight.vercel.app |
| ホスティング | Vercel |
| 設計書 | NodeMap_設計書_v2.docx |
| 定型文 | PROMPT_TEMPLATE.md |
| 再定義資料 | NODEMAP_再定義v2_議論まとめ.md |

---

## 現在のステータス

| フェーズ | ステータス | 完了日 | 備考 |
|----------|-----------|--------|------|
| 設計書作成 | ✅ 完了 | 2026-02-18 | v1.0（セクション7追加済み） |
| Phase 1：統合インボックス | ✅ 完了 | 2026-02-18 | デモモード動作確認済み |
| Phase 2：タスクボード + AI会話 | ✅ 完了 | 2026-02-18 | D&D・AI提案・構造化メモ対応済み |
| Phase 3：設定画面 / API接続 ※追加 | ✅ 完了 | 2026-02-18 | 2層構造（admin/個人）で実装 |
| Phase 4：データ収集基盤（設計書Phase 3） | ✅ 完了 | 2026-02-18 | キーワード抽出・ノード蓄積・理解度判定・エッジ/クラスター管理 |
| Phase 5：思考マップUI（設計書Phase 4） | ✅ 完了 | 2026-02-19 | D3.jsネットワークグラフ・段階表示・比較モード |
| **再定義v2：根本整理** | **✅ 完了** | **2026-02-19** | **ノード純化・ナレッジマスタ・ジョブ/タスク分離等** |
| Phase 6：UI統一（配色・アイコン） | ✅ 完了 | 2026-02-19 | 3色システム・SVGアイコン13個・gray→slate全置換 |
| Phase 7：タスクボード改修 | ✅ 完了 | 2026-02-19 | ジョブ/タスク分離・種ボックス・ステータス/タイムライン切り替え |
| Phase 8：ナレッジマスタ基盤 | ✅ 完了 | 2026-02-19 | 3階層分類体系・AI自動分類・管理画面・マップ統合 |
| Phase 9：関係値情報基盤 | ✅ 完了 | 2026-02-19 | コンタクト統合管理・関係属性AI推定・管理画面・マップ統合 |
| Phase 10：思考マップUI改修 | ✅ 完了 | 2026-02-19 | ノードフィルター・本流/支流エッジ・チェックポイント記録・矢印表示 |
| Phase 11：Supabase接続 | ✅ 完了 | 2026-02-19 | 16テーブル作成・全7サービスのDB切り替え・デモモード併存 |
| Phase 12：APIキー準備（前半） | ✅ 完了 | 2026-02-19 | Anthropic API + Gmail(IMAP/SMTP)接続設定・接続検出バグ修正 |
| Phase 12後半：インボックス改善 | ✅ 完了 | 2026-02-20 | メールMIMEパース・Chatwork接続・ページネーション・エラーハンドリング |
| Phase 13：インボックスUX改善 | ✅ 完了 | 2026-02-20 | Gmail引用チェーン会話変換・AI要約・Reply All・キャッシュ・要約スクロール・自動スクロール |

> **注意：** 設計書のPhase 3（データ収集基盤）の前に「設定画面」を追加実装したため、
> 設計書のPhase番号と実装のPhase番号に1つズレがあります。
> 設計書Phase 3 = 実装Phase 4、設計書Phase 4 = 実装Phase 5。
> ※設計書v2でPhase番号を統一予定

---

## ⚠️ 再定義v2（2026-02-19決定）

> Phase 5完了後、実際の思考マップ画面を確認した結果、根本的な見直しを実施。
> 詳細は `NODEMAP_再定義v2_議論まとめ.md` を参照。以下はサマリ。

### 変更点サマリ

**1. ノード（点）の純化**
- 変更前：ノード＝キーワード・人名・案件名が混在
- 変更後：ノード＝キーワード（名詞）のみ。人・案件・タスクはフィルター条件に移行
- 常時表示の原則：全ノードが常に表示。ノード数＝知識保有量

**2. ナレッジマスタ（新規）**
- 組織共通のキーワード階層分類体系
- 第1階層：領域（ドメイン）例：マーケティング、会計、開発
- 第2階層：分野（フィールド）例：SEO、広告運用、フロントエンド
- 第3階層：キーワード（ノードそのもの）
- AIが自動分類。マスタは組織で1つ共有

**3. 関係値情報（新規）**
- チャネル登録：API連携時にユーザーが対象選択→AIが初期値提案
- コンタクトリスト：メール宛先等から自動生成、メインチャネル自動判定
- 関係属性：自社メンバー/クライアント/パートナー（AI推定＋ユーザー確認）

**4. エッジ（線）の再定義 — 本流と支流**
- チェックポイント：AI自動記録＋ユーザー任意ボタン
- 本流：第2階層（分野）レベルでCPをつなぐ。矢印で方向表示
- 支流：第3階層（キーワード）の飛地を細い線で表現

**5. タスクの二分化**
- ジョブ（AI起点）：検知→下書き生成→提案カード→実行/却下。思考マップ対象外
- タスク（人間起点）：種を保存→AI構造化→確定→構想→進行→結果。思考マップ対象
- 種の入口：メッセージから「種にする」or 自由入力 → 種ボックスに集約

**6. 表示切り替え追加**
- ステータス別（未着手/進行中/完了）
- 時間軸別（今日/明日/明後日 or 日付指定）

**7. UI修正**
- 配色：基本3色に限定（例外4色）
- アイコン：Slack/Chatwork/Gmail公式ロゴを全画面で統一

---

## 技術スタック（確定）

| 領域 | 技術 | 確定度 |
|------|------|--------|
| フロントエンド | Next.js 14 (App Router) + React + TypeScript | ✅ 確定 |
| CSS | Tailwind CSS 3 | ✅ 確定 |
| ホスティング | Vercel | ✅ 確定 |
| データベース | Supabase（PostgreSQL） | ✅ 確定（スキーマ作成済・未接続） |
| AI | Anthropic Claude API（claude-opus-4-5） | ✅ 確定（デモモード対応） |
| D&D | @dnd-kit/core + @dnd-kit/sortable | ✅ 確定 |
| グラフ表示 | D3.js（@types/d3） | ✅ 確定 |
| API連携 | Gmail API / Slack API / Chatwork API | ✅ 確定（デモモード対応） |

---

## API連携の準備状況

| サービス | APIキー取得 | 備考 |
|----------|-----------|------|
| Gmail / メール | ✅ 接続済み | IMAP/SMTP。Vercel環境変数に設定済み。MIMEパーサー実装済み |
| Slack | ⬜ 未取得 | Bot Token。設定画面のadmin設定で入力可能 |
| Chatwork | ✅ 接続済み | APIトークン。Vercel環境変数に設定済み。75メッセージ取得確認済み |
| Anthropic | ✅ 接続済み | APIキー。Vercel環境変数に設定済み |
| Supabase | ✅ 接続済み | URL + Anon Key。Vercel連携で自動設定済み |

> Gmail・Chatwork・Anthropic・Supabaseが実接続済み。Slackのみ未接続（Bot Token未取得）。

---

## チェックポイント履歴

### CP1：コンセプト確認
- **結果：** ✅ 承認（修正なし）
- **日付：** 2026-02-18
- **決定事項：** 表の層（集約・補助）と裏の層（思考可視化）の二層構造で進める

### CP6：Phase 1完了確認（統合インボックス）
- **結果：** ✅ 承認
- **日付：** 2026-02-18
- **確認事項：**
  - 3チャネル（Gmail/Slack/Chatwork）の受信メッセージ一覧表示 → OK
  - AI返信下書き生成機能 → OK
  - チャネルフィルタ・検索 → OK
  - スレッド履歴表示 → OK
  - 公式ロゴSVGアイコン・ステータスバッジ → OK

### CP7：Phase 2完了確認（タスクボード + AI会話）
- **結果：** ✅ 承認（複数回の改善フィードバック後）
- **日付：** 2026-02-18
- **確認事項：**
  - カンバンボード（D&D対応）→ OK
  - AI提案カラム（判断材料・却下ボタン付き）→ OK
  - タスク3フェーズ（構想→進行→結果）→ OK
  - 構造化構想メモ（ゴール/主な内容/気になる点/期限日）→ OK
  - 進行フェーズAI補助クイックアクション → OK
  - 結果フェーズ自動要約 → OK
  - 優先度テキストバッジ（高/中/低）→ OK

### CP追加：Phase 3完了確認（設定画面）
- **結果：** ✅ 承認
- **日付：** 2026-02-18
- **確認事項：**
  - 設定画面2層構造（管理者設定 / 個人設定）→ OK
  - admin: API基盤設定（Gmail/Slack/Chatwork/OpenAI/Supabase）→ OK
  - admin: 接続テスト機能 → OK
  - 個人: チャネルOAuth認証カード → OK
  - 個人: プロフィール設定 → OK
  - 個人: 表示・通知設定 → OK

### CP8：Phase 4完了確認（データ収集基盤）
- **結果：** ✅ 承認
- **日付：** 2026-02-18
- **確認事項：**
  - キーワード抽出エンジン（AI/デモモード両対応）→ 実装済み
  - ノード（点）蓄積・頻出度カウント → 実装済み
  - 理解度レベル自動判定（認知/理解/習熟）→ 実装済み
  - エッジ（線）記録（共起/順序/因果の3タイプ）→ 実装済み
  - クラスター（面）管理（構想面/結果面/差分計算）→ 実装済み
  - 既存フローへの統合（メッセージ取得・タスク会話）→ 実装済み

### CP9：Phase 5完了確認（思考マップUI）
- **結果：** ✅ 承認
- **日付：** 2026-02-19
- **確認事項：**
  - D3.jsネットワークグラフ表示（ノード・エッジ・クラスター）→ 実装済み
  - タスク選択→構想・経路・結果の段階表示 → 実装済み
  - ノード理解度別サイズ/色（認知=グレー小、理解=青中、習熟=緑大）→ 実装済み
  - ノードタイプ別形状（キーワード=丸、人物=ダイヤ、プロジェクト=四角）→ 実装済み
  - ユーザー切替機能（4デモユーザー）→ 実装済み
  - 比較モード（2人並列表示）→ 実装済み
  - 統計パネル（種別分布・理解度分布・クラスター差分）→ 実装済み
  - ドラッグ・ズーム・ツールチップ → 実装済み

### CP10：再定義v2確認
- **結果：** ✅ 承認
- **日付：** 2026-02-19
- **確認事項：**
  - ノード純化（キーワードのみ。人・案件・タスクはフィルターに）→ 合意
  - ナレッジマスタ（組織共通3階層分類、AI自動分類）→ 合意
  - 関係値情報（チャネル登録、コンタクトリスト、関係属性）→ 合意
  - エッジ再定義（本流・支流、チェックポイント記録）→ 合意
  - タスク二分化（ジョブ＝AI起点 / タスク＝人間起点）→ 合意
  - 種ボックス（入口複数、出口1つ）→ 合意
  - 表示切り替え（ステータス別 + 時間軸別）→ 合意
  - UI修正（配色3色統一、アイコン公式ロゴ統一）→ 合意

---

## 決定事項ログ

| 日付 | 決定内容 | 理由 |
|------|---------|------|
| 2026-02-18 | サービス名は「NodeMap」（仮） | 点・線・面のコンセプトに合致 |
| 2026-02-18 | 初期ソースはメール・Slack・Chatworkの3つ | 将来LINE・メッセンジャー等に拡張 |
| 2026-02-18 | チーム間でタスク・ノードマップを覗き合える設計 | 上司→部下の指導、部下→上司の学び、同僚間の相互学習 |
| 2026-02-18 | まず自社利用 → ゆくゆく外販（SaaS） | 自社で検証してから展開 |
| 2026-02-18 | 開発はGitHub + Vercel構成 | 非エンジニアがv0.dev + Claude Coworkで構築 |
| 2026-02-18 | SSOTはMarkdownでローカル保持 | 各フェーズ間の引き継ぎに使用 |
| 2026-02-18 | フォルダ構成・命名規則・格納ルールを設計書セクション7に定義 | ファイル無秩序化を防止 |
| 2026-02-18 | 定型文テンプレート（PROMPT_TEMPLATE.md）を運用 | 毎回の個別指示を不要にする |
| 2026-02-18 | デモモードパターン採用 | API未接続時もUIを確認可能に |
| 2026-02-18 | @dnd-kit採用 | 軽量で柔軟なD&Dライブラリ |
| 2026-02-18 | タスク3フェーズモデル | 構想→進行→結果で思考プロセスを構造化 |
| 2026-02-18 | AI提案を縦カラム化 | 横バーより多数の提案を表示可能 |
| 2026-02-18 | 構想メモの構造化フォーム | 一定品質のメモを担保（ゴール/内容/懸念/期限） |
| 2026-02-18 | 優先度をテキストバッジに | 絵文字(🔴🟡🟢)より明確。高/中/低の文字表記 |
| 2026-02-18 | 判断材料の充実化 | 誰から/いつ/何のメッセージか分からないとタスク化判断不可 |
| 2026-02-18 | 設計書Phase 3の前に設定画面を追加 | 実運用にはAPI接続設定が必要 |
| 2026-02-18 | 設定を2層構造に | admin(API基盤)と個人(OAuth認証)は分離すべき。admin未設定時は個人認証不可 |
| 2026-02-18 | キーワード抽出はAI（gpt-4o-mini）+ルールベースのハイブリッド | API未接続時はルールベース（カタカナ・漢字・人名パターン）で動作 |
| 2026-02-18 | 理解度3段階の判定ロジック確定 | received only=認知、sent/self=理解、sent×2+received=習熟 |
| 2026-02-18 | エッジは3タイプ（共起/順序/因果） | 共起=同時出現、順序=進行フェーズの経路、因果=AI文脈解析 |
| 2026-02-18 | クラスターは構想面と結果面の2種類 | 差分で「思考の広がり」を計測。discoveredOnPath=経路上の発見 |
| 2026-02-18 | 既存フローに非同期統合 | メッセージ取得・タスク会話時にバックグラウンドでノード蓄積。エラーは無視 |
| 2026-02-19 | AI基盤をOpenAIからAnthropic Claudeに全面移行 | ユーザー指示。claude-opus-4-5-20251101を使用。openaiパッケージ削除、@anthropic-ai/sdk採用 |
| 2026-02-19 | グラフ描画ライブラリはD3.jsに確定 | React Flowより低レベル制御が可能 |
| 2026-02-19 | ノード形状を種別で区別 | キーワード=丸、人物=ダイヤモンド、プロジェクト=四角 |
| 2026-02-19 | 理解度をサイズ＋色で表現 | 認知=小グレー、理解=中青、習熟=大緑 |
| 2026-02-19 | 比較モードは2人並列表示 | 設計書の要件通り |
| **2026-02-19** | **ノードをキーワードのみに純化** | **人・案件・タスクはフィルター条件に分離。マップの役割を明確化** |
| **2026-02-19** | **ナレッジマスタを組織共通で1つ作成** | **個人ごとの分類では比較不能。キーワードの階層は組織共通であるべき** |
| **2026-02-19** | **AIが自動分類（3階層：領域/分野/キーワード）** | **ユーザー負荷を最小化。自動分類で秩序を作る** |
| **2026-02-19** | **関係値情報の定義を追加** | **チャネル属性・コンタクトリスト・関係属性（自社/クライアント/パートナー）** |
| **2026-02-19** | **エッジを「本流・支流」に再定義** | **思考の「つながり」ではなく「流れ」を表現。方向（矢印）が重要** |
| **2026-02-19** | **チェックポイント記録方式を採用** | **AI自動記録＋ユーザー任意ボタン。構想〜結果間のブラックボックスを解消** |
| **2026-02-19** | **本流は第2階層、支流は第3階層で描画** | **処理負荷と可読性のバランス** |
| **2026-02-19** | **タスクをジョブとタスクに二分化** | **ジョブ＝AI起点（定型）、タスク＝人間起点（思考型）。思考マップはタスクのみ対象** |
| **2026-02-19** | **種ボックスの導入** | **入口複数（メッセージから/自由入力）→ 種ボックスに集約 → AI構造化 → 確定** |
| **2026-02-19** | **表示切り替え追加（ステータス別＋時間軸別）** | **「何が残っているか」と「今日何やるか」は別の視点** |
| **2026-02-19** | **配色を基本3色に限定** | **カラフルすぎて情報優先度が不明。統一化で可読性向上** |
| **2026-02-19** | **アイコンを公式ロゴに全画面統一** | **インボックス以外で別アイコンが使われていた問題を解消** |
| **2026-02-19** | **DB処理速度対策が必要** | **インデックス設計（user_id/キーワード/案件ID/理解度）。将来はキャッシュ層** |
| **2026-02-19** | **ローカルフォルダ運用を導入** | **current/（最新版）+ history/（差分保存）。ローカルが正、GitHubはコピー** |
| 2026-02-19 | Phase 6: UI配色を3色システムに統一 | Primary=#2563EB, Neutral=slate, Dark=#1E293B + 例外4色（success/warning/danger/primary-light） |
| 2026-02-19 | 絵文字アイコンをSVG13個に全面置換 | public/icons/に格納。サービス2個+フェーズ3個+メモ4個+ナビ4個 |
| 2026-02-19 | Tailwindのgray系をslate系に全統一 | 20ファイル244箇所を一括置換。ブルー系と調和するslateに統一 |
| 2026-02-19 | NetworkGraph D3色をCSS変数準拠に | LEVEL_COLORをnm-primary/nm-success/nm-text-mutedに合わせて修正 |
| 2026-02-19 | Phase 7: ジョブ/タスクを型レベルで分離 | Job型（AI定型）とTask型（思考型）を独立。ジョブは思考マップ対象外 |
| 2026-02-19 | 種ボックスを導入 | Seed型でアイデアを保留→AI構造化→タスク化の3ステップフロー |
| 2026-02-19 | タブ切り替え（タスク/ジョブ） | BOARD_TAB_CONFIGでUI分離。ジョブ側は詳細パネル非表示 |
| 2026-02-19 | ステータス/タイムラインのビュー切り替え | VIEW_MODE_CONFIGで2モード。タイムラインは今日/明日/明後日＋期限超過/未設定 |
| 2026-02-19 | ジョブのデモデータ3件・種のデモデータ2件を追加 | TaskServiceに統合。APIルートは/api/jobs, /api/seeds |
| 2026-02-19 | Phase 8: ナレッジマスタ3階層体系を導入 | 領域(5)→分野(17)→マスタキーワード(30)のデモデータ。KNOWLEDGE_DOMAIN_CONFIGで定数定義 |
| 2026-02-19 | knowledgeMaster.service.tsを新規作成 | getDomains/getFields/getMasterEntries/classifyKeyword/linkNodeToMaster/getHierarchy |
| 2026-02-19 | processText()にAI自動分類を統合 | キーワード抽出後にclassifyKeyword()→linkNodeToMaster()を自動実行。NodeDataにdomainId/fieldIdをキャッシュ |
| 2026-02-19 | /master管理画面を新規作成 | ツリー表示（DomainTree）・統計カード（MasterStats）・分類バッジ（ClassificationBadge）・検索機能 |
| 2026-02-19 | 思考マップに領域フィルター・ドメイン色分けを追加 | MapControlsに領域ボタン、NetworkGraphにcolorByDomain、MapStatsに領域分布表示 |
| 2026-02-19 | Phase 9: コンタクト統合管理を導入 | 8名のデモコンタクト（Email/Slack/Chatwork跨ぎ）。関係属性3種（自社/クライアント/パートナー） |
| 2026-02-19 | contactPerson.service.tsを新規作成 | getContacts/getContactById/updateRelationship/extractFromMessages/predictRelationship/getStats |
| 2026-02-19 | /contacts管理画面を新規作成 | 統計カード(ContactStats)・一覧(ContactList)・個別カード(ContactCard)・関係バッジ(RelationshipBadge)・検索・フィルター |
| 2026-02-19 | 思考マップに関係属性色・統計を追加 | 人物ノードに関係色（青=自社/橙=クライアント/紫=パートナー）、MapStatsに関係属性分布、ツールチップに関係情報 |
| 2026-02-19 | NodeDataにrelationshipType/contactIdを追加 | 人物ノードとコンタクトのリンク。デモデータで7ノード紐付け済み |
| 2026-02-19 | Phase 10: エッジに本流/支流フロータイプを導入 | flowType='main'(同分野,太い実線+矢印)/flowType='tributary'(異分野,細い破線)。FLOW_TYPE_CONFIGで定義 |
| 2026-02-19 | エッジに方向性(direction)を導入 | forward/backward/bidirectional。SVG arrowhead markerで矢印表示 |
| 2026-02-19 | チェックポイントサービスを新規作成 | checkpoint.service.ts + /api/checkpoints。デモ6件。手動記録ボタン+自動記録対応 |
| 2026-02-19 | ノード表示フィルターを導入 | NodeFilterMode: keyword_only(デフォルト)/with_person/with_project/all。再定義v2の純化原則に基づく |
| 2026-02-19 | filteredDataロジックをfilterMode+領域フィルターの二重適用に変更 | エッジもフィルタリング後のノードIDに基づいて絞り込み |
| 2026-02-19 | Phase 11: Supabase接続を実装 | 16テーブル作成（004_phase7_10_schema.sql追加）。全7サービスにSupabase切り替え対応 |
| 2026-02-19 | supabase.tsにisSupabaseConfigured()/getSupabase()を追加 | Supabase未設定時はnullを返し、デモモードにフォールバック |
| 2026-02-19 | 全サービスに「Supabase有→DB / 無→デモデータ」パターンを適用 | taskClient, nodeClient, edgeClient, clusterClient, checkpoint, knowledgeMaster, contactPerson |
| 2026-02-19 | Vercel+Supabase連携で環境変数自動設定済み | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY |
| 2026-02-19 | Phase 12前半: Anthropic APIキーをVercelに設定 | ANTHROPIC_API_KEY。AI返信下書き・タスク会話・キーワード抽出が実データで動作可能に |
| 2026-02-19 | Phase 12前半: Gmail(IMAP/SMTP)をVercelに設定 | EMAIL_USER, EMAIL_PASSWORD（アプリパスワード）, EMAIL_HOST, SMTP_HOST |
| 2026-02-19 | 接続ステータス検出バグ修正 | settings/route.tsとtest/route.tsがGMAIL_CLIENT_IDのみ参照→EMAIL_USERも参照するよう修正 |
| 2026-02-20 | Chatwork APIトークンをVercelに設定 | CHATWORK_API_TOKEN。社内グループ等75メッセージ取得確認済み |
| 2026-02-20 | メールMIMEパーサーを実装 | parseEmailBody/decodeEmailContent/extractFromMultipart/decodeQuotedPrintable。multipart解析・base64/QP・HTML除去 |
| 2026-02-20 | quoted-printable UTF-8マルチバイト対応 | TextDecoderを使用したバイト列→UTF-8変換。日本語メール本文が正しく表示されるようになった |
| 2026-02-20 | MIMEヘッダー折り返し展開(unfoldHeaders)を追加 | RFC 2822準拠。Content-Type行が折り返されるケースに対応 |
| 2026-02-20 | multipart boundary検出フォールバックを追加 | ヘッダーからboundary取得に失敗した場合、本文内のboundaryパターンから推測 |
| 2026-02-20 | IMAP pagination対応 | fetchEmails(limit,page)でシーケンス番号による範囲取得。MessageListに「過去のメッセージを読み込む」ボタン追加 |
| 2026-02-20 | Chatworkエラーハンドリング改善 | 204ステータス正常処理、エラーログ強化、ルームスキャン数10→15拡大 |
| 2026-02-20 | GitHub Personal Access Token再生成 | nodemap-cowork-deploy。node_mapリポへのRead/Write権限。有効期限2026-03-22 |
| 2026-02-20 | Gmail引用チェーンを会話バブルに変換 | parseQuoteChain()でネストされた「>」引用を個別メッセージにパース。24通の会話を確認済み |
| 2026-02-20 | AI要約（タイムライン形式）を導入 | Claude Sonnet（claude-sonnet-4-5-20250929）で「・日付 - 要約」形式のスレッド要約を自動生成 |
| 2026-02-20 | Reply All機能を実装 | To=送信者、CC=全受信者からの自動設定。「全員に返信」/「送信者のみ」トグル |
| 2026-02-20 | 2層キャッシュ（サーバー+クライアント）を導入 | サーバー: MemoryCache(TTL付き)、クライアント: SWR(stale-while-revalidate)パターン。AI要約はバックグラウンド事前生成 |
| 2026-02-20 | 日本語日付パーサーを追加 | parseDateStrToISO()で「2026年1月19日(月) 16:36」「2026/1/19 16:36」→ISO変換 |
| 2026-02-20 | AI要約エリアをスクロール可能に | max-h-[100px]+overflow-y-auto。直近3〜4件表示、上スクロールで過去確認 |
| 2026-02-20 | 全チャネル最新メッセージ自動スクロール | EmailThreadDetail/GroupDetail/SingleMessageDetailの全てでuseRef+scrollIntoViewで最新表示 |

---

## 実装済みファイル構成

```
node_map/
├── NODEMAP_SSOT.md
├── docs/
│   └── README.md
├── public/
│   └── icons/                         ← SVGアイコン（Phase 6で13個に拡充）
│       ├── gmail.svg                  ← チャネル公式ロゴ
│       ├── slack.svg
│       ├── chatwork.svg
│       ├── anthropic.svg              ← サービスアイコン
│       ├── supabase.svg
│       ├── phase-ideation.svg         ← タスクフェーズ
│       ├── phase-progress.svg
│       ├── phase-result.svg
│       ├── memo-goal.svg              ← 構想メモフィールド
│       ├── memo-content.svg
│       ├── memo-concerns.svg
│       ├── memo-deadline.svg
│       ├── nav-inbox.svg              ← ナビゲーション
│       ├── nav-tasks.svg
│       ├── nav-settings.svg
│       ├── nav-map.svg
│       ├── nav-master.svg            ← Phase 8: ナレッジマスタナビ
│       └── nav-contacts.svg         ← Phase 9: コンタクトナビ
├── src/
│   ├── app/
│   │   ├── layout.tsx                 ← ルートレイアウト
│   │   ├── page.tsx                   ← トップ（/inbox にリダイレクト）
│   │   ├── globals.css
│   │   ├── inbox/page.tsx             ← 画面①統合インボックス
│   │   ├── tasks/page.tsx             ← 画面②タスクボード（DndContext）
│   │   ├── settings/page.tsx          ← 設定画面（2タブ構成）
│   │   ├── nodemap/page.tsx          ← 画面③④思考マップ（D3.jsグラフ）
│   │   ├── master/page.tsx           ← Phase 8: ナレッジマスタ管理画面
│   │   ├── contacts/page.tsx        ← Phase 9: コンタクト管理画面
│   │   └── api/
│   │       ├── messages/
│   │       │   ├── route.ts           ← メッセージ一覧取得
│   │       │   └── reply/route.ts     ← 返信送信
│   │       ├── ai/
│   │       │   ├── draft-reply/route.ts ← AI返信下書き
│   │       │   └── thread-summary/route.ts ← スレッドAI要約（キャッシュ対応）
│   │       ├── tasks/
│   │       │   ├── route.ts           ← タスクCRUD
│   │       │   ├── chat/route.ts      ← AI会話・要約生成
│   │       │   └── suggestions/route.ts ← タスク提案
│   │       ├── jobs/                  ← Phase 7: ジョブAPI
│   │       │   └── route.ts           ← GET/POST/PUT
│   │       ├── seeds/                 ← Phase 7: 種ボックスAPI
│   │       │   ├── route.ts           ← GET/POST
│   │       │   └── [id]/confirm/route.ts ← 種→タスク変換
│   │       ├── settings/
│   │       │   ├── route.ts           ← 設定取得・保存
│   │       │   ├── profile/route.ts   ← プロフィール更新
│   │       │   └── test/route.ts      ← 接続テスト
│   │       ├── nodes/
│   │       │   ├── route.ts           ← ノードCRUD
│   │       │   ├── extract/route.ts   ← キーワード抽出→ノード蓄積
│   │       │   └── stats/route.ts     ← ノード統計
│   │       ├── edges/
│   │       │   └── route.ts           ← エッジCRUD
│   │       ├── nodemap/
│   │       │   ├── route.ts           ← ノードマップ全体データ取得
│   │       │   └── users/route.ts     ← マップユーザー一覧
│   │       ├── master/                ← Phase 8: ナレッジマスタAPI
│   │       │   ├── route.ts          ← 全階層ツリー取得
│   │       │   ├── domains/route.ts  ← 領域一覧/追加
│   │       │   ├── fields/route.ts   ← 分野一覧/追加
│   │       │   ├── entries/route.ts  ← マスタキーワード一覧
│   │       │   └── classify/route.ts ← キーワード自動分類
│   │       ├── contacts/              ← Phase 9: コンタクトAPI
│   │       │   ├── route.ts          ← 一覧取得（フィルター対応）
│   │       │   ├── stats/route.ts    ← 統計
│   │       │   ├── [id]/route.ts     ← 関係属性更新
│   │       │   └── extract/route.ts  ← メッセージから自動抽出
│   │       ├── checkpoints/          ← Phase 10: チェックポイントAPI
│   │       │   └── route.ts         ← GET(一覧)/POST(追加)
│   │       └── clusters/
│   │           ├── route.ts           ← クラスターCRUD
│   │           └── diff/route.ts      ← クラスター差分計算
│   ├── components/
│   │   ├── inbox/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageDetail.tsx
│   │   │   ├── ReplyForm.tsx
│   │   │   └── ThreadView.tsx
│   │   ├── tasks/
│   │   │   ├── TaskCard.tsx           ← カンバンカード（useSortable）
│   │   │   ├── TaskColumn.tsx         ← ドロップ可能カラム
│   │   │   ├── TaskDetail.tsx         ← 詳細パネル（AI会話/詳細タブ）
│   │   │   ├── TaskAiChat.tsx         ← AI会話UI
│   │   │   ├── TaskSuggestions.tsx     ← AI提案カラム+詳細モーダル
│   │   │   └── CreateTaskModal.tsx    ← タスク作成モーダル
│   │   ├── seeds/                     ← Phase 7: 種ボックス
│   │   │   ├── SeedBox.tsx            ← 入力＋種リスト（折りたたみ式）
│   │   │   └── SeedCard.tsx           ← 個別の種カード
│   │   ├── jobs/                      ← Phase 7: ジョブ管理
│   │   │   ├── JobCard.tsx            ← ジョブカード（実行/却下）
│   │   │   └── JobList.tsx            ← ステータス別グループ表示
│   │   ├── timeline/                  ← Phase 7: タイムラインビュー
│   │   │   ├── TimelineView.tsx       ← 日付カラム表示
│   │   │   └── DateColumn.tsx         ← 個別日付カラム
│   │   ├── settings/
│   │   │   ├── ConnectionOverview.tsx  ← 接続ステータス概要
│   │   │   ├── ServiceSettingsCard.tsx ← サービス設定カード（admin）
│   │   │   ├── ProfileSettings.tsx    ← プロフィール設定
│   │   │   ├── ChannelAuthCard.tsx    ← チャネル認証カード（個人）
│   │   │   └── UserPreferencesCard.tsx ← ユーザー設定
│   │   ├── shared/
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── ChannelBadge.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── master/                    ← Phase 8: ナレッジマスタUI
│   │   │   ├── DomainTree.tsx         ← 3階層ツリー表示（検索対応）
│   │   │   ├── MasterStats.tsx        ← 統計カード（領域別ノード数等）
│   │   │   └── ClassificationBadge.tsx ← 分類バッジ（領域色ドット付き）
│   │   ├── contacts/                  ← Phase 9: コンタクトUI
│   │   │   ├── ContactList.tsx        ← コンタクト一覧
│   │   │   ├── ContactCard.tsx        ← 個別コンタクトカード
│   │   │   ├── ContactStats.tsx       ← 関係属性別・チャネル別統計
│   │   │   └── RelationshipBadge.tsx  ← 関係属性バッジ
│   │   └── nodemap/
│   │       ├── NetworkGraph.tsx       ← D3.jsネットワークグラフ本体（+本流/支流・矢印・CP描画）
│   │       ├── MapControls.tsx        ← 操作パネル（+ノードフィルター・CP記録ボタン）
│   │       └── MapStats.tsx           ← 統計情報パネル（+エッジ種別・CP一覧）
│   ├── hooks/
│   │   ├── useMessages.ts
│   │   ├── useTasks.ts
│   │   ├── useSettings.ts
│   │   ├── useNodes.ts              ← ノード・エッジ・クラスター取得Hook
│   │   ├── useNodeMap.ts            ← 思考マップUI用データ管理Hook
│   │   └── useContacts.ts          ← Phase 9: コンタクト管理Hook
│   ├── lib/
│   │   ├── types.ts                   ← 全型定義
│   │   ├── constants.ts               ← 全定数
│   │   ├── utils.ts
│   │   ├── cache.ts                   ← Phase 13: サーバーサイドインメモリキャッシュ（TTL付き）
│   │   └── supabase.ts
│   └── services/
│       ├── email/emailClient.service.ts
│       ├── slack/slackClient.service.ts
│       ├── chatwork/chatworkClient.service.ts
│       ├── ai/
│       │   ├── aiClient.service.ts
│       │   └── keywordExtractor.service.ts ← キーワード抽出エンジン
│       ├── task/taskClient.service.ts
│       ├── settings/settingsClient.service.ts
│       └── nodemap/
│           ├── nodeClient.service.ts      ← ノード（点）管理（+自動分類統合）
│           ├── edgeClient.service.ts      ← エッジ（線）管理
│           ├── clusterClient.service.ts   ← クラスター（面）管理
│           ├── knowledgeMaster.service.ts ← Phase 8: ナレッジマスタ管理
│           └── checkpoint.service.ts    ← Phase 10: チェックポイント管理
│       └── contact/
│           └── contactPerson.service.ts  ← Phase 9: コンタクト統合管理
├── supabase/
│   ├── 001_initial_schema.sql
│   ├── 002_tasks_schema.sql
│   ├── 003_nodemap_schema.sql        ← ノード・エッジ・クラスターDB
│   └── 004_phase7_10_schema.sql     ← Phase 7-10追加テーブル・カラム
└── package.json
```

---

## 各フェーズの引き継ぎメモ

### Phase 1 → Phase 2 への引き継ぎ
- **実装したファイル構成：** 上記ファイル構成のinbox系ファイル全て
- **使用した技術の最終決定：** Next.js 14 (App Router), TypeScript, Tailwind CSS 3, Supabase, Anthropic Claude API
- **注意点・課題：**
  - 全サービスはデモモードで動作（API未設定時はダミーデータ返却）
  - Supabaseは接続未実施（スキーマのみ作成）
  - 同一案件スレッド化は未実装（将来対応）
  - 公式ロゴSVGはpublic/iconsに格納済み

### Phase 2 → Phase 3（設定画面）への引き継ぎ
- **実装したファイル構成：** tasks系ファイル全て + @dnd-kit関連
- **改善フィードバック対応：**
  - D&D対応（@dnd-kit、8pxの活性化閾値でクリック/ドラッグ区別）
  - AI提案をカラム化（未着手の左側に縦スクロール配置）
  - 判断材料の追加（sourceFrom/sourceDate/sourceSubject/sourceExcerpt）
  - 却下ボタン追加（却下/あとで/タスクに追加の3ボタン）
  - 優先度をテキストバッジに変更（高/中/低）
  - 構想メモの構造化フォーム（ゴール/主な内容/気になる点/期限日）
  - 進行フェーズのAI補助クイックアクション（4種）
  - 詳細タブの再設計

### Phase 3（設定画面）→ Phase 4（データ収集基盤）への引き継ぎ
- **実装したファイル構成：** settings系ファイル全て
- **2層構造の設計：**
  - admin設定: API基盤（Client ID/Secret, Bot Token, APIキー, Supabase URL等）
  - 個人設定: OAuth認証（各チャネルへのログイン）+ プロフィール + 表示・通知設定
  - admin未設定時は個人の認証ボタンが無効化される
- **注意点：**
  - 設定は現在インメモリ保存（本番はSupabase暗号化保存が必要）
  - OAuth認証フローはシミュレーション（本番は実際のOAuth2実装が必要）
  - 接続テストもシミュレーション

### Phase 4（データ収集基盤）→ Phase 5（思考マップUI）への引き継ぎ
- **実装したファイル構成：** nodemap系サービス全て + ノードAPI + キーワード抽出エンジン
- **データ収集基盤の設計：**
  - ノード（点）: keyword/person/projectの3タイプ。頻出度カウント・理解度自動判定付き
  - エッジ（線）: co_occurrence/sequence/causalの3タイプ。重み（weight）で太さを表現
  - クラスター（面）: ideation/resultの2タイプ。差分計算でdiscoveredOnPathを算出
  - キーワード抽出: Anthropic Claude API使用。デモモードではルールベース抽出
- **注意点：**
  - 全データはインメモリ保存（本番はSupabase。003_nodemap_schema.sql準備済み）
  - デモ用の初期データ（12ノード・8エッジ・4クラスター）が組み込み済み
  - キーワード抽出のエラーは既存フローに影響させない（非同期・エラー無視パターン）

### Phase 5（思考マップUI）完了 → 再定義v2への引き継ぎ
- **実装したファイル構成：** nodemap/page.tsx + components/nodemap/* + hooks/useNodeMap.ts + api/nodemap/*
- **思考マップUIの設計：**
  - D3.jsフォースレイアウトによるネットワークグラフ表示
  - ノード形状でタイプを区別（丸=キーワード、ダイヤ=人物、四角=プロジェクト）
  - ノードサイズ+色で理解度を表現（認知=小グレー、理解=中青、習熟=大緑）
- **再定義v2で変更が必要な箇所：**
  - ノードタイプの統一（キーワードのみに純化）
  - フィルター機能の追加（人/案件/タスク）
  - ナレッジマスタ基盤の新規構築
  - エッジの本流・支流表現への変更
  - チェックポイント記録機能の新規追加
  - タスクボードのジョブ/タスク分離
  - 種ボックスの新規構築
  - 配色統一・アイコン統一

### Phase 7 → Phase 8（ナレッジマスタ基盤）への引き継ぎ
- **実装したファイル構成：** knowledgeMaster.service.ts + api/master/* + components/master/* + master/page.tsx
- **ナレッジマスタの設計：**
  - 3階層体系：領域(5)→分野(17)→マスタキーワード(30)
  - 領域5つ：マーケティング/開発/営業/管理/企画（各色定義済み）
  - デモデータ：全ユーザーの既存ノード44個中、キーワード/プロジェクト型を自動リンク
  - 自動分類：processText()内でclassifyKeyword()を呼び出し、ノードにdomainId/fieldIdをキャッシュ
  - 管理画面：/masterでツリー表示、検索、統計カード
  - マップ統合：領域フィルター（ノード絞り込み）、ドメイン色分け、統計パネルに領域分布
- **注意点：**
  - 分類ロジックは現在ルールベース（完全一致/同義語/部分一致）。本番はAI API呼び出しに置き換え
  - マスタキーワードの追加/編集UIは未実装（APIは準備済み）
  - NodeMasterLinkの確認（confirmed）UIは未実装

### Phase 9 → Phase 10（思考マップUI改修）への引き継ぎ
- **実装したファイル構成：** types.ts, constants.ts, edgeClient.service.ts, checkpoint.service.ts, api/checkpoints/route.ts, NetworkGraph.tsx, MapControls.tsx, MapStats.tsx, useNodeMap.ts, nodemap/page.tsx
- **思考マップUI改修の設計：**
  - エッジ再定義：flowType='main'(本流:同分野,太い実線+矢印)/flowType='tributary'(支流:異分野,細い破線)
  - 方向性：direction='forward'/'backward'/'bidirectional'。SVG arrowhead markerで矢印描画
  - チェックポイント：checkpoint.service.ts + /api/checkpoints。デモ6件（4ユーザー分）
  - 手動記録：MapControlsに📍ボタン → 現在表示中ノードをスナップショット保存
  - ノードフィルター：NodeFilterMode 4モード（keyword_only/with_person/with_project/all）
  - デフォルトは'keyword_only'（再定義v2の純化原則）
  - filteredData：filterMode→領域フィルターの二重適用。エッジもノードIDで絞り込み
  - MapStats：エッジ種別（本流/支流カウント）、チェックポイント一覧（タスク選択時）
  - FLOW_TYPE_CONFIG：main(#2563EB,3px,実線)/tributary(#CBD5E1,1px,破線)
  - NODE_FILTER_CONFIG：4モードのラベル・説明定義
  - 全28エッジにflowType/directionを付与済み（デモデータ）
- **注意点：**
  - チェックポイントは現在インメモリ保存（本番はSupabase）
  - AI自動チェックポイント記録は基本構造のみ（source='auto'のデモデータあり、実際のAI記録ロジックは未実装）
  - 比較モード時のNetworkGraphにはcheckpointsを未渡し（通常モードのみ対応）

### Phase 10 → Phase 11（Supabase接続）への引き継ぎ
- **実装したファイル構成：** supabase.ts（ヘルパー追加）, supabase/004_phase7_10_schema.sql, supabase_full_schema.sql, 全7サービスファイル
- **Supabase接続の設計：**
  - supabase.tsに`isSupabaseConfigured()`/`getSupabase()`ヘルパーを追加
  - `getSupabase()`がnullならデモモード、SupabaseClientならDB接続という分岐パターン
  - 16テーブルをSQL Editorで一括作成（supabase_full_schema.sql）
  - マイグレーションファイルは004_phase7_10_schema.sqlを追加（Phase 7-10で追加されたテーブル・カラム）
  - DB側はsnake_case、TypeScript側はcamelCaseで、各サービスにマッピング関数を配置
- **変更した7サービスファイル：**
  - taskClient.service.ts — tasks/task_conversations/jobs/seeds
  - nodeClient.service.ts — user_nodes/node_source_contexts
  - edgeClient.service.ts — node_edges/edge_tasks
  - clusterClient.service.ts — node_clusters/cluster_nodes
  - checkpoint.service.ts — checkpoints
  - knowledgeMaster.service.ts — knowledge_domains/knowledge_fields/knowledge_master_entries/node_master_links
  - contactPerson.service.ts — contact_persons/contact_channels
- **環境変数：**
  - Vercel+Supabase連携により自動設定済み（NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY）
  - ローカル開発時は.env.localに設定（未設定ならデモモードで動作）
- **注意点：**
  - RLS（Row Level Security）は未設定。本番運用前に要設定
  - user_idは全テーブルに存在するが、認証(Auth)連携は未実装。現在はデモ用固定ID
  - デモデータはサービスファイル内にハードコードで残存（Supabase未接続時のフォールバック用）
  - settingsClient.service.tsは未変更（設定データの暗号化保存は別途対応要）

### Phase 8 → Phase 9（関係値情報基盤）への引き継ぎ
- **実装したファイル構成：** contactPerson.service.ts + api/contacts/* + components/contacts/* + contacts/page.tsx + useContacts.ts
- **コンタクト管理の設計：**
  - コンタクト統合：Email/Slack/Chatworkの送受信者を1人のContactPersonに統合
  - デモデータ8名：田中太郎(Email+Slack, 自社)、佐藤花子(Email, 自社)、鈴木一郎(Email, クライアント)、山田次郎(Slack, 自社)、伊藤美咲(Slack, 自社)、中村四郎(Chatwork, パートナー)、小林五郎(Chatwork, クライアント)、渡辺六子(Chatwork, 自社)
  - 関係属性3種：internal(自社,青)/client(クライアント,橙)/partner(パートナー,紫)
  - AI推定：メールドメイン・Slack UID・Chatwork IDパターンから関係属性を推定。confidence付き
  - 管理画面：/contactsで統計カード・一覧表示・検索・関係属性/チャネル別フィルター
  - 未確認コンタクトはカード内ドロップダウンで関係属性を手動確定可能
  - マップ統合：人物ノードに関係属性色を反映、MapStatsに関係属性分布、ツールチップに関係情報
  - nodeClient.service.tsのデモ人物ノード7個にcontactId/relationshipTypeを紐付け
- **注意点：**
  - 全データはインメモリ保存（本番はSupabase）
  - コンタクト自動抽出（extractFromMessages）は基本ロジックのみ。本番はAI API活用
  - 関係属性のバッチ一括確認UIは未実装（個別確認のみ）
  - チャネル登録フロー（設定画面連携）は未実装

### Phase 13（インボックスUX改善）への引き継ぎ
- **実装したファイル構成：** cache.ts(新規), thread-summary/route.ts(新規), SummaryScrollArea(新規コンポーネント), emailClient.service.ts, aiClient.service.ts, MessageDetail.tsx, ReplyForm.tsx, useMessages.ts, messages/route.ts, reply/route.ts, types.ts
- **Gmail引用チェーン会話変換：**
  - parseQuoteChain()でネスト引用をThreadMessage[]に分解。「YYYY年M月D日(曜) HH:MM sender wrote:」パターン対応
  - EmailThreadDetailコンポーネントでチャットバブルUIに表示
  - 24通のメールスレッドで動作確認済み
- **AI要約（タイムライン形式）：**
  - Claude Sonnet（claude-sonnet-4-5-20250929, max_tokens:500）で「・M/D\n  - 要約」形式を生成
  - /api/ai/thread-summary エンドポイント。messageIdベースでキャッシュ（30分TTL）
  - バックグラウンド事前生成：messages API取得時に非同期でgenerateThreadSummary()を呼び出し
  - SummaryScrollArea: max-h-[100px]+overflow-y-auto、最下部（直近）に自動スクロール
- **Reply All：**
  - UnifiedMessage.cc フィールド追加（IMAP envelope.ccから取得）
  - ReplyForm: To=送信者、CC=全受信者(重複排除)。「👥 全員に返信」/「👤 送信者のみ」トグル
  - reply/route.ts: to/cc/subjectをリクエストから受け取り、sendEmail()に渡す
- **2層キャッシュ：**
  - サーバーサイド: cache.ts MemoryCacheシングルトン（globalThis永続化）。messages 3分TTL、summary 30分TTL
  - クライアントサイド: useMessages.ts内clientMessageCache変数。2分TTL+バックグラウンドリバリデーション
  - ?refresh=trueパラメータでキャッシュ強制無効化
- **自動スクロール：**
  - EmailThreadDetail/GroupDetail/SingleMessageDetail全てにuseRef+scrollIntoViewで最新メッセージ表示
- **注意点：**
  - サーバーサイドキャッシュはVercel Serverless Functions内インメモリ。コールドスタートでリセット
  - AI要約のコスト管理：1スレッド500トークン上限。大量スレッドではAPI呼び出し回数に注意
  - 引用チェーンパーサーは日本語メール形式に特化。英語メールの「On ... wrote:」形式も対応済みだが、他言語は未対応

### Phase 12前半（APIキー準備：Anthropic + Gmail）への引き継ぎ
- **設定した環境変数（Vercel）：**
  - `ANTHROPIC_API_KEY` — Anthropic Claude API（AI返信下書き・タスク会話・キーワード抽出）
  - `EMAIL_USER` — Gmailアドレス（Google Workspace）
  - `EMAIL_PASSWORD` — Googleアプリパスワード（16文字）
  - `EMAIL_HOST` — `imap.gmail.com`
  - `SMTP_HOST` — `smtp.gmail.com`
- **修正したバグ：**
  - `api/settings/route.ts` と `api/settings/test/route.ts` のEmail接続検出ロジック
  - 旧：`GMAIL_CLIENT_ID` のみ参照 → 新：`EMAIL_USER || GMAIL_CLIENT_ID` で検出
- **現在の接続状態（Vercel環境変数設定済み）：**
  - Supabase: ✅ 接続済み
  - Anthropic: ✅ 設定済み（デプロイ後に設定画面で確認要）
  - Gmail: ✅ 設定済み（デプロイ後に設定画面で確認要）
  - Slack: ❌ 未設定
  - Chatwork: ❌ 未設定
- **注意点：**
  - 接続テスト（`/api/settings/test`）は現在シミュレーション。本番は実際のAPI呼び出しに変更要
  - Gmailは IMAP/SMTP 方式。Google Workspace の場合、管理者が「安全性の低いアプリ」を許可している必要あり
  - Vercel Serverless Functions の実行時間制限（10秒/無料プラン）に注意。IMAPの大量取得は分割要
- **次スレッドでやること：**
  - 設定画面でAnthropic/Gmailの接続状態が「接続済み」か確認
  - インボックスで実メール取得テスト
  - AI機能（返信下書き・キーワード抽出）の実データテスト
  - Slack/Chatworkの接続設定（必要に応じて）

---

## 次にやること

### 即時対応（次スレッド）
1. **ローカルフォルダ整備** — ai-agent/配下にNodeMapフォルダを作成、current/とhistory/を構築
2. **設計書v2作成** — 再定義v2の内容を反映した設計書を作成
3. **SSOT/設計書のGitHub同期** — ローカルが正、GitHubはコピーの運用を開始

### 再定義v2の実装（Phase 6以降）
4. **UI修正** — ✅完了（2026-02-19）配色3色統一、SVGアイコン13個、gray→slate全置換
5. **タスクボード改修** — ✅完了（2026-02-19）ジョブ/タスク分離、種ボックス、ステータス/タイムライン切り替え
6. **ナレッジマスタ基盤** — ✅完了（2026-02-19）3階層体系（領域→分野→キーワード）、AI自動分類、管理画面、マップ統合
7. **関係値情報基盤** — ✅完了（2026-02-19）コンタクト統合管理・関係属性AI推定・管理画面・マップ統合
8. **思考マップUI改修** — ✅完了（2026-02-19）ノードフィルター・本流/支流エッジ・チェックポイント記録・矢印表示
9. **Supabase接続** — ✅完了（2026-02-19）16テーブル作成・全7サービスのDB切り替え・デモモード併存
10. **APIキー準備（前半）** — ✅完了（2026-02-19）Anthropic API + Gmail(IMAP/SMTP)接続設定・接続検出バグ修正
11. **インボックス改善** — ✅完了（2026-02-20）メールMIMEパース・Chatwork API接続・ページネーション・エラーハンドリング
12. **インボックスUX改善** — ✅完了（2026-02-20）Gmail引用チェーン会話変換・AI要約・Reply All・キャッシュ・要約スクロール・自動スクロール
13. **添付ファイル・画像の表示・保存** — メール添付/Chatworkファイル/Slack画像の取得・プレビュー・ダウンロード機能
14. **Chatwork内部タグの整形** — [rp aid=...]等の除去・整形
15. **Slack接続** — Bot Token取得 + 実データ取得テスト

---

## ローカルフォルダ運用ルール

### フォルダ構成
```
ai-agent/
└── XX_NodeMap/              ← 連番は既存フォルダに合わせる
    ├── current/             ← 常に最新版のみ
    │   ├── NODEMAP_SSOT.md
    │   ├── PROMPT_TEMPLATE.md
    │   ├── NODEMAP_再定義v2_議論まとめ.md
    │   └── NodeMap_設計書_vX.docx
    ├── history/             ← 差分を撮り溜め
    │   └── YYYY-MM-DD_変更内容/
    └── README.md
```

### 格納ルール
- `current/` には常に最新版のみ。古いファイルは置かない
- フェーズ完了時や大きな変更時に `history/` へスナップショット保存
- historyのフォルダ名は `YYYY-MM-DD_変更内容` の形式
- 設計書のバージョンが上がる場合はファイル名も変える

### 運用フロー
1. スレッド開始時：ユーザーがcurrent/のファイルをClaudeに渡す
2. スレッド内で作業・議論
3. スレッド完了時（Claudeがやること）：
   - current/のファイルを更新
   - history/にスナップショット保存
   - GitHubにも同期
4. **常にローカルcurrent/が正。GitHubはそのコピー。ズレた場合はローカルが勝つ。**

---

## 運用ルール（要約）

> 詳細は設計書セクション7を参照

| ルール | 内容 |
|--------|------|
| フォルダ構成 | 設計書7-1の固定ツリーに従う |
| 命名規則 | 設計書7-2の表に従う |
| 格納ルール | 設計書7-3の7項目を厳守 |
| コミット | 日本語、[種別] 形式、1機能1コミット |
| フェーズ完了時 | SSOTを更新→不要ファイル削除→構成確認→コミット→CHECKPOINT提示 |
| ローカルフォルダ | current/が正、GitHubはコピー |

---

## GitHub認証情報

| 項目 | 値 |
|------|-----|
| リポジトリ | https://github.com/nextstage2018/node_map |
| ブランチ | main |
| user.name | sjinji |
| user.email | suzuki@next-stage.biz |
| 認証方式 | Fine-grained personal access token |
| トークン | ローカルのcurrent/NODEMAP_SSOT.mdに記載（GitHub非公開） |
| 有効期限 | 7日間（短期ローテーション運用） |

> **運用ルール：** トークンは7日で期限切れになります。期限が切れたら新しいトークンを発行し、このセクションを更新してください。エージェントはこのトークンを使ってGitHubにプッシュします。

---

## ローカルに保持するファイル一覧

| ファイル | 説明 |
|----------|------|
| `NodeMap_設計書_vX.docx` | サービス全体の設計仕様 |
| `NODEMAP_SSOT.md` | このファイル。進捗・決定事項・引き継ぎ情報 |
| `PROMPT_TEMPLATE.md` | 毎回の会話開始時に使う定型文 |
| `NODEMAP_再定義v2_議論まとめ.md` | 再定義v2の議論詳細 |

---

> **運用ルール**
> - 各フェーズの完了時、エージェントはこのファイルを必ず更新する
> - CHECKPOINTの結果と決定事項を記録する
> - 次のフェーズへの引き継ぎメモを記入する
> - sjinjiさんはCHECKPOINTの確認結果を口頭でエージェントに伝えればOK
