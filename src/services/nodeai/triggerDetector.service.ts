// NodeAI: トリガーワード検知サービス
// 会議中の発言からNodeAIへの呼びかけを検出し、質問テキストを抽出する
//
// 設計方針: 誤検知より検知漏れの方がUXが悪い。
// 会議中に「ノード」「濃度」が偶然出る確率は低く、
// 仮に誤検知してもAIが応答するだけなのでリスクは小さい。
// → 検知は緩く、会話継続モードで自然なやり取りを実現

/**
 * トリガーワードのパターン一覧（緩め設定）
 *
 * 実際の認識ログ:
 *   「ノードさん」→ のうどさん / ノーズさん / ノートさん / 直登さん / 大登山 / 濃度君 / 濃度3 / ノード（単体）/ 濃度（単体）
 *   「NodeAI」→ node ai / ノード ai / のーどai / glook
 *   「ヘイエージェント」→ ヘイエージェント / hey agent
 */
const TRIGGER_PATTERNS: RegExp[] = [
  // --- 英語系 ---
  /node\s*ai/i,
  /no[td]e?\s*ai/i,

  // --- 「ノード」単体でもOK（分割utterance対応） ---
  /^[ノの][ーうォオ]?[ドズトドづ]$/,            // 「ノード」のみ
  /^[ノの][ーうォオ]?[ドズトドづ][\s。、.]+$/,   // 「ノード。」「ノード、」

  // --- 「ノードさん」系（カタカナ・ひらがな揺らぎ） ---
  /[ノの][ーうォオ]?[ドズトドづ][さサ][んンま]/,
  /[ノの][ーうォオ]?[ドズトドづ]\s*さん/,
  /[ノの][ーうォオ]?[ドズトドづ]\s*(AI|ai|エーアイ|えーあい|ェーアイ)/,
  /[ノの][ーうォオ]?[ドズトドづ]\s*(くん|君|ちゃん|様|さま)/,

  // --- 漢字誤認識パターン（実ログから蓄積） ---
  /直登/,         // 「ノードさん」→「直登さん」「直登」
  /大登山/,       // 「ノードさん」→「大登山」
  /濃度/,         // 「ノードさん」→「濃度」「濃度3」「濃度君」
  /能登/,         // 「ノードさん」→「能登さん」
  /野戸/,         // 「ノードさん」→「野戸さん」

  // --- ヘイエージェント ---
  /[ヘへ][イい]\s*[エえ][ーい]?[ジじ][ェぇ][ンん][トと]/,
  /hey\s*(agent|エージェント)/i,
];

/**
 * テキスト内にトリガーワードが含まれるか検出
 */
export function detectTrigger(text: string): boolean {
  // 空テキスト・空白のみは除外
  const cleaned = text.replace(/[\s。、,.]+/g, '').trim();
  if (!cleaned) return false;
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
