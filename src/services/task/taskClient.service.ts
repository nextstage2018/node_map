// タスクサービス（デモモード対応）

import {
  Task,
  TaskPhase,
  TaskStatus,
  TaskPriority,
  AiConversationMessage,
  ConversationTag,
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
import { getSupabase } from '@/lib/supabase';

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

// === Helper functions for snake_case <-> camelCase mapping ===

function mapTaskFromDb(dbRow: any): Task {
  return {
    id: dbRow.id,
    title: dbRow.title,
    description: dbRow.description,
    status: dbRow.status,
    priority: dbRow.priority,
    phase: dbRow.phase,
    sourceMessageId: dbRow.source_message_id,
    sourceChannel: dbRow.source_channel,
    ideationSummary: dbRow.ideation_summary,
    resultSummary: dbRow.result_summary,
    tags: dbRow.tags || [],
    assignee: dbRow.assignee,
    conversations: [],
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    completedAt: dbRow.completed_at,
    // Phase 17: フェーズ遷移タイムスタンプ
    seedAt: dbRow.seed_at,
    ideationAt: dbRow.ideation_at,
    progressAt: dbRow.progress_at,
    resultAt: dbRow.result_at,
  };
}

function mapConversationFromDb(dbRow: any): AiConversationMessage {
  return {
    id: dbRow.id,
    role: dbRow.role,
    content: dbRow.content,
    phase: dbRow.phase,
    timestamp: dbRow.created_at,
    conversationTag: dbRow.conversation_tag || undefined, // Phase 17
  };
}

function mapJobFromDb(dbRow: any): Job {
  return {
    id: dbRow.id,
    type: dbRow.type,
    title: dbRow.title,
    description: dbRow.description,
    status: dbRow.status,
    priority: dbRow.priority,
    draftContent: dbRow.draft_content,
    sourceMessageId: dbRow.source_message_id,
    sourceChannel: dbRow.source_channel,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    executedAt: dbRow.executed_at,
    dismissedAt: dbRow.dismissed_at,
  };
}

function mapSeedFromDb(dbRow: any): Seed {
  return {
    id: dbRow.id,
    content: dbRow.content,
    sourceChannel: dbRow.source_channel,
    sourceMessageId: dbRow.source_message_id,
    sourceFrom: dbRow.source_from,
    sourceDate: dbRow.source_date,
    status: dbRow.status,
    tags: dbRow.tags,
    structured: dbRow.structured,
    createdAt: dbRow.created_at,
  };
}

// === サービスクラス ===

export class TaskService {
  // タスク一覧取得
  // Phase 22: userIdパラメータ追加（認証ユーザーでフィルタリング）
  static async getTasks(userId?: string): Promise<Task[]> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      return [...demoTasks].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

    try {
      // Query tasks ordered by updated_at DESC
      let query = sb
        .from('tasks')
        .select('*')
        .order('updated_at', { ascending: false });

      // Phase 22: userIdが指定されていればフィルタリング
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: tasks, error } = await query;

      if (error) throw error;

      // For each task, fetch its conversations
      const tasksWithConversations = await Promise.all(
        (tasks || []).map(async (task) => {
          const mappedTask = mapTaskFromDb(task);
          const { data: conversations, error: convError } = await sb
            .from('task_conversations')
            .select('*')
            .eq('task_id', task.id)
            .order('created_at', { ascending: true });

          if (!convError && conversations) {
            mappedTask.conversations = conversations.map(mapConversationFromDb);
          }

          return mappedTask;
        })
      );

      return tasksWithConversations;
    } catch (error) {
      console.error('Error fetching tasks from Supabase:', error);
      return [];
    }
  }

  // タスク取得（単体）
  static async getTask(id: string): Promise<Task | null> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      return demoTasks.find((t) => t.id === id) || null;
    }

    try {
      const { data: task, error } = await sb
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !task) return null;

      const mappedTask = mapTaskFromDb(task);

      // Fetch conversations
      const { data: conversations, error: convError } = await sb
        .from('task_conversations')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: true });

      if (!convError && conversations) {
        mappedTask.conversations = conversations.map(mapConversationFromDb);
      }

      return mappedTask;
    } catch (error) {
      console.error('Error fetching task from Supabase:', error);
      return null;
    }
  }

  // タスク作成
  static async createTask(req: CreateTaskRequest): Promise<Task> {
    const sb = getSupabase();
    const now = new Date().toISOString();

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
      createdAt: now,
      updatedAt: now,
      tags: req.tags || [],
      // Phase 17: 作成時に ideationAt を記録
      ideationAt: now,
    };

    if (!sb) {
      // Demo mode
      demoTasks.unshift(newTask);
      return newTask;
    }

    try {
      const { data, error } = await sb
        .from('tasks')
        .insert({
          id: newTask.id,
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
          priority: newTask.priority,
          phase: newTask.phase,
          source_message_id: newTask.sourceMessageId,
          source_channel: newTask.sourceChannel,
          tags: newTask.tags,
          created_at: newTask.createdAt,
          updated_at: newTask.updatedAt,
          user_id: (req as any).userId,  // Phase 22: ユーザーID付与
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating task in Supabase:', error);
        return newTask;
      }

      return mapTaskFromDb(data);
    } catch (error) {
      console.error('Error creating task:', error);
      return newTask;
    }
  }

  // タスク更新
  static async updateTask(id: string, req: UpdateTaskRequest): Promise<Task | null> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      const idx = demoTasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;

      const nowLocal = new Date().toISOString();
      const updated = {
        ...demoTasks[idx],
        ...req,
        updatedAt: nowLocal,
      };

      if (req.status === 'done' && !updated.completedAt) {
        updated.completedAt = nowLocal;
      }

      // Phase 17: フェーズ遷移タイムスタンプ（デモモード）
      if (req.phase === 'ideation' && !updated.ideationAt) {
        updated.ideationAt = nowLocal;
      } else if (req.phase === 'progress' && !updated.progressAt) {
        updated.progressAt = nowLocal;
      } else if (req.phase === 'result' && !updated.resultAt) {
        updated.resultAt = nowLocal;
      }

      demoTasks[idx] = updated;
      return updated;
    }

    try {
      const now = new Date().toISOString();
      const updateData: any = {
        ...req,
        updated_at: now,
      };

      // Map camelCase to snake_case
      if (req.ideationSummary !== undefined) {
        updateData.ideation_summary = req.ideationSummary;
        delete updateData.ideationSummary;
      }
      if (req.resultSummary !== undefined) {
        updateData.result_summary = req.resultSummary;
        delete updateData.resultSummary;
      }
      if (req.dueDate !== undefined) {
        updateData.due_date = req.dueDate;
        delete updateData.dueDate;
      }

      // Set completedAt if marking as done
      if (req.status === 'done') {
        updateData.completed_at = now;
      }

      // Phase 17: フェーズ遷移タイムスタンプの自動記録
      if (req.phase) {
        const phaseTimestampMap: Record<string, string> = {
          ideation: 'ideation_at',
          progress: 'progress_at',
          result: 'result_at',
        };
        const tsCol = phaseTimestampMap[req.phase];
        if (tsCol) {
          updateData[tsCol] = now;
        }
      }

      const { data, error } = await sb
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating task in Supabase:', error);
        return null;
      }

      const updatedTask = mapTaskFromDb(data);

      // Fetch conversations
      const { data: conversations } = await sb
        .from('task_conversations')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: true });

      if (conversations) {
        updatedTask.conversations = conversations.map(mapConversationFromDb);
      }

      return updatedTask;
    } catch (error) {
      console.error('Error updating task:', error);
      return null;
    }
  }

  // 会話メッセージ追加
  static async addConversation(
    taskId: string,
    message: Omit<AiConversationMessage, 'id' | 'timestamp'>
  ): Promise<AiConversationMessage | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();
    const newId = `conv-${Date.now()}`;

    if (!sb) {
      // Demo mode
      const task = demoTasks.find((t) => t.id === taskId);
      if (!task) return null;

      const newMsg: AiConversationMessage = {
        ...message,
        id: newId,
        timestamp: now,
      };

      task.conversations.push(newMsg);
      task.updatedAt = now;
      return newMsg;
    }

    try {
      // Insert conversation (Phase 17: conversationTag 追加)
      const insertData: any = {
        id: newId,
        task_id: taskId,
        role: message.role,
        content: message.content,
        phase: message.phase,
        created_at: now,
      };
      if (message.conversationTag) {
        insertData.conversation_tag = message.conversationTag;
      }

      const { data, error } = await sb
        .from('task_conversations')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error adding conversation in Supabase:', error);
        return null;
      }

      // Update task's updated_at
      await sb
        .from('tasks')
        .update({ updated_at: now })
        .eq('id', taskId);

      return mapConversationFromDb(data);
    } catch (error) {
      console.error('Error adding conversation:', error);
      return null;
    }
  }

  // タスク提案取得
  static async getTaskSuggestions(): Promise<TaskSuggestion[]> {
    // No DB table for suggestions yet, always return demo
    return demoSuggestions;
  }

  // ===== ジョブ管理 =====

  // Phase 22: userIdパラメータ追加（認証ユーザーでフィルタリング）
  static async getJobs(userId?: string): Promise<Job[]> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      return [...demoJobs].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

    try {
      let query = sb
        .from('jobs')
        .select('*')
        .order('updated_at', { ascending: false });

      // Phase 22: userIdが指定されていればフィルタリング
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: jobs, error } = await query;

      if (error) throw error;

      return (jobs || []).map(mapJobFromDb);
    } catch (error) {
      console.error('Error fetching jobs from Supabase:', error);
      return [];
    }
  }

  static async createJob(req: CreateJobRequest): Promise<Job> {
    const sb = getSupabase();
    const now = new Date().toISOString();

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
      createdAt: now,
      updatedAt: now,
    };

    if (!sb) {
      // Demo mode
      demoJobs.unshift(newJob);
      return newJob;
    }

    try {
      const { data, error } = await sb
        .from('jobs')
        .insert({
          id: newJob.id,
          type: newJob.type,
          title: newJob.title,
          description: newJob.description,
          status: newJob.status,
          priority: newJob.priority,
          draft_content: newJob.draftContent,
          source_message_id: newJob.sourceMessageId,
          source_channel: newJob.sourceChannel,
          created_at: newJob.createdAt,
          updated_at: newJob.updatedAt,
          user_id: (req as any).userId,  // Phase 22: ユーザーID付与
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating job in Supabase:', error);
        return newJob;
      }

      return mapJobFromDb(data);
    } catch (error) {
      console.error('Error creating job:', error);
      return newJob;
    }
  }

  static async updateJobStatus(id: string, status: JobStatus): Promise<Job | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      // Demo mode
      const idx = demoJobs.findIndex((j) => j.id === id);
      if (idx === -1) return null;
      demoJobs[idx] = {
        ...demoJobs[idx],
        status,
        updatedAt: now,
        ...(status === 'executed' ? { executedAt: now } : {}),
        ...(status === 'dismissed' ? { dismissedAt: now } : {}),
      };
      return demoJobs[idx];
    }

    try {
      const updateData: any = {
        status,
        updated_at: now,
      };

      if (status === 'executed') {
        updateData.executed_at = now;
      } else if (status === 'dismissed') {
        updateData.dismissed_at = now;
      }

      const { data, error } = await sb
        .from('jobs')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating job status in Supabase:', error);
        return null;
      }

      return mapJobFromDb(data);
    } catch (error) {
      console.error('Error updating job status:', error);
      return null;
    }
  }

  // ===== 種ボックス管理 =====

  static async getSeeds(userId?: string, status: string = 'all', search: string = ''): Promise<Seed[]> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      let filtered = demoSeeds;
      if (status && status !== 'all') {
        filtered = filtered.filter((s) => s.status === status);
      }
      return filtered;
    }

    try {
      let query = sb
        .from('seeds')
        .select('*')
        .order('created_at', { ascending: false });

      // ステータスフィルタ（allの場合はフィルタなし）
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (userId) {
        query = query.eq('user_id', userId);
      }

      // テキスト検索
      if (search) {
        query = query.ilike('content', `%${search}%`);
      }

      const { data: seeds, error } = await query;

      if (error) throw error;

      return (seeds || []).map(mapSeedFromDb);
    } catch (error) {
      console.error('Error fetching seeds from Supabase:', error);
      return [];
    }
  }

  static async createSeed(req: CreateSeedRequest & { userId?: string }): Promise<Seed> {
    const sb = getSupabase();
    const now = new Date().toISOString();

    const newSeed: Seed = {
      id: `seed-${Date.now()}`,
      content: req.content,
      sourceChannel: req.sourceChannel,
      sourceMessageId: req.sourceMessageId,
      sourceFrom: req.sourceFrom,
      sourceDate: req.sourceDate,
      createdAt: now,
      status: 'pending',
    };

    if (!sb) {
      // Demo mode
      demoSeeds.unshift(newSeed);
      return newSeed;
    }

    try {
      const insertData: any = {
        id: newSeed.id,
        content: newSeed.content,
        status: newSeed.status,
        created_at: newSeed.createdAt,
      };
      // 任意フィールド: 値がある場合のみセット
      if (newSeed.sourceChannel) insertData.source_channel = newSeed.sourceChannel;
      if (newSeed.sourceMessageId) insertData.source_message_id = newSeed.sourceMessageId;
      if (req.userId) insertData.user_id = req.userId;

      // source_from / source_date は新カラム — カラム未追加でもエラーにならないよう分離
      if (newSeed.sourceFrom) insertData.source_from = newSeed.sourceFrom;
      if (newSeed.sourceDate) {
        // TIMESTAMPTZ に変換可能か検証
        const parsed = new Date(newSeed.sourceDate);
        if (!isNaN(parsed.getTime())) {
          insertData.source_date = parsed.toISOString();
        }
      }

      const { data, error } = await sb
        .from('seeds')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating seed in Supabase:', error);
        // 新カラムが原因の可能性 → source_from/source_date を除いてリトライ
        delete insertData.source_from;
        delete insertData.source_date;
        const { data: retryData, error: retryError } = await sb
          .from('seeds')
          .insert(insertData)
          .select()
          .single();
        if (retryError) {
          console.error('Error creating seed (retry):', retryError);
          throw retryError;
        }
        return mapSeedFromDb(retryData);
      }

      return mapSeedFromDb(data);
    } catch (error) {
      console.error('Error creating seed:', error);
      throw error;
    }
  }

  // 種の更新
  static async updateSeed(seedId: string, content: string, tags?: string[]): Promise<Seed | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      // Demo mode
      const idx = demoSeeds.findIndex((s) => s.id === seedId);
      if (idx === -1) return null;
      demoSeeds[idx] = { ...demoSeeds[idx], content };
      return demoSeeds[idx];
    }

    try {
      const updateData: any = {
        content,
        updated_at: now,
      };
      if (tags !== undefined) {
        updateData.tags = tags;
      }

      const { data, error } = await sb
        .from('seeds')
        .update(updateData)
        .eq('id', seedId)
        .select()
        .single();

      if (error) {
        console.error('Error updating seed in Supabase:', error);
        return null;
      }

      return mapSeedFromDb(data);
    } catch (error) {
      console.error('Error updating seed:', error);
      return null;
    }
  }

  // 種の削除
  static async deleteSeed(seedId: string): Promise<boolean> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
      const idx = demoSeeds.findIndex((s) => s.id === seedId);
      if (idx === -1) return false;
      demoSeeds.splice(idx, 1);
      return true;
    }

    try {
      const { error } = await sb
        .from('seeds')
        .delete()
        .eq('id', seedId);

      if (error) {
        console.error('Error deleting seed in Supabase:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting seed:', error);
      return false;
    }
  }

  static async confirmSeed(seedId: string): Promise<Task | null> {
    const sb = getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      // Demo mode
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
        createdAt: now,
        updatedAt: now,
        tags: [],
        seedId: seed.id,
        dueDate: seed.structured.deadline,
      };
      demoTasks.unshift(newTask);
      return newTask;
    }

    try {
      // Fetch the seed
      const { data: seed, error: seedError } = await sb
        .from('seeds')
        .select('*')
        .eq('id', seedId)
        .single();

      if (seedError || !seed) return null;
      if (seed.status === 'confirmed') return null;

      // AI構造化をシミュレート
      const structured = {
        goal: `${seed.content.slice(0, 30)}... のゴール達成`,
        content: seed.content,
        concerns: '詳細な要件の整理が必要',
        deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      };

      // Update seed status
      await sb
        .from('seeds')
        .update({
          status: 'confirmed',
          structured,
        })
        .eq('id', seedId);

      // Create new task
      const taskId = `task-${Date.now()}`;
      const newTaskData = {
        id: taskId,
        title: seed.content.length > 40 ? seed.content.slice(0, 40) + '...' : seed.content,
        description: seed.content,
        status: 'todo',
        priority: 'medium',
        phase: 'ideation',
        source_message_id: seed.source_message_id,
        source_channel: seed.source_channel,
        ideation_summary: `【ゴール】${structured.goal}\n【主な内容】${structured.content}\n【気になる点】${structured.concerns}\n【期限】${structured.deadline}`,
        tags: [],
        created_at: now,
        updated_at: now,
      };

      const { data: createdTask, error: taskError } = await sb
        .from('tasks')
        .insert(newTaskData)
        .select()
        .single();

      if (taskError || !createdTask) {
        console.error('Error creating task from seed:', taskError);
        return null;
      }

      return mapTaskFromDb(createdTask);
    } catch (error) {
      console.error('Error confirming seed:', error);
      return null;
    }
  }

  // 種の詳細取得（AI構造化プレビュー用）
  static async getSeedStructured(seedId: string): Promise<Seed | null> {
    const sb = getSupabase();

    if (!sb) {
      // Demo mode
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

    try {
      const { data: seed, error } = await sb
        .from('seeds')
        .select('*')
        .eq('id', seedId)
        .single();

      if (error || !seed) return null;

      // 未構造化の場合はプレビュー生成
      if (!seed.structured) {
        return {
          ...mapSeedFromDb(seed),
          structured: {
            goal: `${seed.content.slice(0, 30)}... のゴール達成`,
            content: seed.content,
            concerns: '詳細な要件の整理が必要',
            deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          },
        };
      }

      return mapSeedFromDb(seed);
    } catch (error) {
      console.error('Error fetching seed:', error);
      return null;
    }
  }
}
