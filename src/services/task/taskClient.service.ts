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
  CreateJobRequest,
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
    milestoneId: dbRow.milestone_id,
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
    // V2-A: マイルストーン紐づけ
    milestoneId: dbRow.milestone_id || undefined,
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

// mapSeedFromDb は廃止済み（v9.0クリーンアップ）

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
      milestoneId: req.milestoneId,
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
      if (req.milestoneId) insertData.milestone_id = req.milestoneId;
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
      if (req.assigneeContactId) {
        insertData.assigned_contact_id = req.assigneeContactId;
      } else if ((req as any).userId) {
        // 手動作成時: 担当者未指定なら作成者自身をセット（linked_user_id逆引き）
        try {
          const { data: selfContact } = await sb
            .from('contact_persons')
            .select('id')
            .eq('linked_user_id', (req as any).userId)
            .limit(1)
            .maybeSingle();
          if (selfContact) {
            insertData.assigned_contact_id = selfContact.id;
          }
        } catch (e) {
          // フォールバック: 名前解決失敗してもタスク作成はブロックしない
          console.warn('[TaskClient] assigned_contact_id自動解決失敗:', e);
        }
      }
      // v5.0: 期限・作成元
      if (req.dueDate) insertData.due_date = req.dueDate;
      if (req.sourceType) insertData.source_type = req.sourceType;
      // v10.4: 依頼者（作成者自身を自動セット）
      if ((req as any).requesterContactId) {
        insertData.requester_contact_id = (req as any).requesterContactId;
      }

      const { data, error } = await sb
        .from('tasks')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error creating task in Supabase:', error.message, error.code, error.details);
        throw new Error(`タスク作成DB失敗: ${error.message} (code: ${error.code})`);
      }

      return mapTaskFromDb(data);
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
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
      // v10.4: 依頼者・プロジェクトの更新対応
      if ((req as any).requester_contact_id !== undefined) {
        updateData.requester_contact_id = (req as any).requester_contact_id;
      }
      if ((req as any).projectId !== undefined) {
        updateData.project_id = (req as any).projectId;
        delete updateData.projectId;
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
    message: Omit<AiConversationMessage, 'id' | 'timestamp'>,
    userId?: string
  ): Promise<AiConversationMessage | null> {
    const sb = getServerSupabase() || getSupabase();
    const now = new Date().toISOString();

    if (!sb) {
      return null;
    }

    try {
      // Insert conversation
      // id: UUID型 → DBのDEFAULT gen_random_uuid() に任せる
      // user_id: NOT NULL → 必ず設定
      // conversation_tag: DBにカラムが存在しないため除外
      const insertData: any = {
        task_id: taskId,
        user_id: userId || 'system',
        role: message.role,
        content: message.content,
        phase: message.phase,
        created_at: now,
      };
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

  // 種ボックス管理は廃止済み（v9.0クリーンアップ）
  // getSeeds, createSeed, updateSeed, deleteSeed, structureSeedWithAI, confirmSeed, getSeedStructured は削除済み

  // タスクの削除の前にあったSeed関連メソッド群はv9.0クリーンアップで削除

  static async _seedsRemoved(): Promise<void> {}

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
}
