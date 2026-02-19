// タスクサービス（デモモード対応）

import {
  Task,
  TaskPhase,
  TaskStatus,
  TaskPriority,
  AiConversationMessage,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskSuggestion,
  Job,
  JobStatus,
  JobType,
  Seed,
  SeedStatus,
  CreateJobRequest,
  CreateSeedRequest,
} from '@/lib/types';

// === デモデータ ===

const now = new Date();
const h = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();

const demoConversations: AiConversationMessage[] = [
  {
    id: 'conv-1',
    role: 'assistant',
    content: 'このタスクのゴールイメージを教えてください。どんな状態になれば完了ですか？',
    timestamp: h(48),
    phase: 'ideation',
  },
  {
    id: 'conv-2',
    role: 'user',
    content: '来週の月曜までに、提案資料のドラフトを完成させたいです。クライアントの課題整理と解決策の提示が主な内容です。',
    timestamp: h(47.5),
    phase: 'ideation',
  },
  {
    id: 'conv-3',
    role: 'assistant',
    content: '了解しました。提案資料のドラフトですね。関連しそうな要素や、気になるポイントはありますか？',
    timestamp: h(47),
    phase: 'ideation',
  },
  {
    id: 'conv-4',
    role: 'user',
    content: '競合他社の動向と、先方の予算感がまだ把握しきれていないのが気になっています。あと、前回の商談メモも参考にしたいです。',
    timestamp: h(46.5),
    phase: 'ideation',
  },
  {
    id: 'conv-5',
    role: 'assistant',
    content: '構想をまとめますね。\n\n【ゴール】来週月曜までに提案資料ドラフト完成\n【主な内容】クライアント課題整理 + 解決策提示\n【気になる点】競合動向・予算感の把握、前回商談メモの参照\n\nそれでは作業を進めましょう！気になったことや進捗があれば、いつでも話しかけてください。',
    timestamp: h(46),
    phase: 'ideation',
  },
  {
    id: 'conv-6',
    role: 'user',
    content: '競合のA社が似たサービスを出していることがわかりました。差別化ポイントを整理する必要がありそうです。',
    timestamp: h(24),
    phase: 'progress',
  },
  {
    id: 'conv-7',
    role: 'assistant',
    content: 'なるほど、A社の競合サービスですね。差別化ポイントの整理は重要ですね。具体的にどんな違いがありそうですか？',
    timestamp: h(23.5),
    phase: 'progress',
  },
];

const demoTasks: Task[] = [
  {
    id: 'task-1',
    title: 'A社向け提案資料の作成',
    description: '来週月曜のミーティングに向けて、提案資料のドラフトを作成する。クライアントの課題整理と解決策の提示が主な内容。',
    status: 'in_progress',
    priority: 'high',
    phase: 'progress',
    sourceMessageId: 'email-1',
    sourceChannel: 'email',
    conversations: demoConversations,
    ideationSummary: '【ゴール】来週月曜までに提案資料ドラフト完成\n【主な内容】クライアント課題整理 + 解決策提示\n【気になる点】競合動向・予算感の把握、前回商談メモの参照',
    createdAt: h(48),
    updatedAt: h(23.5),
    tags: ['提案', 'A社', '営業'],
  },
  {
    id: 'task-2',
    title: 'Slack通知設定の見直し',
    description: '重要なチャンネルの通知が埋もれている問題を解決する。通知ルールの整理と設定変更。',
    status: 'todo',
    priority: 'medium',
    phase: 'ideation',
    sourceMessageId: 'slack-2',
    sourceChannel: 'slack',
    conversations: [],
    createdAt: h(12),
    updatedAt: h(12),
    tags: ['Slack', '設定'],
  },
  {
    id: 'task-3',
    title: '月次レポートの提出',
    description: '今月の活動報告をまとめて、チームリーダーに提出する。',
    status: 'todo',
    priority: 'high',
    phase: 'ideation',
    conversations: [],
    createdAt: h(6),
    updatedAt: h(6),
    tags: ['レポート', '月次'],
  },
  {
    id: 'task-4',
    title: 'プロジェクト管理ツールの選定',
    description: 'チーム全体で使うプロジェクト管理ツールを選定する。候補はAsana, Notion, Clickup。',
    status: 'done',
    priority: 'medium',
    phase: 'result',
    conversations: [
      {
        id: 'conv-d1',
        role: 'assistant',
        content: 'このタスクのゴールイメージを教えてください。どんな状態になれば完了ですか？',
        timestamp: h(120),
        phase: 'ideation',
      },
      {
        id: 'conv-d2',
        role: 'user',
        content: 'チーム全員が納得できるツールを1つ選んで、導入計画を立てたいです。',
        timestamp: h(119),
        phase: 'ideation',
      },
      {
        id: 'conv-d3',
        role: 'assistant',
        content: '結果をまとめますか？',
        timestamp: h(72),
        phase: 'result',
      },
      {
        id: 'conv-d4',
        role: 'user',
        content: 'Notionに決定しました。UIの直感性とドキュメント管理の強さが決め手です。来週から試験導入します。',
        timestamp: h(71),
        phase: 'result',
      },
    ],
    ideationSummary: '【ゴール】チーム全員が納得できるツールを1つ選んで導入計画を立てる\n【候補】Asana, Notion, Clickup',
    resultSummary: '【結論】Notionに決定\n【理由】UIの直感性とドキュメント管理の強さ\n【次のアクション】来週から試験導入',
    createdAt: h(120),
    updatedAt: h(71),
    completedAt: h(71),
    tags: ['ツール選定', 'チーム'],
  },
  {
    id: 'task-5',
    title: 'Chatworkでの顧客問い合わせ対応',
    description: '田中太郎さんからの納期確認に回答する。在庫状況を確認して返信。',
    status: 'in_progress',
    priority: 'high',
    phase: 'progress',
    sourceMessageId: 'cw-1',
    sourceChannel: 'chatwork',
    conversations: [
      {
        id: 'conv-e1',
        role: 'assistant',
        content: 'このタスクのゴールイメージを教えてください。どんな状態になれば完了ですか？',
        timestamp: h(5),
        phase: 'ideation',
      },
      {
        id: 'conv-e2',
        role: 'user',
        content: '田中さんに正確な納期を回答して、安心してもらうことがゴールです。',
        timestamp: h(4.5),
        phase: 'ideation',
      },
    ],
    ideationSummary: '【ゴール】田中さんに正確な納期を回答して安心してもらう',
    createdAt: h(5),
    updatedAt: h(4.5),
    tags: ['顧客対応', '納期'],
  },
];

const demoSuggestions: TaskSuggestion[] = [
  {
    title: '新サービス企画のフィードバック返信',
    description: '山田花子さんからの新サービス企画に関するメールに返信する。企画書のレビューコメントと承認可否を回答する必要あり。',
    priority: 'medium',
    sourceMessageId: 'email-2',
    sourceChannel: 'email',
    reason: '48時間以上未返信のメールで、相手が返信を待っていると判断されました',
    sourceFrom: '山田花子（yamada@example.co.jp）',
    sourceDate: h(52),
    sourceSubject: '【確認依頼】新サービス企画書v2について',
    sourceExcerpt: 'お疲れ様です。先日お送りした新サービス企画書v2について、ご確認いただけましたでしょうか？来週の役員会議までにフィードバックをいただけると助かります。特に、ターゲット層の設定と価格戦略の部分についてご意見をお聞かせください。',
  },
  {
    title: 'デプロイ手順書の更新',
    description: 'Slackの#dev-opsチャンネルでデプロイ手順の更新依頼があった。CI/CDパイプライン変更に伴い、手順書のStep 3〜5を書き換える必要がある。',
    priority: 'low',
    sourceMessageId: 'slack-1',
    sourceChannel: 'slack',
    reason: '#dev-opsでメンション付きの依頼があり、担当者として対応が期待されています',
    sourceFrom: '佐藤エンジニア（@sato）',
    sourceDate: h(8),
    sourceSubject: undefined,
    sourceExcerpt: '@sjinji CI/CDのパイプラインを先週変更したので、デプロイ手順書のStep 3〜5が古くなっています。次のリリースまでに更新お願いできますか？新しいフローはConfluenceに書いてあります。',
  },
  {
    title: '田中さんへの見積もり回答',
    description: 'Chatworkで田中太郎さんから見積もり依頼が届いている。サービスプランBの月額費用とオプション料金を回答する。',
    priority: 'high',
    sourceMessageId: 'cw-2',
    sourceChannel: 'chatwork',
    reason: '見積もり依頼は商談に直結するため、優先度「高」で提案しています',
    sourceFrom: '田中太郎（株式会社ABC）',
    sourceDate: h(3),
    sourceSubject: undefined,
    sourceExcerpt: 'お世話になっております。先日ご説明いただいたサービスプランBについて、正式な見積もりをいただけますでしょうか。月額費用とオプション（データ分析＋レポート機能）の料金を知りたいです。今週中にいただけると社内稟議に間に合います。',
  },
];

// === デモデータ: ジョブ ===

const demoJobs: Job[] = [
  {
    id: 'job-1',
    type: 'email_reply',
    title: '社内通知メールへの確認返信',
    description: '人事部からの福利厚生制度変更のお知らせメールに「確認しました」と返信する。',
    status: 'proposed',
    priority: 'low',
    draftContent: 'お疲れ様です。福利厚生制度変更のお知らせ、確認いたしました。ご連絡ありがとうございます。',
    sourceMessageId: 'email-3',
    sourceChannel: 'email',
    createdAt: h(4),
    updatedAt: h(4),
  },
  {
    id: 'job-2',
    type: 'document_update',
    title: '週次ミーティング議事録テンプレート更新',
    description: '次回ミーティングの日付と参加者リストをテンプレートに反映する。',
    status: 'draft',
    priority: 'low',
    draftContent: '日付: 2026-02-26\n参加者: 鈴木、田中、佐藤、山田\nアジェンダ: 前回アクションアイテム確認、今週の進捗、来週の予定',
    createdAt: h(2),
    updatedAt: h(2),
  },
  {
    id: 'job-3',
    type: 'routine_admin',
    title: '経費精算の月次締め作業',
    description: '今月分の経費精算データを取りまとめてCSVでエクスポートする。',
    status: 'executed',
    priority: 'medium',
    createdAt: h(72),
    updatedAt: h(24),
    executedAt: h(24),
  },
];

// === デモデータ: 種ボックス ===

const demoSeeds: Seed[] = [
  {
    id: 'seed-1',
    content: '来月の新製品発表に向けた市場調査を進めたい。競合他社のポジショニングと価格帯を整理する必要がある。',
    createdAt: h(1),
    status: 'pending',
  },
  {
    id: 'seed-2',
    content: 'チーム内のナレッジ共有の仕組みを改善したい',
    sourceChannel: 'slack',
    sourceMessageId: 'slack-3',
    createdAt: h(8),
    status: 'pending',
  },
];

// === サービスクラス ===

export class TaskService {
  private static isDemo(): boolean {
    return !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY;
  }

  // タスク一覧取得
  static async getTasks(): Promise<Task[]> {
    if (this.isDemo()) {
      return [...demoTasks].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    // TODO: Supabase連携
    return demoTasks;
  }

  // タスク取得（単体）
  static async getTask(id: string): Promise<Task | null> {
    if (this.isDemo()) {
      return demoTasks.find((t) => t.id === id) || null;
    }
    return null;
  }

  // タスク作成
  static async createTask(req: CreateTaskRequest): Promise<Task> {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: req.title,
      description: req.description,
      status: 'todo',
      priority: req.priority,
      phase: 'ideation',
      sourceMessageId: req.sourceMessageId,
      sourceChannel: req.sourceChannel,
      conversations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: req.tags || [],
    };

    if (this.isDemo()) {
      demoTasks.unshift(newTask);
      return newTask;
    }
    // TODO: Supabase連携
    return newTask;
  }

  // タスク更新
  static async updateTask(id: string, req: UpdateTaskRequest): Promise<Task | null> {
    if (this.isDemo()) {
      const idx = demoTasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;

      const updated = {
        ...demoTasks[idx],
        ...req,
        updatedAt: new Date().toISOString(),
      };

      if (req.status === 'done' && !updated.completedAt) {
        updated.completedAt = new Date().toISOString();
      }

      demoTasks[idx] = updated;
      return updated;
    }
    return null;
  }

  // 会話メッセージ追加
  static async addConversation(
    taskId: string,
    message: Omit<AiConversationMessage, 'id' | 'timestamp'>
  ): Promise<AiConversationMessage | null> {
    const task = demoTasks.find((t) => t.id === taskId);
    if (!task) return null;

    const newMsg: AiConversationMessage = {
      ...message,
      id: `conv-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    task.conversations.push(newMsg);
    task.updatedAt = new Date().toISOString();
    return newMsg;
  }

  // タスク提案取得
  static async getTaskSuggestions(): Promise<TaskSuggestion[]> {
    if (this.isDemo()) {
      return demoSuggestions;
    }
    return [];
  }

  // ===== ジョブ管理 =====

  static async getJobs(): Promise<Job[]> {
    if (this.isDemo()) {
      return [...demoJobs].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    return [];
  }

  static async createJob(req: CreateJobRequest): Promise<Job> {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      type: req.type,
      title: req.title,
      description: req.description,
      status: 'draft',
      priority: req.priority,
      draftContent: req.draftContent,
      sourceMessageId: req.sourceMessageId,
      sourceChannel: req.sourceChannel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (this.isDemo()) {
      demoJobs.unshift(newJob);
    }
    return newJob;
  }

  static async updateJobStatus(id: string, status: JobStatus): Promise<Job | null> {
    if (this.isDemo()) {
      const idx = demoJobs.findIndex((j) => j.id === id);
      if (idx === -1) return null;
      demoJobs[idx] = {
        ...demoJobs[idx],
        status,
        updatedAt: new Date().toISOString(),
        ...(status === 'executed' ? { executedAt: new Date().toISOString() } : {}),
        ...(status === 'dismissed' ? { dismissedAt: new Date().toISOString() } : {}),
      };
      return demoJobs[idx];
    }
    return null;
  }

  // ===== 種ボックス管理 =====

  static async getSeeds(): Promise<Seed[]> {
    if (this.isDemo()) {
      return demoSeeds.filter((s) => s.status === 'pending');
    }
    return [];
  }

  static async createSeed(req: CreateSeedRequest): Promise<Seed> {
    const newSeed: Seed = {
      id: `seed-${Date.now()}`,
      content: req.content,
      sourceChannel: req.sourceChannel,
      sourceMessageId: req.sourceMessageId,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    if (this.isDemo()) {
      demoSeeds.unshift(newSeed);
    }
    return newSeed;
  }

  static async confirmSeed(seedId: string): Promise<Task | null> {
    if (this.isDemo()) {
      const seed = demoSeeds.find((s) => s.id === seedId);
      if (!seed || seed.status === 'confirmed') return null;

      // AI構造化をシミュレート
      seed.structured = {
        goal: `${seed.content.slice(0, 30)}... のゴール達成`,
        content: seed.content,
        concerns: '詳細な要件の整理が必要',
        deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      };
      seed.status = 'confirmed';

      // タスクを生成
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: seed.content.length > 40 ? seed.content.slice(0, 40) + '...' : seed.content,
        description: seed.content,
        status: 'todo',
        priority: 'medium',
        phase: 'ideation',
        sourceMessageId: seed.sourceMessageId,
        sourceChannel: seed.sourceChannel,
        conversations: [],
        ideationSummary: `【ゴール】${seed.structured.goal}\n【主な内容】${seed.structured.content}\n【気になる点】${seed.structured.concerns}\n【期限】${seed.structured.deadline}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        seedId: seed.id,
        dueDate: seed.structured.deadline,
      };
      demoTasks.unshift(newTask);
      return newTask;
    }
    return null;
  }

  // 種の詳細取得（AI構造化プレビュー用）
  static async getSeedStructured(seedId: string): Promise<Seed | null> {
    if (this.isDemo()) {
      const seed = demoSeeds.find((s) => s.id === seedId);
      if (!seed) return null;
      // 未構造化の場合はプレビュー生成
      if (!seed.structured) {
        return {
          ...seed,
          structured: {
            goal: `${seed.content.slice(0, 30)}... のゴール達成`,
            content: seed.content,
            concerns: '詳細な要件の整理が必要',
            deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          },
        };
      }
      return seed;
    }
    return null;
  }
}
