// トピック類似度マッチャーサービス
// 検討ツリーノードの重複防止 + 会議録/チャネル間のトピック統合
//
// 3段階マッチング:
//   1. 正規化 → 完全一致（score=1.0）
//   2. 部分文字列含有（score=0.85）
//   3. キーワード重複率（score=0.5〜0.8）
// threshold 0.65以上で「マージ推奨」

// ========================================
// 型定義
// ========================================

export interface DecisionTreeNodeForMatch {
  id: string;
  title: string;
  node_type?: string;
  status?: string;
  parent_node_id?: string | null;
  source_type?: 'meeting' | 'channel' | 'hybrid' | null;
  confidence_score?: number;
  source_message_ids?: string[];
  source_meeting_id?: string | null;
}

export interface TopicMatchResult {
  matchedNode: DecisionTreeNodeForMatch | null;
  similarityScore: number;
  matchType: 'exact' | 'substring' | 'keyword_overlap' | 'none';
  recommendedAction: 'merge' | 'create_new';
}

// ========================================
// 正規化
// ========================================

/**
 * タイトルを正規化して比較しやすくする
 * 既存の isSimilarTitle() を拡張
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // スペース除去（全角・半角）
    .replace(/[\s　]+/g, '')
    // 区切り文字除去
    .replace(/[・\-_\.\,、。]/g, '')
    // 日本語の助詞・接尾辞除去
    .replace(/について$/g, '')
    .replace(/の件$/g, '')
    .replace(/に関して$/g, '')
    .replace(/に関する$/g, '')
    .replace(/[はをにもがでと]/g, '');
}

/**
 * テキストからキーワード（意味のある単語）を抽出
 * カタカナ語、漢字複合語を優先
 */
export function extractTitleKeywords(title: string): string[] {
  const keywords: string[] = [];

  // カタカナ語（3文字以上）
  const katakana = title.match(/[ァ-ヶー]{3,}/g);
  if (katakana) keywords.push(...katakana);

  // 漢字複合語（2文字以上）
  const kanji = title.match(/[一-龥]{2,}/g);
  if (kanji) keywords.push(...kanji);

  // 英数字の単語（2文字以上）
  const english = title.match(/[a-zA-Z0-9]{2,}/gi);
  if (english) keywords.push(...english.map(w => w.toLowerCase()));

  return [...new Set(keywords)];
}

// ========================================
// 類似度計算
// ========================================

/**
 * 2つのタイトル間の類似度スコアを計算
 */
export function calculateSimilarity(
  newTitle: string,
  existingTitle: string
): { score: number; matchType: 'exact' | 'substring' | 'keyword_overlap' | 'none' } {
  const normNew = normalizeTitle(newTitle);
  const normExisting = normalizeTitle(existingTitle);

  // Tier 1: 正規化後の完全一致
  if (normNew === normExisting) {
    return { score: 1.0, matchType: 'exact' };
  }

  // Tier 2: 部分文字列含有
  if (normNew.length >= 2 && normExisting.length >= 2) {
    if (normNew.includes(normExisting) || normExisting.includes(normNew)) {
      // 長さ比率でスコア調整（短い方 / 長い方）
      const ratio = Math.min(normNew.length, normExisting.length) / Math.max(normNew.length, normExisting.length);
      const score = Math.max(0.80, ratio);
      return { score: Math.min(score, 0.95), matchType: 'substring' };
    }
  }

  // Tier 3: キーワード重複率
  const kwNew = extractTitleKeywords(newTitle);
  const kwExisting = extractTitleKeywords(existingTitle);

  if (kwNew.length > 0 && kwExisting.length > 0) {
    const overlap = kwNew.filter(kw =>
      kwExisting.some(ekw =>
        kw === ekw || kw.includes(ekw) || ekw.includes(kw)
      )
    );
    const overlapRate = overlap.length / Math.max(kwNew.length, kwExisting.length);
    if (overlapRate > 0) {
      // 0.5〜0.8 の範囲にマッピング
      const score = 0.5 + overlapRate * 0.3;
      return { score: Math.min(score, 0.8), matchType: 'keyword_overlap' };
    }
  }

  return { score: 0, matchType: 'none' };
}

// ========================================
// メインマッチング関数
// ========================================

const MERGE_THRESHOLD = 0.65;

/**
 * 新しいトピックタイトルを既存のルートノード群と照合し、
 * マージすべきか新規作成すべきかを判定する
 */
export function matchTopic(
  newTitle: string,
  existingRootNodes: DecisionTreeNodeForMatch[]
): TopicMatchResult {
  let bestMatch: TopicMatchResult = {
    matchedNode: null,
    similarityScore: 0,
    matchType: 'none',
    recommendedAction: 'create_new',
  };

  for (const node of existingRootNodes) {
    const { score, matchType } = calculateSimilarity(newTitle, node.title);

    if (score > bestMatch.similarityScore) {
      bestMatch = {
        matchedNode: node,
        similarityScore: score,
        matchType,
        recommendedAction: score >= MERGE_THRESHOLD ? 'merge' : 'create_new',
      };
    }

    // 完全一致なら即リターン
    if (score === 1.0) break;
  }

  return bestMatch;
}

/**
 * 子ノード（options/decisions）の重複チェック
 * 既存の isSimilarTitle() と同等の機能を提供
 */
export function isChildNodeDuplicate(
  newTitle: string,
  existingChildNodes: DecisionTreeNodeForMatch[]
): DecisionTreeNodeForMatch | null {
  for (const child of existingChildNodes) {
    const { score } = calculateSimilarity(newTitle, child.title);
    if (score >= MERGE_THRESHOLD) {
      return child;
    }
  }
  return null;
}

/**
 * マージ時のconfidence_score計算
 * 既存ノードのスコアと新ソースのスコアの加重平均
 */
export function calculateMergedConfidence(
  existingConfidence: number,
  existingSourceCount: number,
  newConfidence: number
): number {
  const totalWeight = existingSourceCount + 1;
  const merged = (existingConfidence * existingSourceCount + newConfidence) / totalWeight;
  return Math.round(merged * 100) / 100; // 小数2桁に丸める
}
