// タスクサービス

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
import { getSupabase, getServerSupabase } from '@/lib/supabase';

// === Helper functions for snake_case <-> camelCase mapping ===

function mapTaskFromDb(dbRow: any): Task {
  return {
    id: dbRow.id,
    title: dbRow.title,
    description: dbRow.description,
    status: dbRow.status,
    priority: dbRow.priority,
    phase: dbRow.phase,
    taskType: dbRow.task_type || 'personal', // Phase Restructure
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
    // Phase 40c: 種・プロジェクト紐づけ
    seedId: dbRow.seed_id,
    projectId: dbRow.project_id,
    projectName: dbRow.projects?.name || undefined,
    organizationName: dbRow.projects?.organizations?.name || undefined,
    dueDate: dbRow.due_date || undefined,
    // Calendar統合
    scheduledStart: dbRow.scheduled_start,
    scheduledEnd: dbRow.scheduled_end,
    calendarEventId: dbRow.calendar_event_id,
    // Phase 50: タスクカテゴリ拡張
    taskCategory: dbRow.task_category || 'individual',
    parentTaskId: dbRow.parent_task_id,
    templateId: dbRow.template_id,
    estimatedHours: dbRow.estimated_hours ? parseFloat(dbRow.estimated_hours) : undefined,
    recurrenceType: dbRow.recurrence_type,
    recurrenceDay: dbRow.recurrence_day,
    assigneeContactId: dbRow.assignee_contact_id,
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
    projectId: dbRow.project_id,
    projectName: dbRow.projects?.name || dbRow.project_name,
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
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return [];
    }

    try {
      // Query tasks ordered by updated_at DESC
      let query = sb
        .from('tasks')
        .select('*, projects(name, organization_id, organizations(name))')
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

      // Phase 56: 親子タスクのグルーピング
      const parentTasks = tasksWithConversations.filter((t) => !t.parentTaskId);
      const childTaskMap = new Map<string, Task[]>();
      for (const t of tasksWithConversations) {
        if (t.parentTaskId) {
          const children = childTaskMap.get(t.parentTaskId) || [];
          children.push(t);
          childTaskMap.set(t.parentTaskId, children);
        }
      }
      // 親タスクにchildTasksをアタッチ
      for (const p of parentTasks) {
        const children = childTaskMap.get(p.id);
        if (children) {
          p.childTasks = children;
        }
      }
      // 親タスクと、親を持たない子タスク（孤児防止）を返す
      const orphanChildren = tasksWithConversations.filter(
        (t) => t.parentTaskId && !parentTasks.find((p) => p.id === t.parentTaskId)
      );
      return [...parentTasks, ...orphanChildren];
    } catch (error) {
      console.error('Error fetching tasks from Supabase:', error);
      return [];
    }
  }

  // タスク取得（単体）— userId指定時は所有者チェック
  static async getTask(id: string, userId?: string): Promise<Task | null> {
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return null;
    }

    try {
      let query = sb
        .from('tasks')
        .select('*')
        .eq('id', id);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data: task, error } = await query.single();

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
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: req.title,
      description: req.description,
      status: req.status || 'todo',
      priority: req.priority || 'medium',
      phase: 'ideation',
      taskType: req.taskType || 'personal', // Phase Restructure: 個人/グループ
      sourceMessageId: req.sourceMessageId,
      sourceChannel: req.sourceChannel,
      conversations: [],
      createdAt: now,
      updatedAt: now,
      tags: req.tags || [],
      // Phase 17: 作成時に ideationAt を記録
      ideationAt: now,
      // Phase 40c: 種・プロジェクト紐づけ
      seedId: req.seedId,
      projectId: req.projectId,
    };

    if (!sb) {
      return newTask;
    }

    try {
      const insertData: Record<string, unknown> = {
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
      };
      // Phase Restructure: タスク種類
      insertData.task_type = newTask.taskType || 'personal';
      // Phase 40c: 種・プロジェクト紐づけ（カラム未追加でもエラーにならないよう条件付き）
      if (req.seedId) insertData.seed_id = req.seedId;
      if (req.projectId) insertData.project_id = req.projectId;
      // Calendar統合
      if (req.scheduledStart) insertData.scheduled_start = req.scheduledStart;
      if (req.scheduledEnd) insertData.scheduled_end = req.scheduledEnd;
      // Phase 50: タスクカテゴリ拡張
      insertData.task_category = req.taskCategory || 'individual';
      if (req.parentTaskId) insertData.parent_task_id = req.parentTaskId;
      if (req.templateId) insertData.template_id = req.templateId;
      if (req.estimatedHours) insertData.estimated_hours = req.estimatedHours;
      if (req.recurrenceType) insertData.recurrence_type = req.recurrenceType;
      if (req.recurrenceDay !== undefined) insertData.recurrence_day = req.recurrenceDay;
      if (req.assigneeContactId) insertData.assignee_contact_id = req.assigneeContactId;

      const { data, error } = await sb
        .from('tasks')
        .insert(insertData)
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
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return null;
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
      // Calendar統合: scheduled_start / scheduled_end
      if ((req as any).scheduledStart !== undefined) {
        updateData.scheduled_start = (req as any).scheduledStart;
        delete updateData.scheduledStart;
      }
      if ((req as any).scheduledEnd !== undefined) {
        updateData.scheduled_end = (req as any).scheduledEnd;
        delete updateData.scheduledEnd;
      }

      // Phase 50: タスクカテゴリ拡張のsnake_case変換
      if (req.taskCategory !== undefined) {
        updateData.task_category = req.taskCategory;
        delete updateData.taskCategory;
      }
      if (req.parentTaskId !== undefined) {
        updateData.parent_task_id = req.parentTaskId;
        delete updateData.parentTaskId;
      }
      if (req.estimatedHours !== undefined) {
        updateData.estimated_hours = req.estimatedHours;
        delete updateData.estimatedHours;
      }
      if (req.recurrenceType !== undefined) {
        updateData.recurrence_type = req.recurrenceType;
        delete updateData.recurrenceType;
      }
      if (req.recurrenceDay !== undefined) {
        updateData.recurrence_day = req.recurrenceDay;
        delete updateData.recurrenceDay;
      }
      if (req.assigneeContactId !== undefined) {
        updateData.assignee_contact_id = req.assigneeContactId;
        delete updateData.assigneeContactId;
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

      let updateQuery = sb
        .from('tasks')
        .update(updateData)
        .eq('id', id);
      // userId指定時は所有者チェック（Phase 60: データ分離）
      if (req.userId) {
        updateQuery = updateQuery.eq('user_id', req.userId);
      }
      const { data, error } = await updateQuery.select().single();

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

      // Phase 42e: タスク完了時に final_landing スナップショット記録
      if (req.status === 'done') {
        try {
          const { ThoughtNodeService } = await import('@/services/nodemap/thoughtNode.service');
          // 初期ゴールスナップショットを取得して比較サマリーを生成
          const snapshots = await ThoughtNodeService.getSnapshots({ taskId: id });
          const currentNodes = await ThoughtNodeService.getLinkedNodes({ taskId: id });
          const nodeLabels = currentNodes.map(n => n.nodeLabel).filter(Boolean);

          let landingSummary = '';
          if (snapshots.initialGoal) {
            landingSummary = `【初期ゴール】${snapshots.initialGoal.summary}\n\n【着地点】関連キーワード: ${nodeLabels.join('、') || 'なし'}`;
            if (updatedTask.resultSummary) {
              landingSummary += `\n結果サマリー: ${updatedTask.resultSummary}`;
            }
          } else {
            landingSummary = `関連キーワード: ${nodeLabels.join('、') || 'なし'}`;
            if (updatedTask.resultSummary) {
              landingSummary += `\n結果サマリー: ${updatedTask.resultSummary}`;
            }
          }

          await ThoughtNodeService.captureSnapshot({
            taskId: id,
            userId: data.user_id || 'unknown',
            snapshotType: 'final_landing',
            summary: landingSummary,
          });
        } catch (e) {
          console.error('[Phase42e] final_landing スナップショット記録エラー:', e);
        }
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
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();
    const newId = `conv-${Date.now()}`;

    if (!sb) {
      return null;
    }

    try {
      // Insert conversation (Phase 17: conversationTag 追加, Phase 42f残り: turnId追加)
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
      if (message.turnId) {
        insertData.turn_id = message.turnId;
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
    return [];
  }

  // ===== ジョブ管理 =====

  // Phase 22: userIdパラメータ追加（認証ユーザーでフィルタリング）
  static async getJobs(userId?: string): Promise<Job[]> {
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return [];
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
    const sb = getServerSupabase() || getSupabase();
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
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      return null;
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
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return [];
    }

    try {
      // projects JOIN を試み、失敗したら JOIN なしでフォールバック
      let seeds: any[] | null = null;
      let fetchError: any = null;

      for (const selectStr of ['*, projects(name)', '*']) {
        let query = sb
          .from('seeds')
          .select(selectStr)
          .order('created_at', { ascending: false });

        if (status && status !== 'all') {
          query = query.eq('status', status);
        }
        if (userId) {
          query = query.eq('user_id', userId);
        }
        if (search) {
          query = query.ilike('content', `%${search}%`);
        }

        const { data, error } = await query;
        if (!error) {
          seeds = data;
          break;
        }
        fetchError = error;
        console.warn('Seeds query with JOIN failed, retrying without JOIN:', error.message);
      }

      if (seeds === null && fetchError) throw fetchError;

      return (seeds || []).map(mapSeedFromDb);
    } catch (error) {
      console.error('Error fetching seeds from Supabase:', error);
      return [];
    }
  }

  static async createSeed(req: CreateSeedRequest & { userId?: string }): Promise<Seed> {
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    // seeds テーブルの id は UUID型 → crypto.randomUUID() で生成
    const newSeed: Seed = {
      id: crypto.randomUUID(),
      content: req.content,
      sourceChannel: req.sourceChannel,
      sourceMessageId: req.sourceMessageId,
      sourceFrom: req.sourceFrom,
      sourceDate: req.sourceDate,
      projectId: req.projectId,
      createdAt: now,
      status: 'pending',
    };

    if (!sb) {
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

      // 新カラム — カラム未追加でもエラーにならないよう分離
      if (newSeed.projectId) insertData.project_id = newSeed.projectId;
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
        // 新カラムが原因の可能性 → source_from/source_date/project_id を除いてリトライ
        delete insertData.source_from;
        delete insertData.source_date;
        delete insertData.project_id;
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
  static async updateSeed(seedId: string, content: string, tags?: string[], projectId?: string | null): Promise<Seed | null> {
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      return null;
    }

    try {
      const updateData: any = {
        content,
        updated_at: now,
      };
      if (tags !== undefined) {
        updateData.tags = tags;
      }
      if (projectId !== undefined) {
        updateData.project_id = projectId;
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

  // 種の削除 — userId指定時は所有者チェック（Phase 60: データ分離）
  static async deleteSeed(seedId: string, userId?: string): Promise<boolean> {
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return false;
    }

    try {
      let query = sb
        .from('seeds')
        .delete()
        .eq('id', seedId);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { error } = await query;

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

  // タスクの削除 — userId指定時は所有者チェック（Phase 60: データ分離）
  static async deleteTask(taskId: string, userId?: string): Promise<boolean> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return false;

    try {
      // FK CASCADE で関連テーブル（task_conversations, thought_task_nodes,
      // thought_edges, thought_snapshots, task_members）は自動削除される
      let query = sb
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { error } = await query;

      if (error) {
        console.error('Error deleting task in Supabase:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error deleting task:', error);
      return false;
    }
  }

  // タスク完了時にビジネスイベントに記録（アーカイブ）
  static async archiveTaskToBusinessLog(taskId: string, userId: string): Promise<boolean> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return false;

    try {
      const { data: task } = await sb
        .from('tasks')
        .select('title, result_summary, project_id, description, ideation_summary')
        .eq('id', taskId)
        .single();

      if (!task) return false;

      // 会話履歴も取得して保存する（思考ログとしての価値を保全）
      let conversationLog = '';
      try {
        const { data: convs } = await sb
          .from('task_conversations')
          .select('role, content, phase, created_at')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true });

        if (convs && convs.length > 0) {
          conversationLog = '\n\n---\n📝 会話ログ:\n' + convs.map((c: any) => {
            const role = c.role === 'user' ? 'ユーザー' : 'AI';
            const phase = c.phase === 'ideation' ? '構想' : c.phase === 'progress' ? '進行' : '結果';
            return `[${phase}] ${role}: ${c.content}`;
          }).join('\n\n');
        }
      } catch (convErr) {
        console.error('Error fetching conversations for archive:', convErr);
      }

      // Phase 50: タスクに紐づくドキュメントを取得
      let documentSection = '';
      try {
        const { data: docs } = await sb
          .from('drive_documents')
          .select('file_name, document_type, drive_url')
          .eq('task_id', taskId);

        if (docs && docs.length > 0) {
          documentSection = '\n\n---\n📎 関連ドキュメント:\n' + docs.map((d: any) => {
            return `- ${d.file_name} (${d.document_type || 'その他'}) — ${d.drive_url || 'URL不明'}`;
          }).join('\n');
        }
      } catch (docErr) {
        console.error('Error fetching documents for archive:', docErr);
      }

      // 構想メモ + 結果要約 + ドキュメント + 会話ログをまとめて保存
      const contentParts: string[] = [];
      if (task.ideation_summary) contentParts.push(`【構想メモ】\n${task.ideation_summary}`);
      if (task.result_summary) contentParts.push(`【結果要約】\n${task.result_summary}`);
      if (documentSection) contentParts.push(documentSection);
      contentParts.push(conversationLog);

      const { error: eventError } = await sb
        .from('business_events')
        .insert({
          title: `タスク完了: ${task.title}`,
          content: contentParts.join('\n\n') || task.description || '',
          event_type: 'task_completed',
          project_id: task.project_id,
          user_id: userId,
          source_message_id: taskId,
          source_channel: 'nodemap',
          ai_generated: false,
          event_date: new Date().toISOString(),
        });

      if (eventError) {
        console.error('Error creating archive event:', eventError);
      }
      return true;
    } catch (error) {
      console.error('Error archiving task:', error);
      return false;
    }
  }

  // AI構造化: 種の内容＋会話履歴からタスク情報を生成
  private static async structureSeedWithAI(
    seedContent: string,
    conversations: { role: string; content: string }[],
  ): Promise<{ title: string; goal: string; content: string; concerns: string; deadline: string; memo: string; priority: string }> {
    const fallback = {
      title: seedContent.length > 50 ? seedContent.slice(0, 50) + '...' : seedContent,
      goal: '',
      content: seedContent,
      concerns: '',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      memo: '',
      priority: 'medium',
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return fallback;

    try {
      // 会話履歴をテキスト化
      const convText = conversations.length > 0
        ? '\n\n--- AI会話履歴 ---\n' + conversations.map(c => `[${c.role === 'user' ? 'ユーザー' : 'AI'}] ${c.content}`).join('\n')
        : '';

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 600,
        system: `あなたはタスク構造化の専門家です。種（アイデアメモ）の内容とAI会話履歴から、タスクの構造化情報をJSON形式で返してください。

必ず以下のJSON形式で返してください（他のテキストは不要）:
{
  "title": "タスクのタイトル（30文字以内、簡潔に）",
  "goal": "このタスクのゴール（1-2文）",
  "content": "主な内容・やるべきこと（箇条書き的に）",
  "concerns": "気になる点・注意事項（なければ空文字）",
  "deadline": "期限日（YYYY-MM-DD形式。明示されていなければ1週間後）",
  "memo": "種の情報要約（元のメッセージ内容・会話で判明したことのまとめ）",
  "priority": "high/medium/low（緊急度から判断）"
}`,
        messages: [
          { role: 'user', content: `以下の種をタスクに構造化してください:\n\n${seedContent}${convText}` },
        ],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
      if (!text) return fallback;

      // JSON部分を抽出（```json...```やそのまま）
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallback;

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || fallback.title,
        goal: parsed.goal || '',
        content: parsed.content || seedContent,
        concerns: parsed.concerns || '',
        deadline: parsed.deadline || fallback.deadline,
        memo: parsed.memo || '',
        priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium',
      };
    } catch (e) {
      console.error('AI structuring failed, using fallback:', e);
      return fallback;
    }
  }

  static async confirmSeed(seedId: string, userId?: string): Promise<Task | null> {
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      return null;
    }

    try {
      // 種を取得
      const { data: seed, error: seedError } = await sb
        .from('seeds')
        .select('*')
        .eq('id', seedId)
        .single();

      if (seedError || !seed) return null;
      if (seed.status === 'confirmed') return null;

      // 種のAI会話履歴を取得
      let conversations: { role: string; content: string }[] = [];
      try {
        const { data: convData } = await sb
          .from('seed_conversations')
          .select('role, content')
          .eq('seed_id', seedId)
          .order('created_at', { ascending: true });
        if (convData) conversations = convData;
      } catch { /* 会話なしでも続行 */ }

      // AIで構造化情報を生成
      const structured = await TaskService.structureSeedWithAI(seed.content, conversations);

      // 種のステータスを confirmed に更新
      await sb
        .from('seeds')
        .update({
          status: 'confirmed',
          structured: {
            goal: structured.goal,
            content: structured.content,
            concerns: structured.concerns,
            deadline: structured.deadline,
          },
        })
        .eq('id', seedId);

      // ideation_summary を構築
      const summaryParts = [];
      if (structured.goal) summaryParts.push(`【ゴール】${structured.goal}`);
      if (structured.content) summaryParts.push(`【主な内容】${structured.content}`);
      if (structured.concerns) summaryParts.push(`【気になる点】${structured.concerns}`);
      if (structured.deadline) summaryParts.push(`【期限】${structured.deadline}`);
      if (structured.memo) summaryParts.push(`【メモ（種情報要約）】${structured.memo}`);

      // タスクを作成
      const taskId = crypto.randomUUID();
      const newTaskData: Record<string, unknown> = {
        id: taskId,
        title: structured.title,
        description: structured.content,
        status: 'todo',
        priority: structured.priority,
        phase: 'ideation',
        source_message_id: seed.source_message_id,
        source_channel: seed.source_channel,
        ideation_summary: summaryParts.join('\n'),
        tags: [],
        created_at: now,
        updated_at: now,
        seed_id: seedId,
      };
      if (userId) newTaskData.user_id = userId;
      if (seed.project_id) newTaskData.project_id = seed.project_id;
      if (structured.deadline) newTaskData.due_date = structured.deadline;

      const { data: createdTask, error: taskError } = await sb
        .from('tasks')
        .insert(newTaskData)
        .select()
        .single();

      if (taskError || !createdTask) {
        console.error('Error creating task from seed:', taskError);
        // due_date カラムが無い場合のフォールバック
        if (taskError?.message?.includes('due_date')) {
          delete newTaskData.due_date;
          const { data: retryTask, error: retryError } = await sb
            .from('tasks')
            .insert(newTaskData)
            .select()
            .single();
          if (retryError || !retryTask) return null;
          return mapTaskFromDb(retryTask);
        }
        return null;
      }

      // 種の会話履歴をタスクの会話に引き継ぐ
      if (conversations.length > 0) {
        try {
          const taskConvs = conversations.map((conv) => ({
            id: crypto.randomUUID(),
            task_id: taskId,
            role: conv.role,
            content: conv.content,
            created_at: now,
            conversation_tag: 'ideation',
          }));
          await sb.from('task_conversations').insert(taskConvs);
        } catch (e) {
          console.error('Error migrating seed conversations to task:', e);
        }
      }

      // Phase 42e: initial_goal スナップショット記録
      try {
        const { ThoughtNodeService } = await import('@/services/nodemap/thoughtNode.service');
        const snapshotSummary = [structured.goal, structured.content].filter(Boolean).join('\n');
        await ThoughtNodeService.captureSnapshot({
          taskId,
          userId: userId || seed.user_id || 'unknown',
          snapshotType: 'initial_goal',
          summary: snapshotSummary,
          seedId,
        });
      } catch (e) {
        console.error('[Phase42e] initial_goal スナップショット記録エラー:', e);
      }

      return mapTaskFromDb(createdTask);
    } catch (error) {
      console.error('Error confirming seed:', error);
      return null;
    }
  }

  // 種の詳細取得（AI構造化プレビュー用）
  static async getSeedStructured(seedId: string): Promise<Seed | null> {
    const sb = getServerSupabase() || getSupabase();

    if (!sb) {
      return null;
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
