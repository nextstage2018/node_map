// NodeAI: Claude AI 応答生成サービス
// 会議中の質問に対して簡潔な応答を生成する

import Anthropic from '@anthropic-ai/sdk';
import { buildProjectContext, getCachedProjectContext } from './contextBuilder.service';
import { getRecentContext } from './sessionManager.service';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
// 会議中はスピード最優先 → Haiku（高速・低コスト）
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 120; // 短い応答 = 高速レスポンス + 高速TTS

// ========================================
// 型定義
// ========================================

interface GenerateResponseParams {
  botId: string;
  projectId: string;
  question: string;
  speakerName: string;
  speakerContactId?: string;
  relationshipType: 'internal' | 'client' | 'partner';
}

interface GenerateResponseFastParams extends GenerateResponseParams {
  recentContext: string; // snapshotから取得済み → DB再読み不要
}

interface GenerateResponseResult {
  text: string;
  success: boolean;
  error?: string;
}

// ========================================
// メイン関数
// ========================================

/**
 * 会議中の質問に対してClaude AIで応答を生成
 */
export async function generateResponse(
  params: GenerateResponseParams
): Promise<GenerateResponseResult> {
  const { botId, projectId, question, speakerName, relationshipType } = params;

  if (!ANTHROPIC_API_KEY) {
    return { text: '申し訳ありません、AI機能が設定されていません。', success: false, error: 'No API key' };
  }

  try {
    // プロジェクトコンテキストと会話バッファを並列取得
    const [projectContext, recentContext] = await Promise.all([
      buildProjectContext(projectId),
      getRecentContext(botId),
    ]);

    if (!projectContext) {
      return {
        text: 'プロジェクト情報を取得できませんでした。',
        success: false,
        error: 'No project context',
      };
    }

    // システムプロンプト構築
    const systemPrompt = buildSystemPrompt(projectContext, relationshipType, recentContext);

    // Claude API 呼び出し
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${speakerName}さんの質問: ${question}`,
        },
      ],
    });

    // テキスト応答を抽出
    const textBlock = message.content.find((b) => b.type === 'text');
    const responseText = textBlock?.text || '申し訳ありません、回答を生成できませんでした。';

    return { text: responseText, success: true };
  } catch (err) {
    console.error('[NodeAI] Response generation failed:', err);
    return {
      text: '一時的にデータの取得ができませんでした。少し経ってからもう一度お声がけください。',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 高速版: キャッシュ付きコンテキスト + recentContextを外部から受け取る
 * Webhook v2で使用。DB再読みを最小化。
 */
export async function generateResponseFast(
  params: GenerateResponseFastParams
): Promise<GenerateResponseResult> {
  const { projectId, question, speakerName, relationshipType, recentContext } = params;

  if (!ANTHROPIC_API_KEY) {
    return { text: '申し訳ありません、AI機能が設定されていません。', success: false, error: 'No API key' };
  }

  try {
    // キャッシュ付きコンテキスト取得（5分TTL、ヒット時はDB不要）
    const t1 = Date.now();
    const projectContext = await getCachedProjectContext(projectId);
    console.log(`[NodeAI:perf] getCachedProjectContext: ${Date.now() - t1}ms`);

    if (!projectContext) {
      return {
        text: 'プロジェクト情報を取得できませんでした。',
        success: false,
        error: 'No project context',
      };
    }

    // システムプロンプト構築
    const systemPrompt = buildSystemPrompt(projectContext, relationshipType, recentContext);

    // Claude API 呼び出し
    const t2 = Date.now();
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${speakerName}さんの質問: ${question}`,
        },
      ],
    });
    console.log(`[NodeAI:perf] Claude API: ${Date.now() - t2}ms`);

    const textBlock = message.content.find((b) => b.type === 'text');
    const responseText = textBlock?.text || '申し訳ありません、回答を生成できませんでした。';

    return { text: responseText, success: true };
  } catch (err) {
    console.error('[NodeAI] Response generation failed:', err);
    return {
      text: '一時的にデータの取得ができませんでした。少し経ってからもう一度お声がけください。',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ========================================
// プロンプト構築
// ========================================

interface ProjectContextData {
  projectName: string;
  organizationName: string;
  relationshipType: string;
  tasks: string;
  decisions: string;
  openIssues: string;
  milestones: string;
  bossFeedback: string;
}

// ========================================
// 名前正規化
// ========================================

/**
 * フルネームから姓のみを抽出（音声読み上げ用）
 * 「伸二鈴木」→「鈴木」、「鈴木 伸二」→「鈴木」、「Suzuki Shinji」→「Suzuki」
 * 判定できない場合はそのまま返す
 */
export function extractFamilyName(fullName: string): string {
  if (!fullName) return '参加者';
  const trimmed = fullName.trim();

  // スペース区切りの場合（「鈴木 伸二」or「Shinji Suzuki」）
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) {
    // 日本語名: 最初が姓の可能性が高い
    // 英語名: 最後が姓の可能性が高い
    const firstIsJapanese = /[\u3000-\u9FFF]/.test(parts[0]);
    return firstIsJapanese ? parts[0] : parts[parts.length - 1];
  }

  // スペースなし日本語（「伸二鈴木」「鈴木伸二」）
  // 2文字以上の漢字が連続する場合、姓名の境界を推定
  if (/^[\u4E00-\u9FFF]{3,}$/.test(trimmed)) {
    // よくある日本の姓（2文字）を後方からチェック
    const commonFamilyNames = [
      '鈴木', '佐藤', '田中', '山田', '渡辺', '伊藤', '中村', '小林',
      '加藤', '吉田', '山本', '松本', '井上', '木村', '斎藤', '清水',
      '山口', '橋本', '高橋', '藤田', '谷口', '福田', '横田',
    ];
    // 後方に姓がある場合（「伸二鈴木」パターン）
    for (const name of commonFamilyNames) {
      if (trimmed.endsWith(name)) return name;
    }
    // 前方に姓がある場合（「鈴木伸二」パターン）
    for (const name of commonFamilyNames) {
      if (trimmed.startsWith(name)) return name;
    }
    // 判定できない場合: 先頭2文字を姓として返す
    return trimmed.substring(0, 2);
  }

  return trimmed;
}

// ========================================
// 応答テキストのポスト処理
// ========================================

/**
 * AI応答テキストをTTS読み上げ用にクリーンアップ
 * 書き言葉の記号・フォーマットを除去して自然な音声にする
 */
export function cleanResponseForTTS(text: string): string {
  let cleaned = text;

  // 見出し記号を除去: 【〇〇】→ 〇〇、
  cleaned = cleaned.replace(/【([^】]*)】/g, '$1、');

  // 箇条書き記号を除去
  cleaned = cleaned.replace(/^[\s]*[-・●▶▪︎※]\s*/gm, '');

  // 改行を句点に変換（複数行→1文にまとめる）
  cleaned = cleaned.replace(/\n+/g, '。');

  // 連続する句読点を整理
  cleaned = cleaned.replace(/[。、]{2,}/g, '。');

  // 先頭・末尾の句読点を整理
  cleaned = cleaned.replace(/^[。、\s]+/, '');
  cleaned = cleaned.replace(/[、\s]+$/, '');

  // 末尾に句点がなければ追加（TTS用）
  if (cleaned && !/[。！？!?]$/.test(cleaned)) {
    cleaned += '。';
  }

  return cleaned.trim();
}

// ========================================
// プロンプト構築
// ========================================

function buildSystemPrompt(
  ctx: ProjectContextData,
  relationshipType: string,
  recentContext: string
): string {
  // 公開レベルに応じてコンテキストをフィルタ
  let projectInfo = `PJ: ${ctx.projectName}
タスク: ${ctx.tasks}
決定事項: ${ctx.decisions}
MS: ${ctx.milestones}`;

  if (relationshipType === 'internal') {
    projectInfo += `\n未確定: ${ctx.openIssues}`;
    if (ctx.bossFeedback) {
      projectInfo += `\n上長FB: ${ctx.bossFeedback}`;
    }
  }

  const publicNote = relationshipType !== 'internal'
    ? '※社外会議: 未確定事項・上長FBは回答しない。'
    : '';

  return `あなたはNodeAI。会議中に声で呼ばれて声で答えるAIアシスタント。
あなたの応答テキストはそのままTTSエンジンで読み上げられる。日本人の同僚として自然に会話すること。

${projectInfo}
${recentContext || ''}

=== 応答ルール（厳守） ===
- 1〜2文、50文字以内
- 書き言葉禁止: 【】・-・※・箇条書き・改行を絶対に使わない
- 日本人ネイティブが会議で話すような自然な日本語で答える
- 数字やファクトを具体的に。曖昧に濁さない
- 質問者の名前は「さん」付け
- 「了解です」「ありがとう」等のお礼・挨拶には応答しない。沈黙する
${publicNote}

=== 自然な日本語のOK例 ===
Q: 予算どのくらい残ってる？
A: 残り約15万で、月末までに使い切る予定です。

Q: タスクの進捗教えて。
A: 5件中3件終わってます。残りは今週中に片付く見込みですね。

Q: 次の会議いつだっけ？
A: 来週月曜の10時からです。

Q: ありがとうございます。
A:（応答しない）

=== NG例（絶対にやらないこと） ===
NG: 「お気軽にどうぞですね」← 不自然な日本語。「ですね」の乱用禁止
NG: 「ございますですね」「になりますね」← 二重敬語・不自然な語尾
NG: 「何かあればいつでもお声がけください」← 定型的すぎ。会議の同僚はこう話さない
NG: 【予算配分】残予算15万円...  ← 見出し記号禁止
NG: ・Meta広告: 10万 / ・Google: 5万  ← 箇条書き禁止
NG: 3つ以上の情報を列挙する長文  ← 50文字を超える`;
}
