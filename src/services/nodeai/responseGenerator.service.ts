// NodeAI: Claude AI 応答生成サービス
// 会議中の質問に対して簡潔な応答を生成する

import Anthropic from '@anthropic-ai/sdk';
import { buildProjectContext } from './contextBuilder.service';
import { getRecentContext } from './sessionManager.service';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
// 会議中はスピード最優先 → Haiku（高速・低コスト）
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 150; // 会話に最適な短さ

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

function buildSystemPrompt(
  ctx: ProjectContextData,
  relationshipType: string,
  recentContext: string
): string {
  const publicLevel = relationshipType === 'internal'
    ? '全情報を回答可能（未確定事項・上長フィードバック含む）'
    : '未確定事項(open_issues)・上長フィードバックは非公開。決定事項・タスク進捗のみ回答';

  // 公開レベルに応じてコンテキストをフィルタ
  let projectInfo = `
【プロジェクト】${ctx.projectName}（${ctx.organizationName}）

【タスク状況】
${ctx.tasks}

【決定事項】
${ctx.decisions}

【マイルストーン】
${ctx.milestones}`;

  if (relationshipType === 'internal') {
    projectInfo += `

【未確定事項】
${ctx.openIssues}`;

    if (ctx.bossFeedback) {
      projectInfo += `

【上長フィードバック・学習ポイント】
${ctx.bossFeedback}`;
    }
  }

  return `あなたはNodeAI。会議中のAIアシスタント。呼びかけに簡潔に応答する。

${projectInfo}

【応答ルール】
- 1〜2文、最大80文字。音声で聞いて自然な日本語
- 「えーと」「〜ですね」など口語的な表現OK。硬すぎない
- 数字・ファクトを優先。「3件中2件完了」のように具体的に
- データがなければ一般知識で補完
- 質問者の名前で呼びかける
- 公開レベル: ${relationshipType}。${publicLevel}

${recentContext ? recentContext : ''}`;
}
