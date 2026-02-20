import {
  UnifiedMessage,
  AiDraftResponse,
  Task,
  TaskPhase,
  AiConversationMessage,
  TaskAiChatResponse,
  ThreadMessage,
} from '@/lib/types';

/**
 * AI連携サービス
 * Anthropic Claude APIを使用して返信下書き等を生成する
 */

function getApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || '';
}

/**
 * メッセージに対するAI返信下書きを生成
 */
export async function generateReplyDraft(
  message: UnifiedMessage,
  instruction?: string
): Promise<AiDraftResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoDraft(message, instruction);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const systemPrompt = `あなたはビジネスメッセージの返信を下書きするアシスタントです。
以下のルールに従ってください：
- 日本のビジネスマナーに沿った丁寧な文面
- 簡潔かつ要点を押さえた内容
- 元のメッセージの文脈を踏まえた返信
- チャネルに応じた適切なトーン（メール=フォーマル、Slack=やや柔軟、Chatwork=標準）`;

    const userPrompt = `以下のメッセージに対する返信を下書きしてください。

【チャネル】${message.channel}
【送信者】${message.from.name}
【件名】${message.subject || 'なし'}
【本文】
${message.body}

${instruction ? `【追加指示】${instruction}` : ''}

返信文のみを出力してください（「以下は返信案です」などの前置きは不要です）。`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const draft = response.content[0]?.type === 'text' ? response.content[0].text : '';

    return {
      draft,
      suggestions: ['より丁寧に', 'より簡潔に', '日程を提案'],
    };
  } catch (error) {
    console.error('AI下書き生成エラー:', error);
    return getDemoDraft(message, instruction);
  }
}

/**
 * デモ用AI下書き
 */
function getDemoDraft(message: UnifiedMessage, instruction?: string): AiDraftResponse {
  const senderName = message.from.name;

  const drafts: Record<string, string> = {
    email: `${senderName}様

お疲れ様です。
ご連絡ありがとうございます。

内容、承知いたしました。
確認の上、改めてご連絡させていただきます。

何卒よろしくお願いいたします。`,

    slack: `${senderName}さん
ありがとうございます！確認しました。
対応しますので少々お待ちください。`,

    chatwork: `${senderName}さん
ご連絡ありがとうございます。
内容確認いたしました。対応いたします。`,
  };

  return {
    draft: drafts[message.channel] || drafts.email,
    suggestions: ['より丁寧に', 'より簡潔に', '日程を提案'],
  };
}

// ===== スレッド要約 =====

/**
 * メールスレッドの要約を生成（3行要約）
 */
export async function generateThreadSummary(
  subject: string,
  threadMessages: ThreadMessage[]
): Promise<string> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoThreadSummary(subject, threadMessages);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const conversationText = threadMessages
      .map((m) => {
        const dateLabel = m.timestamp ? formatDateForSummary(m.timestamp) : '';
        return `[${dateLabel}] ${m.from.name}: ${m.body}`;
      })
      .join('\n---\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: `あなたはメールスレッドの要約を生成するアシスタントです。
以下のルールに従ってください：
- 日付ごとに時系列で要約する
- 出力フォーマットは必ず以下の形式にする：

・M/D
  - 要約文（誰が何をした/決まったこと）
・M/D
  - 要約文

- 同じ日付の出来事は同じ日付の下にまとめる
- 各要約文は1行で簡潔に（30文字以内目安）
- 「誰が」を主語に含める
- 日本語で出力する
- 日付はスレッド内のメッセージのタイムスタンプから判断する`,
      messages: [
        {
          role: 'user',
          content: `以下のメールスレッドを日付ごとの時系列で要約してください。

【件名】${subject}
【やり取り】
${conversationText}`,
        },
      ],
    });

    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  } catch (error) {
    console.error('スレッド要約生成エラー:', error);
    return getDemoThreadSummary(subject, threadMessages);
  }
}

/**
 * 要約用の日付フォーマット（M/D形式）
 */
function formatDateForSummary(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}

/**
 * デモ用スレッド要約（時系列フォーマット）
 */
function getDemoThreadSummary(subject: string, threadMessages: ThreadMessage[]): string {
  // 日付ごとにグループ化
  const dateGroups = new Map<string, string[]>();
  for (const msg of threadMessages) {
    const dateKey = formatDateForSummary(msg.timestamp) || '不明';
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    const action = msg.body.substring(0, 25).replace(/\n/g, ' ');
    dateGroups.get(dateKey)!.push(`${msg.from.name}が${action}...`);
  }

  const lines: string[] = [];
  for (const [date, actions] of Array.from(dateGroups.entries())) {
    lines.push(`・${date}`);
    // 同一日付は最初の2件まで
    for (const action of actions.slice(0, 2)) {
      lines.push(`  - ${action}`);
    }
    if (actions.length > 2) {
      lines.push(`  - 他${actions.length - 2}件のやり取り`);
    }
  }
  return lines.join('\n');
}

// ===== Phase 2: タスクAI会話 =====

/**
 * タスク内AI会話の応答を生成
 */
export async function generateTaskChat(
  task: Task,
  userMessage: string,
  phase: TaskPhase,
  conversationHistory: AiConversationMessage[]
): Promise<TaskAiChatResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoTaskChat(task, userMessage, phase);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const phaseInstructions: Record<TaskPhase, string> = {
      ideation: `あなたはタスクの「構想フェーズ」のアシスタントです。
ユーザーがタスクのゴールイメージや関連要素を整理するのを手伝ってください。
- 誘導質問は1〜2問に留める（多すぎると面倒になる）
- ゴール、関連要素、懸念点を引き出す
- 構想がまとまったら簡潔に要約する
- 「進行フェーズに移りましょう」と促す`,
      progress: `あなたはタスクの「進行フェーズ」のアシスタントです。
ユーザーが自由に作業を進める中で、聞き手・メモ役として機能してください。
- 進捗や気づきを記録する
- 質問には的確に答える
- 新しい発見や方向転換を歓迎する
- 押しつけがましくならない
- 必要に応じて整理を手伝う`,
      result: `あなたはタスクの「結果フェーズ」のアシスタントです。
ユーザーが最終的なアウトプットや判断を記録して完了するのを支援してください。
- 「結果をまとめますか？」と促す
- 構想フェーズとの差分を指摘する
- 自動で要約を生成する
- 学びや次のアクションを整理する`,
    };

    const systemPrompt = `${phaseInstructions[phase]}

タスク情報:
- タイトル: ${task.title}
- 説明: ${task.description}
${task.ideationSummary ? `- 構想要約: ${task.ideationSummary}` : ''}`;

    // Claude APIのメッセージ形式に変換（system は別パラメータ）
    const messages = [
      ...conversationHistory.slice(-10).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : '';

    return { reply };
  } catch (error) {
    console.error('タスクAI会話エラー:', error);
    return getDemoTaskChat(task, userMessage, phase);
  }
}

/**
 * デモ用タスクAI会話
 */
function getDemoTaskChat(
  task: Task,
  userMessage: string,
  phase: TaskPhase
): TaskAiChatResponse {
  const demoReplies: Record<TaskPhase, string[]> = {
    ideation: [
      `なるほど、「${userMessage.slice(0, 20)}...」ですね。\n\n関連しそうな要素や、気になるポイントはありますか？`,
      `了解しました。構想をまとめますね。\n\n【ゴール】${task.title}の完了\n【キーポイント】${userMessage.slice(0, 30)}\n\nそれでは作業を進めましょう！気になったことがあれば、いつでも話しかけてください。`,
    ],
    progress: [
      `いい進捗ですね！「${userMessage.slice(0, 20)}...」について、もう少し詳しく教えていただけますか？`,
      `メモしておきますね。他に気づいたことや、迷っていることはありますか？`,
      `なるほど、重要なポイントですね。これは最終的な結果にも影響しそうです。`,
    ],
    result: [
      `お疲れ様でした！結果をまとめますね。\n\n【結果】${userMessage.slice(0, 40)}\n【構想との比較】当初の計画に対して、おおむね達成できたようです。\n\nこの内容でタスクを完了にしますか？`,
      `素晴らしい成果ですね。学びや次のアクションがあれば教えてください。要約に追加します。`,
    ],
  };

  const options = demoReplies[phase];
  const reply = options[Math.floor(Math.random() * options.length)];

  return { reply };
}

/**
 * タスク結果の自動要約を生成
 */
export async function generateTaskSummary(task: Task): Promise<string> {
  const apiKey = getApiKey();

  if (!apiKey) {
    // デモ用要約
    return `【結論】${task.title}を完了\n【プロセス】構想→進行→結果の3フェーズで進行\n【学び】タスク内のAI会話を通じて整理ができた`;
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const conversationText = task.conversations
      .map((c) => `[${c.role}] ${c.content}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 500,
      system: `タスクの会話履歴から、結果の要約を生成してください。
以下のフォーマットで出力:
【結論】...
【プロセス】...
【学び】...
【次のアクション】...（あれば）`,
      messages: [
        {
          role: 'user',
          content: `タスク: ${task.title}\n構想要約: ${task.ideationSummary || 'なし'}\n\n会話履歴:\n${conversationText}`,
        },
      ],
    });

    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  } catch {
    return `【結論】${task.title}を完了`;
  }
}
