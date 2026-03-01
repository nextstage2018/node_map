import {
  UnifiedMessage,
  AiDraftResponse,
  Task,
  TaskPhase,
  AiConversationMessage,
  TaskAiChatResponse,
  ThreadMessage,
  ConversationTag,
} from '@/lib/types';

/**
 * AI連携サービス
 * Anthropic Claude APIを使用して返信下書き等を生成する
 */

function getApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || '';
}

/**
 * 返信下書きに渡す追加コンテキスト
 */
export interface ReplyContext {
  contactContext?: {
    notes: string;
    aiContext: string;
    companyName: string;
    department: string;
    relationshipType: string;
  };
  recentMessages?: string[];
  threadContext?: string;
}

/**
 * メッセージに対するAI返信下書きを生成
 * コンタクト情報・過去のやり取り・スレッド文脈を含めて生成
 */
export async function generateReplyDraft(
  message: UnifiedMessage,
  instruction?: string,
  context?: ReplyContext
): Promise<AiDraftResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return getDemoDraft(message, instruction);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // --- チャネル別のトーン指示 ---
    const channelTone: Record<string, string> = {
      email: 'フォーマルなビジネスメール。適切な挨拶・締めの言葉を含める。',
      slack: 'やや柔軟でカジュアル。適度にフレンドリーに。長い挨拶は不要。',
      chatwork: '標準的なビジネストーン。簡潔で読みやすく。',
    };

    // --- コンタクト情報からの指示を構築 ---
    const contactParts: string[] = [];
    if (context?.contactContext) {
      const cc = context.contactContext;
      if (cc.companyName) contactParts.push(`相手の会社: ${cc.companyName}`);
      if (cc.department) contactParts.push(`部署: ${cc.department}`);
      if (cc.relationshipType) contactParts.push(`関係性: ${cc.relationshipType}`);
      if (cc.notes) contactParts.push(`メモ（口調・関係性などの情報）:\n${cc.notes}`);
      if (cc.aiContext) contactParts.push(`AI分析による相手の特徴:\n${cc.aiContext}`);
    }

    // --- システムプロンプト ---
    let systemPrompt = `あなたはビジネスメッセージの返信を下書きするアシスタントです。

## 基本ルール
- 日本のビジネスマナーに沿った文面
- 簡潔かつ要点を押さえた内容
- 元のメッセージの文脈を踏まえた返信

## チャネル別トーン
${channelTone[message.channel] || channelTone.email}`;

    if (contactParts.length > 0) {
      systemPrompt += `

## 相手の情報（重要：この情報を踏まえて口調や内容を調整してください）
${contactParts.join('\n')}`;
    }

    if (context?.recentMessages && context.recentMessages.length > 0) {
      systemPrompt += `

## 過去のやり取り（直近のメッセージ。文脈を把握してください）
${context.recentMessages.join('\n')}`;
    }

    // --- ユーザープロンプト ---
    let userPrompt = `以下のメッセージに対する返信を下書きしてください。

【チャネル】${message.channel}
【送信者】${message.from.name}
【件名】${message.subject || 'なし'}
【本文】
${message.body}`;

    if (context?.threadContext) {
      userPrompt += `

【スレッド内の過去の会話】
${context.threadContext}`;
    }

    if (instruction) {
      userPrompt += `

【追加指示】${instruction}`;
    }

    userPrompt += `

返信文のみを出力してください（「以下は返信案です」などの前置きは不要です）。`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
 * Phase 17: ユーザーメッセージの会話タグをルールベースで分類する
 * APIコール不要で高速に分類できる
 */
function classifyConversationTag(userMessage: string): ConversationTag {
  const msg = userMessage.toLowerCase();

  // 情報収集: 「〜とは」「教えて」「知りたい」「調べて」「事例」
  if (/とは[何？?]|教えて|知りたい|調べ|事例|どういう意味|具体的に|どんな/.test(msg)) {
    return '情報収集';
  }

  // 判断相談: 「どちらが」「どっちが」「迷って」「判断」「選ぶ」「比較」
  if (/どちらが|どっちが|迷って|判断|選[ぶべ]|比較|メリット|デメリット|ベスト|おすすめ/.test(msg)) {
    return '判断相談';
  }

  // 壁の突破: 「うまくいかない」「詰まって」「行き詰」「困って」「エラー」「問題」
  if (/うまくいかない|詰ま[っり]|行き詰|困って|エラー|問題が|失敗|原因|解決|なぜ.*ない|どうすれば/.test(msg)) {
    return '壁の突破';
  }

  // アウトプット生成: 「作って」「書いて」「生成」「作成」「ドラフト」
  if (/作って|書いて|生成|作成|ドラフト|下書き|テンプレ|文面|資料を|出力/.test(msg)) {
    return 'アウトプット生成';
  }

  // 確認・検証: 「合ってる」「確認」「チェック」「レビュー」「正しい」
  if (/合って[るい]|確認|チェック|レビュー|正し[いく]|大丈夫|問題ない|OK[？?]|いい[？?]/.test(msg)) {
    return '確認・検証';
  }

  // 整理・構造化: 「整理」「まとめ」「構造化」「分類」「リスト」
  if (/整理|まとめ|構造化|分類|リスト[化に]|体系|棚卸|振り返|要約/.test(msg)) {
    return '整理・構造化';
  }

  return 'その他';
}

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

  // Phase 17: ルールベースでタグ分類（API不要）
  const conversationTag = classifyConversationTag(userMessage);

  if (!apiKey) {
    return { ...getDemoTaskChat(task, userMessage, phase), conversationTag };
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const phaseInstructions: Record<TaskPhase, string> = {
      ideation: `あなたはタスク完成までの「伴走パートナー」です。現在は「構想フェーズ」です。
ユーザーがタスクのゴール・やるべきこと・懸念点を明確にするのを手伝ってください。

振る舞い:
- 種（元のアイデアメモ）の文脈を踏まえて会話する
- 誘導質問は1〜2問に留める（多すぎると面倒になる）
- ゴール、やるべきこと、懸念点、期限を引き出す
- 曖昧な部分を具体化する質問をする
- 構想がまとまったら「進行フェーズに移りましょう」と促す`,
      progress: `あなたはタスク完成までの「伴走パートナー」です。現在は「進行フェーズ」です。
ユーザーが実際に作業を進める中で、壁打ち相手・相談役として機能してください。

振る舞い:
- 構想フェーズで決めたゴールと内容を常に意識する
- 進捗や気づきを整理して記録する
- 壁にぶつかったら突破のヒントを提案する
- 新しい発見や方向転換を歓迎する
- 押しつけがましくならず、聞かれたら的確に答える
- 必要に応じて「次にやるべきこと」を提案する`,
      result: `あなたはタスク完成までの「伴走パートナー」です。現在は「結果フェーズ」です。
ユーザーが成果をまとめて完了するのを支援してください。

振る舞い:
- 構想フェーズのゴールと実際の結果を比較する
- 達成できたこと・できなかったことを整理する
- 学びや次のアクションを引き出す
- 「結果をまとめますか？」と促す
- 自動で要約を生成する`,
    };

    // タスク情報に加え、種からの経緯も含めて文脈を構築
    const contextParts = [
      `タスク情報:`,
      `- タイトル: ${task.title}`,
      `- 説明: ${task.description}`,
    ];
    if (task.ideationSummary) contextParts.push(`- 構想メモ:\n${task.ideationSummary}`);
    if (task.seedId) contextParts.push(`- ※このタスクは「種ボックス」のアイデアから生まれたものです。種での検討内容が構想メモに反映されています。`);
    if ((task as any).dueDate) contextParts.push(`- 期限: ${(task as any).dueDate}`);

    const systemPrompt = `${phaseInstructions[phase]}\n\n${contextParts.join('\n')}`;

    // Claude APIのメッセージ形式に変換（system は別パラメータ）
    const messages = [
      ...conversationHistory.slice(-10).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : '';

    return { reply, conversationTag };
  } catch (error) {
    console.error('タスクAI会話エラー:', error);
    return { ...getDemoTaskChat(task, userMessage, phase), conversationTag };
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
