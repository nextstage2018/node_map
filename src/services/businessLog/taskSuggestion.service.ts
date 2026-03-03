// Phase 55+56: 会議メモからAIタスク提案サービス（親子構造＋担当者抽出）
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export interface TaskSuggestion {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ChildTaskSuggestion extends TaskSuggestion {
  assigneeName?: string;
  assigneeContactId?: string;
}

export interface ParentChildSuggestion {
  parentTask: {
    title: string;
    description: string;
  };
  childTasks: ChildTaskSuggestion[];
}

/**
 * 会議メモの内容から親タスク＋子タスクを抽出
 * 参加者名からコンタクトとの紐づけも推定する
 */
export async function suggestTasksWithStructure(
  content: string,
  projectName?: string | null,
  participantNames?: string[]
): Promise<ParentChildSuggestion | null> {
  if (!content || !content.trim()) return null;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[TaskSuggestion] ANTHROPIC_API_KEY未設定');
    return null;
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const participantContext = participantNames && participantNames.length > 0
      ? `\n\n参加者: ${participantNames.join(', ')}`
      : '';

    const systemPrompt = `あなたはビジネスミーティングの内容から、プロジェクト全体のタスクと個別のアクション項目を抽出するアシスタントです。

会議メモや議事録を読み、以下の構造で回答してください:
- parentTask: 会議全体の目的やテーマを表す1つの親タスク
- childTasks: 具体的なアクション項目（最大5件）。担当者が分かる場合はassigneeNameに名前を入れる

ルール:
- 各タスクは具体的で実行可能なものにする
- 優先度はhigh/medium/lowで判定
- 決定事項、依頼事項、確認事項を重点的に抽出
- 担当者名がメモ内に記載されていれば抽出する。不明なら空文字
- 日本語で回答

JSONで回答:
{
  "parentTask": { "title": "全体テーマ", "description": "概要" },
  "childTasks": [
    { "title": "タスク名", "description": "詳細", "priority": "high", "assigneeName": "担当者名" }
  ]
}`;

    const userMessage = [
      projectName ? `プロジェクト「${projectName}」の会議メモ:` : '会議メモ:',
      participantContext,
      '',
      content,
    ].join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(cleaned) as ParentChildSuggestion;

    // バリデーション
    if (!result.parentTask?.title || !Array.isArray(result.childTasks)) {
      return null;
    }

    return {
      parentTask: {
        title: result.parentTask.title,
        description: result.parentTask.description || '',
      },
      childTasks: result.childTasks.slice(0, 5).map((c) => ({
        title: c.title || '',
        description: c.description || '',
        priority: ['high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium',
        assigneeName: c.assigneeName || '',
      })),
    };
  } catch (error) {
    console.error('[TaskSuggestion] AI提案エラー:', error);
    return null;
  }
}

/**
 * 担当者名からcontact_personsをマッチングする
 */
export async function matchContactByName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  name: string
): Promise<string | null> {
  if (!name || !name.trim()) return null;

  const cleanName = name.replace(/さん$|様$|氏$/, '').trim();
  if (!cleanName) return null;

  // 完全一致
  const { data: exact } = await supabase
    .from('contact_persons')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', cleanName)
    .limit(1);

  if (exact && exact.length > 0) return exact[0].id;

  // 部分一致
  const { data: partial } = await supabase
    .from('contact_persons')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', `%${cleanName}%`)
    .limit(1);

  if (partial && partial.length > 0) return partial[0].id;

  return null;
}

/**
 * 旧互換: フラットなタスク提案（Phase 55互換）
 */
export async function suggestTasksFromMeeting(
  content: string,
  projectName?: string | null
): Promise<TaskSuggestion[]> {
  const result = await suggestTasksWithStructure(content, projectName);
  if (!result) return [];
  return result.childTasks.map((c) => ({
    title: c.title,
    description: c.description,
    priority: c.priority,
  }));
}
