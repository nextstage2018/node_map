// Phase 55: 会議メモからAIタスク提案サービス
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export interface TaskSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 会議メモの内容からアクション項目を抽出し、タスク候補を提案する
 */
export async function suggestTasksFromMeeting(
  content: string,
  projectName?: string | null
): Promise<TaskSuggestion[]> {
  if (!content || !content.trim()) return [];
  if (!ANTHROPIC_API_KEY) {
    console.warn('[TaskSuggestion] ANTHROPIC_API_KEY未設定');
    return [];
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const systemPrompt = `あなたはビジネスミーティングの内容からアクション項目（次にやるべきこと）を抽出するアシスタントです。
会議メモや議事録の内容を読み、具体的なタスクとして実行可能なアクション項目を抽出してください。

ルール:
- 最大5件まで
- 各タスクは具体的で実行可能なものにする
- 優先度はhigh/medium/lowで判定
- 決定事項、依頼事項、確認事項を重点的に抽出
- 日本語で回答

JSON配列で回答してください:
[{"title": "タスクタイトル", "description": "詳細説明", "priority": "high|medium|low"}]`;

    const userMessage = projectName
      ? `プロジェクト「${projectName}」の会議メモ:\n\n${content}`
      : `会議メモ:\n\n${content}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // JSON解析（コードブロック除去）
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const suggestions: TaskSuggestion[] = JSON.parse(cleaned);

    return suggestions.slice(0, 5).map((s) => ({
      title: s.title || '',
      description: s.description || '',
      priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
    }));
  } catch (error) {
    console.error('[TaskSuggestion] AI提案エラー:', error);
    return [];
  }
}
