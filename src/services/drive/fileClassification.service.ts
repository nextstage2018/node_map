// Phase 44b: ファイル自動分類サービス
// Claude API を使ってファイル名+メール文脈からドキュメント種別・方向・日付を推定
// PDFの中身は読まない（軽量：ファイル名+メール文脈だけで判定）

import Anthropic from '@anthropic-ai/sdk';
import { getTodayJST, toJSTDateString } from '@/lib/dateUtils';

// ========================================
// 型定義
// ========================================

export interface ClassificationInput {
  fileName: string;
  mimeType?: string;
  emailSubject?: string;
  emailBody?: string;  // 先頭200文字程度
  senderName?: string;
  senderAddress?: string;
  direction?: 'received' | 'sent';  // メールの方向
  messageDate?: string;  // ISO日時
  organizationName?: string;
  projectName?: string;
}

export interface ClassificationResult {
  documentType: string;    // '見積書' | '契約書' | '請求書' | '仕様書' | '議事録' | '報告書' | 'その他'
  direction: 'received' | 'submitted';
  yearMonth: string;       // 'YYYY-MM'
  suggestedName: string;   // リネーム候補（例: 2026-03-02_見積書_v1.pdf）
  confidence: number;      // 0.0〜1.0
  reasoning: string;       // 判定理由
}

// 書類種別の定義
const DOCUMENT_TYPES = [
  '見積書', '契約書', '請求書', '発注書', '納品書',
  '仕様書', '議事録', '報告書', '提案書', '企画書',
  'その他',
] as const;

// ========================================
// メイン分類関数
// ========================================

export async function classifyFile(input: ClassificationInput): Promise<ClassificationResult> {
  // デフォルト値（AI呼び出し失敗時のフォールバック）
  const fallback = buildFallbackResult(input);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[FileClassification] ANTHROPIC_API_KEY未設定、フォールバック使用');
    return fallback;
  }

  try {
    const client = new Anthropic({ apiKey });

    const prompt = buildClassificationPrompt(input);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: `あなたはビジネス文書の分類エキスパートです。ファイル名やメール情報から書類の種類を判定してください。
必ず以下のJSON形式のみで回答してください（余計なテキストは不要）。

{
  "documentType": "見積書|契約書|請求書|発注書|納品書|仕様書|議事録|報告書|提案書|企画書|その他",
  "direction": "received|submitted",
  "yearMonth": "YYYY-MM",
  "suggestedName": "YYYY-MM-DD_種別_元ファイル名.拡張子",
  "confidence": 0.0-1.0,
  "reasoning": "判定理由（1行）"
}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // JSON解析（コードブロック除去対応）
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // バリデーション
    const result: ClassificationResult = {
      documentType: DOCUMENT_TYPES.includes(parsed.documentType) ? parsed.documentType : 'その他',
      direction: parsed.direction === 'submitted' ? 'submitted' : 'received',
      yearMonth: isValidYearMonth(parsed.yearMonth) ? parsed.yearMonth : fallback.yearMonth,
      suggestedName: sanitizeFileName(parsed.suggestedName || fallback.suggestedName),
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0)),
      reasoning: (parsed.reasoning || '').slice(0, 200),
    };

    return result;
  } catch (error) {
    console.error('[FileClassification] AI分類エラー:', error);
    return fallback;
  }
}

// ========================================
// プロンプト構築
// ========================================

function buildClassificationPrompt(input: ClassificationInput): string {
  const parts: string[] = [];

  parts.push(`ファイル名: ${input.fileName}`);

  if (input.mimeType) {
    parts.push(`MIMEタイプ: ${input.mimeType}`);
  }

  if (input.emailSubject) {
    parts.push(`メール件名: ${input.emailSubject}`);
  }

  if (input.emailBody) {
    // 本文は先頭200文字のみ
    parts.push(`メール本文（先頭）: ${input.emailBody.slice(0, 200)}`);
  }

  if (input.senderName) {
    parts.push(`送信者: ${input.senderName}${input.senderAddress ? ` (${input.senderAddress})` : ''}`);
  }

  if (input.direction) {
    parts.push(`メール方向: ${input.direction === 'sent' ? '送信（こちらから送った）' : '受信（相手からもらった）'}`);
  }

  if (input.messageDate) {
    parts.push(`日時: ${input.messageDate}`);
  }

  if (input.organizationName) {
    parts.push(`相手組織: ${input.organizationName}`);
  }

  if (input.projectName) {
    parts.push(`プロジェクト: ${input.projectName}`);
  }

  parts.push('');
  parts.push('上記の情報から以下を判定してください:');
  parts.push('1. documentType: 書類の種別');
  parts.push('2. direction: received（受領）or submitted（提出）。メール方向が「受信」なら received、「送信」なら submitted');
  parts.push('3. yearMonth: この書類が属する年月（YYYY-MM形式）。日時やファイル名から判断');
  parts.push('4. suggestedName: リネーム候補。形式: YYYY-MM-DD_種別_元ファイル名.拡張子');
  parts.push('5. confidence: 判定の確信度（0.0〜1.0）');
  parts.push('6. reasoning: 判定理由（日本語で簡潔に）');

  return parts.join('\n');
}

// ========================================
// フォールバック（AI不使用の簡易分類）
// ========================================

function buildFallbackResult(input: ClassificationInput): ClassificationResult {
  const fileName = input.fileName;
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // ファイル名からキーワードベースで種別推定
  let documentType = 'その他';
  const lower = fileName.toLowerCase() + ' ' + (input.emailSubject || '').toLowerCase();

  if (lower.includes('見積') || lower.includes('estimate') || lower.includes('quotation')) {
    documentType = '見積書';
  } else if (lower.includes('契約') || lower.includes('contract')) {
    documentType = '契約書';
  } else if (lower.includes('請求') || lower.includes('invoice')) {
    documentType = '請求書';
  } else if (lower.includes('発注') || lower.includes('order')) {
    documentType = '発注書';
  } else if (lower.includes('納品') || lower.includes('delivery')) {
    documentType = '納品書';
  } else if (lower.includes('仕様') || lower.includes('spec')) {
    documentType = '仕様書';
  } else if (lower.includes('議事') || lower.includes('minutes')) {
    documentType = '議事録';
  } else if (lower.includes('報告') || lower.includes('report')) {
    documentType = '報告書';
  } else if (lower.includes('提案') || lower.includes('proposal')) {
    documentType = '提案書';
  } else if (lower.includes('企画') || lower.includes('planning')) {
    documentType = '企画書';
  }

  // 方向判定
  const direction: 'received' | 'submitted' =
    input.direction === 'sent' ? 'submitted' : 'received';

  // 年月判定
  const yearMonth = extractYearMonth(input.messageDate, fileName);

  // 日付部分
  const dateStr = input.messageDate
    ? toJSTDateString(new Date(input.messageDate))
    : getTodayJST();

  const suggestedName = `${dateStr}_${documentType}_${baseName}${ext}`;

  return {
    documentType,
    direction,
    yearMonth,
    suggestedName: sanitizeFileName(suggestedName),
    confidence: documentType === 'その他' ? 0.3 : 0.5,
    reasoning: 'キーワードベースの簡易分類（AI未使用）',
  };
}

// ========================================
// ヘルパー
// ========================================

function extractYearMonth(messageDate?: string, fileName?: string): string {
  // 1. メール日時から
  if (messageDate) {
    try {
      const d = new Date(messageDate);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    } catch { /* ignore */ }
  }

  // 2. ファイル名から日付パターンを検出
  if (fileName) {
    // YYYY-MM-DD, YYYYMMDD, YYYY_MM_DD パターン
    const patterns = [
      /(\d{4})-(\d{2})-\d{2}/,
      /(\d{4})(\d{2})\d{2}/,
      /(\d{4})_(\d{2})_\d{2}/,
    ];
    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        if (year >= 2020 && year <= 2030 && month >= 1 && month <= 12) {
          return `${year}-${String(month).padStart(2, '0')}`;
        }
      }
    }
  }

  // 3. 今月
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isValidYearMonth(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  return year >= 2020 && year <= 2030 && month >= 1 && month <= 12;
}

function sanitizeFileName(name: string): string {
  // Driveで使えない文字を除去
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}
