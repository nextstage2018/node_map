// NodeAI: トリガーワード検知サービス
// 会議中の発言からNodeAIへの呼びかけを検出し、質問テキストを抽出する

/**
 * トリガーワードのパターン一覧
 * 音声認識の揺らぎに対応するため、多くのバリエーションを登録
 *
 * 実際の認識例:
 *   「ノードさん」→ のうどさん / ノーズさん / ノートさん / ノードサン / のーどさん
 *   「NodeAI」→ node ai / ノード ai / のーどai
 *   「ヘイエージェント」→ ヘイエージェント / hey agent
 */
const TRIGGER_PATTERNS: RegExp[] = [
  // --- 英語系 ---
  /node\s*ai/i,
  /no[td]e?\s*ai/i,

  // --- 「ノードさん」系（カタカナ・ひらがな揺らぎ） ---
  /[ノの][ーう][ドズトド][さサ][んン]/,        // ノードさん / のうどさん / ノーズさん / ノートさん
  /[ノの][ーう][ドズトド]\s*さん/,              // スペース入り
  /[ノの][ーう][ドズトド]\s*(AI|ai|エーアイ|えーあい|ェーアイ)/,  // ノードAI系

  // --- 「ノード」+ 敬称バリエーション ---
  /[ノの][ーう][ドズトド]\s*(くん|君|ちゃん|様|さま)/,

  // --- ヘイエージェント ---
  /[ヘへ][イい]\s*[エえ][ーい]?[ジじ][ェぇ][ンん][トと]/,
  /hey\s*(agent|エージェント)/i,
];

/**
 * テキスト内にトリガーワードが含まれるか検出
 */
export function detectTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some((p) => p.test(text));
}

/**
 * トリガーワード以降の質問テキストを抽出
 * 例: 「ノードさん、タスクの状況は？」→「タスクの状況は？」
 */
export function extractQuestion(text: string): string {
  for (const pattern of TRIGGER_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const afterTrigger = text.substring(match.index + match[0].length);
      // 先頭の句読点・空白・カンマを除去
      return afterTrigger.replace(/^[\s、,。．.]+/, '').trim();
    }
  }
  return text.trim();
}

/**
 * エコー防止チェック
 * 直前の応答から指定秒数以内の再トリガーは無視
 */
export function shouldIgnoreEcho(
  lastResponseTimestamp: number | null,
  currentTimestamp: number,
  cooldownSeconds: number = 10
): boolean {
  if (!lastResponseTimestamp) return false;
  return (currentTimestamp - lastResponseTimestamp) < cooldownSeconds;
}

/**
 * 複数utterance（発言断片）を結合して質問テキストを構築
 * 同一話者の後続utterance（3秒以内）も質問に含める
 */
export function buildQuestionFromUtterances(
  utterances: Array<{ text: string; timestamp: number; speakerId: number }>,
  triggerIndex: number,
  maxGapSeconds: number = 3
): string {
  const triggerUtterance = utterances[triggerIndex];
  if (!triggerUtterance) return '';

  const speakerId = triggerUtterance.speakerId;
  let question = extractQuestion(triggerUtterance.text);

  // 後続の同一話者utteranceを3秒以内なら結合
  for (let i = triggerIndex + 1; i < utterances.length; i++) {
    const u = utterances[i];
    if (u.speakerId !== speakerId) break;
    if (u.timestamp - triggerUtterance.timestamp > maxGapSeconds) break;
    question += u.text;
  }

  return question.trim();
}
