// キーワード抽出エンジン
// メッセージ・タスク会話からキーワード・人名・案件名を抽出する

import {
  KeywordExtractionRequest,
  KeywordExtractionResponse,
  ExtractedKeyword,
} from '@/lib/types';

// Anthropic APIキー取得
function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

/**
 * テキストからキーワード・人名・案件名を抽出する
 */
export async function extractKeywords(
  request: KeywordExtractionRequest
): Promise<KeywordExtractionResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoExtraction(request.text);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const systemPrompt = `あなたはテキスト分析の専門家です。
与えられたテキストから以下の3種類の情報を抽出してください。

1. keywords: 業務に関連する重要なキーワード（名詞・専門用語・概念）
2. persons: 人名（敬称を除く）
3. projects: プロジェクト名・案件名・サービス名

ルール：
- 各項目にconfidence（信頼度 0.0〜1.0）を付与
- 一般的すぎる単語（「件」「こと」「もの」等）は除外
- 同じ意味の表現は正規化して1つにまとめる
- 最大でkeywords 10個、persons 5個、projects 3個まで

必ず以下のJSON形式のみで返してください（前置きや説明は不要）：
{
  "keywords": [{"label": "...", "confidence": 0.9}],
  "persons": [{"label": "...", "confidence": 0.95}],
  "projects": [{"label": "...", "confidence": 0.8}]
}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `以下のテキストから情報を抽出してください：\n\n${request.text}` },
      ],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : null;
    if (!content) {
      return getDemoExtraction(request.text);
    }

    const parsed = JSON.parse(content);
    return {
      keywords: (parsed.keywords || []).map((k: { label: string; confidence: number }) => ({
        label: k.label,
        type: 'keyword' as const,
        confidence: k.confidence,
      })),
      persons: (parsed.persons || []).map((p: { label: string; confidence: number }) => ({
        label: p.label,
        type: 'person' as const,
        confidence: p.confidence,
      })),
      projects: (parsed.projects || []).map((pr: { label: string; confidence: number }) => ({
        label: pr.label,
        type: 'project' as const,
        confidence: pr.confidence,
      })),
    };
  } catch (error) {
    console.error('キーワード抽出エラー:', error);
    return getDemoExtraction(request.text);
  }
}

/**
 * デモモード：簡易的なルールベース抽出
 * API未接続時のフォールバック
 */
function getDemoExtraction(text: string): KeywordExtractionResponse {
  const keywords: ExtractedKeyword[] = [];
  const persons: ExtractedKeyword[] = [];
  const projects: ExtractedKeyword[] = [];

  // 日本語のキーワードパターン（カタカナ語・漢字複合語）
  const katakanaPattern = /[ァ-ヶー]{3,}/g;
  const kanjiPattern = /[一-龥]{2,}[化案件書類報告提案会議]/g;

  // 人名パターン（〜さん、〜様、〜氏）
  const personPattern = /([一-龥ぁ-んァ-ヶ]{2,4})(さん|様|氏|部長|課長|係長|社長|先生)/g;

  // プロジェクトパターン（英語+日本語の案件名）
  const projectPattern = /[A-Za-z][A-Za-z0-9_\-]{2,}(プロジェクト|PJ|案件)?/g;

  // カタカナキーワード抽出
  const katakanaMatches = text.match(katakanaPattern) || [];
  const uniqueKatakana = Array.from(new Set(katakanaMatches));
  uniqueKatakana.slice(0, 5).forEach((match) => {
    keywords.push({ label: match, type: 'keyword', confidence: 0.7 });
  });

  // 漢字複合語抽出
  const kanjiMatches = text.match(kanjiPattern) || [];
  const uniqueKanji = Array.from(new Set(kanjiMatches));
  uniqueKanji.slice(0, 5).forEach((match) => {
    keywords.push({ label: match, type: 'keyword', confidence: 0.6 });
  });

  // 人名抽出
  let personMatch;
  const seenPersons = new Set<string>();
  while ((personMatch = personPattern.exec(text)) !== null) {
    const name = personMatch[1];
    if (!seenPersons.has(name)) {
      seenPersons.add(name);
      persons.push({ label: name, type: 'person', confidence: 0.8 });
    }
  }

  // プロジェクト名抽出
  const projectMatches = text.match(projectPattern) || [];
  const uniqueProjects = Array.from(new Set(projectMatches));
  uniqueProjects.slice(0, 3).forEach((match) => {
    projects.push({ label: match, type: 'project', confidence: 0.6 });
  });

  // デモ用の追加キーワード（テキストが短い場合の補完）
  if (keywords.length === 0 && text.length > 10) {
    const demoKeywords = [
      'マーケティング', 'リスケ', 'フィードバック', 'スケジュール',
      'ミーティング', 'クライアント', 'レビュー', 'デザイン',
    ];
    // テキストに含まれるデモキーワードを追加
    demoKeywords.forEach((kw) => {
      if (text.includes(kw)) {
        keywords.push({ label: kw, type: 'keyword', confidence: 0.9 });
      }
    });
  }

  return { keywords, persons, projects };
}

/**
 * @deprecated Phase 16で廃止。interactionCountからderiveLevel()で導出する方式に変更。
 * 後方互換のため関数は残す。
 *
 * 旧: 理解度レベルを判定する
 * - recognition: 受信メッセージにのみ含まれる（認知）
 * - understanding: 自分の送信やAI会話で使用（理解）
 * - mastery: 他人への説明・指示文脈で使用（習熟）
 */
export function assessUnderstandingLevel(
  contexts: { direction: string; sourceType: string }[]
): 'recognition' | 'understanding' | 'mastery' {
  const hasReceived = contexts.some((c) => c.direction === 'received');
  const hasSent = contexts.some((c) => c.direction === 'sent');
  const hasSelf = contexts.some((c) => c.direction === 'self');

  if (hasSent && hasReceived) {
    const sentCount = contexts.filter((c) => c.direction === 'sent').length;
    if (sentCount >= 2) {
      return 'mastery';
    }
    return 'understanding';
  }

  if (hasSelf || hasSent) {
    return 'understanding';
  }

  return 'recognition';
}
