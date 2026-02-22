// ãã§ãã¯ãã¤ã³ãç®¡çãµã¼ãã¹
// ã¿ã¹ã¯é²è¡ä¸­ã®ã¹ãããã·ã§ãããè¨é²ããæèã®è»è·¡ãå¯è¦åãã
// AIèªåè¨é²ï¼ã¦ã¼ã¶ã¼æåè¨é²ã®2æ¹å¼

import type { CheckpointData } from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

// ã¤ã³ã¡ã¢ãªã¹ãã¢ï¼æ¬çªã¯Supabaseï¼
let checkpointsStore: CheckpointData[] = [];

// ãã¢ç¨åæãã¼ã¿
function initDemoData(): void {
  if (checkpointsStore.length > 0) return;

  checkpointsStore = [
    // ===== user_self: task-demo-1 =====
    {
      id: 'cp-1',
      taskId: 'task-demo-1',
      userId: 'user_self',
      nodeIds: ['node-1', 'node-2', 'node-9'],
      timestamp: '2026-02-05T10:30:00Z',
      source: 'auto',
      summary: 'ãã¼ã±ãã£ã³ã°ã¨SEOå¯¾ç­ã®é¢é£æ§ãèªè­ãWebãªãã¥ã¼ã¢ã«PJã¨ç´ä»ã',
      createdAt: '2026-02-05T10:30:00Z',
    },
    {
      id: 'cp-2',
      taskId: 'task-demo-1',
      userId: 'user_self',
      nodeIds: ['node-1', 'node-2', 'node-3', 'node-11', 'node-9'],
      timestamp: '2026-02-08T15:00:00Z',
      source: 'manual',
      summary: 'ã³ã³ãã³ãæ¦ç¥ã¨ã¦ã¼ã¶ã¼ãªãµã¼ãã®è¦ç¹ãè¿½å ',
      createdAt: '2026-02-08T15:00:00Z',
    },
    // ===== user_self: task-demo-2 =====
    {
      id: 'cp-3',
      taskId: 'task-demo-2',
      userId: 'user_self',
      nodeIds: ['node-4', 'node-5', 'node-12', 'node-10'],
      timestamp: '2026-02-12T11:00:00Z',
      source: 'auto',
      summary: 'ãªã¹ãã£ã³ã°åºåâLTVåæâã³ã³ãã¼ã¸ã§ã³çã®çµè·¯ãè¨é²',
      createdAt: '2026-02-12T11:00:00Z',
    },
    // ===== user_tanaka: task-tanaka-1 =====
    {
      id: 'cp-4',
      taskId: 'task-tanaka-1',
      userId: 'user_tanaka',
      nodeIds: ['t-node-1', 't-node-2', 't-node-3', 't-node-13'],
      timestamp: '2026-01-22T14:00:00Z',
      source: 'auto',
      summary: 'çµå¶æ¦ç¥âãã¼ã±ãã£ã³ã°âKPIè¨­è¨âROIã®æµããæ´ç',
      createdAt: '2026-01-22T14:00:00Z',
    },
    // ===== user_sato: task-sato-1 =====
    {
      id: 'cp-5',
      taskId: 'task-sato-1',
      userId: 'user_sato',
      nodeIds: ['s-node-1', 's-node-2', 's-node-3', 's-node-7'],
      timestamp: '2026-02-01T14:00:00Z',
      source: 'manual',
      summary: 'ãã¶ã¤ã³âUI/UXâãã­ãã¿ã¤ãâãã£ã°ãã®å¶ä½ãã­ã¼è¨é²',
      createdAt: '2026-02-01T14:00:00Z',
    },
    // ===== user_yamada: task-yamada-1 =====
    {
      id: 'cp-6',
      taskId: 'task-yamada-1',
      userId: 'user_yamada',
      nodeIds: ['y-node-1', 'y-node-2', 'y-node-3'],
      timestamp: '2026-01-22T15:00:00Z',
      source: 'auto',
      summary: 'ããã¯ã¨ã³ãâAPIè¨­è¨âãã¼ã¿ãã¼ã¹ã®æè¡æ§æãè¨é²',
      createdAt: '2026-01-22T15:00:00Z',
    },
  ];
}

export class CheckpointService {
  /**
   * ã¿ã¹ã¯ã®ãã§ãã¯ãã¤ã³ãä¸è¦§ãåå¾
   */
  static async getCheckpoints(taskId?: string, userId?: string): Promise<CheckpointData[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb.from('checkpoints').select('*');

        if (taskId) {
          query = query.eq('task_id', taskId);
        }
        if (userId) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query.order('timestamp', { ascending: true });
        if (error) throw error;

        return (data || []).map((row) => ({
          id: row.id,
          taskId: row.task_id,
          userId: row.user_id,
          nodeIds: row.node_ids || [],
          timestamp: row.timestamp,
          source: row.source as 'auto' | 'manual',
          summary: row.summary,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error('Error fetching checkpoints from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    let result = [...checkpointsStore];

    if (taskId) {
      result = result.filter((cp) => cp.taskId === taskId);
    }
    if (userId) {
      result = result.filter((cp) => cp.userId === userId);
    }

    return result.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * ãã§ãã¯ãã¤ã³ããè¿½å 
   */
  static async addCheckpoint(
    taskId: string,
    userId: string,
    nodeIds: string[],
    source: 'auto' | 'manual',
    summary?: string,
    snapshotTimestamp?: string  // チェックポイント対象時点（省略時は現在時刻）
  ): Promise<CheckpointData> {
    const sb = getSupabase();
    if (sb) {
      try {
        const now = new Date().toISOString();
    // timestamp: チェックポイントが示す時点（スナップショットの対象時刻）
    // createdAt: このレコードが作成された時刻（常にnow）
    const targetTimestamp = snapshotTimestamp || now;

        const { data, error } = await sb
          .from('checkpoints')
          .insert({
            task_id: taskId,
            user_id: userId,
            node_ids: nodeIds,
            timestamp: targetTimestamp,  // スナップショット対象時点
            source,
            summary,
            created_at: now,
          })
          .select()
          .single();

        if (error) throw error;

        return {
          id: data.id,
          taskId: data.task_id,
          userId: data.user_id,
          nodeIds: data.node_ids || [],
          timestamp: data.timestamp,
          source: data.source as 'auto' | 'manual',
          summary: data.summary,
          createdAt: data.created_at,
        };
      } catch (error) {
        console.error('Error adding checkpoint to Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    const now = new Date().toISOString();

    const checkpoint: CheckpointData = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      taskId,
      userId,
      nodeIds,
      timestamp: targetTimestamp,  // スナップショット対象時点
      source,
      summary,
      createdAt: now,
    };

    checkpointsStore.push(checkpoint);
    return checkpoint;
  }

  /**
   * ãã§ãã¯ãã¤ã³ããIDã§åå¾
   */
  static async getCheckpointById(id: string): Promise<CheckpointData | null> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('checkpoints')
          .select('*')
          .eq('id', id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          return {
            id: data.id,
            taskId: data.task_id,
            userId: data.user_id,
            nodeIds: data.node_ids || [],
            timestamp: data.timestamp,
            source: data.source as 'auto' | 'manual',
            summary: data.summary,
            createdAt: data.created_at,
          };
        }
      } catch (error) {
        console.error('Error fetching checkpoint from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    return checkpointsStore.find((cp) => cp.id === id) || null;
  }
}
