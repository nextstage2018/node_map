// ã¯ã©ã¹ã¿ã¼ï¼é¢ï¼ç®¡çãµã¼ãã¹
// ã¿ã¹ã¯ã«å¯¾ããèªè­ç¯å²ï¼æ§æ³é¢ã»çµæé¢ï¼ãç®¡çãã

import { ClusterData, ClusterDiff, NodeData } from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

// ã¤ã³ã¡ã¢ãªã¹ãã¢ï¼æ¬çªã¯Supabaseï¼
let clustersStore: ClusterData[] = [];

// ãã¢ç¨åæãã¼ã¿
function initDemoData(): void {
  if (clustersStore.length > 0) return;

  clustersStore = [
    // ===== user_self ã®ã¯ã©ã¹ã¿ã¼ =====
    // ã¿ã¹ã¯1: Webãªãã¥ã¼ã¢ã« ãã¼ã±ãã£ã³ã°æ¹é
    {
      id: 'cluster-1',
      taskId: 'task-demo-1',
      userId: 'user_self',
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-2', 'node-6', 'node-9'],
      summary: 'Webãªãã¥ã¼ã¢ã« ãã¼ã±ãã£ã³ã°æ¹é',
      createdAt: '2026-02-08T09:00:00Z',
    },
    {
      id: 'cluster-2',
      taskId: 'task-demo-1',
      userId: 'user_self',
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-3', 'node-6', 'node-9', 'node-11', 'node-12', 'node-13', 'node-14'],
      summary: 'ã³ã³ãã³ãæ¦ç¥ã»ã¦ã¼ã¶ã¼ãªãµã¼ãã»ãã©ã³ãã£ã³ã°ã»SNSéç¨ãå«ãç·åæ¹éã«æ¡å¤§',
      createdAt: '2026-02-10T17:00:00Z',
    },
    // ã¿ã¹ã¯2: æ°è¦é¡§å®¢ç²å¾ã®åºåæ½ç­
    {
      id: 'cluster-3',
      taskId: 'task-demo-2',
      userId: 'user_self',
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-4', 'node-10'],
      summary: 'æ°è¦é¡§å®¢ç²å¾ã®åºåæ½ç­',
      createdAt: '2026-02-12T09:00:00Z',
    },
    {
      id: 'cluster-4',
      taskId: 'task-demo-2',
      userId: 'user_self',
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-4', 'node-5', 'node-10', 'node-12'],
      summary: 'ãªã¹ãã£ã³ã°åºåã«SEOã»LTVåæã»ã³ã³ãã¼ã¸ã§ã³çã®è¦ç¹ãå ããæ½ç­ã«æ¡å¼µ',
      createdAt: '2026-02-14T18:00:00Z',
    },
    // ===== user_tanaka ã®ã¯ã©ã¹ã¿ã¼ =====
    // ã¿ã¹ã¯: Webãªãã¥ã¼ã¢ã«å¨ä½æ¦ç¥
    {
      id: 'cluster-t1',
      taskId: 'task-tanaka-1',
      userId: 'user_tanaka',
      clusterType: 'ideation',
      nodeIds: ['t-node-1', 't-node-2', 't-node-10', 't-node-4'],
      summary: 'Webãªãã¥ã¼ã¢ã«å¨ä½æ¦ç¥',
      createdAt: '2026-01-20T09:00:00Z',
    },
    {
      id: 'cluster-t2',
      taskId: 'task-tanaka-1',
      userId: 'user_tanaka',
      clusterType: 'result',
      nodeIds: ['t-node-1', 't-node-2', 't-node-3', 't-node-4', 't-node-10', 't-node-12', 't-node-13'],
      summary: 'KPIè¨­è¨ã»ç«¶ååæã»ROIãå«ãåæ¬çãªæ¦ç¥ã«çºå±',
      createdAt: '2026-02-05T17:00:00Z',
    },
    // ã¿ã¹ã¯: é¡§å®¢ç²å¾ã³ã¹ãæé©å
    {
      id: 'cluster-t3',
      taskId: 'task-tanaka-2',
      userId: 'user_tanaka',
      clusterType: 'ideation',
      nodeIds: ['t-node-11', 't-node-6', 't-node-7'],
      summary: 'é¡§å®¢ç²å¾ã³ã¹ãæé©å',
      createdAt: '2026-02-03T09:00:00Z',
    },
    {
      id: 'cluster-t4',
      taskId: 'task-tanaka-2',
      userId: 'user_tanaka',
      clusterType: 'result',
      nodeIds: ['t-node-5', 't-node-6', 't-node-7', 't-node-11', 't-node-12'],
      summary: 'SEOã»ç«¶ååæã®è¦ç¹ãè¿½å ããã³ã¹ãå¹çã®é«ãæ½ç­ãç¹å®',
      createdAt: '2026-02-10T17:00:00Z',
    },
    // ===== user_sato ã®ã¯ã©ã¹ã¿ã¼ =====
    {
      id: 'cluster-s1',
      taskId: 'task-sato-1',
      userId: 'user_sato',
      clusterType: 'ideation',
      nodeIds: ['s-node-1', 's-node-2', 's-node-6'],
      summary: 'Webãªãã¥ã¼ã¢ã«PJ ãã¶ã¤ã³å·æ°',
      createdAt: '2026-01-22T09:00:00Z',
    },
    {
      id: 'cluster-s2',
      taskId: 'task-sato-1',
      userId: 'user_sato',
      clusterType: 'result',
      nodeIds: ['s-node-1', 's-node-2', 's-node-3', 's-node-4', 's-node-5', 's-node-6', 's-node-7', 's-node-9'],
      summary: 'ãã­ãã¿ã¤ãã»ã¦ã¼ã¶ã¼ãªãµã¼ãã»ã¢ã¯ã»ã·ããªãã£ãå ããåæ¬çãªãã¶ã¤ã³æ¹éã«',
      createdAt: '2026-02-12T17:00:00Z',
    },
    // ===== user_yamada ã®ã¯ã©ã¹ã¿ã¼ =====
    {
      id: 'cluster-y1',
      taskId: 'task-yamada-1',
      userId: 'user_yamada',
      clusterType: 'ideation',
      nodeIds: ['y-node-1', 'y-node-2', 'y-node-5'],
      summary: 'Webãªãã¥ã¼ã¢ã«PJ ããã¯ã¨ã³ãè¨­è¨',
      createdAt: '2026-01-22T09:00:00Z',
    },
    {
      id: 'cluster-y2',
      taskId: 'task-yamada-1',
      userId: 'user_yamada',
      clusterType: 'result',
      nodeIds: ['y-node-1', 'y-node-2', 'y-node-3', 'y-node-4', 'y-node-5', 'y-node-6', 'y-node-7'],
      summary: 'ãã¼ã¿ãã¼ã¹ã»ã»ã­ã¥ãªãã£ã»CI/CDã»ããã©ã¼ãã³ã¹æé©åãå«ãç·åè¨­è¨ã«',
      createdAt: '2026-02-10T17:00:00Z',
    },
  ];
}

export class ClusterService {
  /**
   * ã¯ã©ã¹ã¿ã¼ä¸è¦§åå¾
   */
  static async getClusters(userId: string, taskId?: string): Promise<ClusterData[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb
          .from('node_clusters')
          .select('id, task_id, user_id, cluster_type, summary, created_at, cluster_nodes(node_id)');

        query = query.eq('user_id', userId);
        if (taskId) {
          query = query.eq('task_id', taskId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map((row: any) => ({
          id: row.id,
          taskId: row.task_id,
          userId: row.user_id,
          clusterType: row.cluster_type as 'ideation' | 'result',
          nodeIds: (row.cluster_nodes || []).map((cn: any) => cn.node_id),
          summary: row.summary,
          createdAt: row.created_at,
        }));
      } catch (error) {
        console.error('Error fetching clusters from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    let result = clustersStore.filter((c) => c.userId === userId);
    if (taskId) {
      result = result.filter((c) => c.taskId === taskId);
    }
    return result;
  }

  /**
   * ã¯ã©ã¹ã¿ã¼ãä½æã¾ãã¯æ´æ°
   */
  static async upsertCluster(
    taskId: string,
    userId: string,
    clusterType: 'ideation' | 'result',
    nodeIds: string[],
    summary?: string
  ): Promise<ClusterData> {
    const sb = getSupabase();
    if (sb) {
      try {
        const now = new Date().toISOString();
        const uniqueNodeIds = Array.from(new Set(nodeIds));

        // BugFix⑦: ON CONFLICTベースの真のupsert（race condition回避）
        const { data: upserted, error: upsertError } = await sb
          .from('node_clusters')
          .upsert(
            {
              task_id: taskId,
              user_id: userId,
              cluster_type: clusterType,
              summary: summary || '',
              created_at: now,
            },
            {
              onConflict: 'task_id,user_id,cluster_type',
            }
          )
          .select()
          .single();

        if (upsertError) throw upsertError;

        const clusterId = upserted.id;

        // cluster_nodes をリプレース（DELETE→INSERT）
        await sb.from('cluster_nodes').delete().eq('cluster_id', clusterId);

        if (uniqueNodeIds.length > 0) {
          const clusterNodeRows = uniqueNodeIds.map((nodeId: string) => ({
            cluster_id: clusterId,
            node_id: nodeId,
          }));
          await sb.from('cluster_nodes').insert(clusterNodeRows);
        }

        return {
          id: clusterId,
          taskId,
          userId,
          clusterType,
          nodeIds: uniqueNodeIds,
          summary,
          createdAt: upserted.created_at,
        };
      } catch (error) {
        console.error('Error upserting cluster to Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    const now = new Date().toISOString();

    const existing = clustersStore.find(
      (c) => c.taskId === taskId && c.userId === userId && c.clusterType === clusterType
    );

    if (existing) {
      existing.nodeIds = Array.from(new Set([...existing.nodeIds, ...nodeIds]));
      if (summary) {
        existing.summary = summary;
      }
      return existing;
    }

    const newCluster: ClusterData = {
      id: `cluster-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      taskId,
      userId,
      clusterType,
      nodeIds: Array.from(new Set(nodeIds)),
      summary,
      createdAt: now,
    };

    clustersStore.push(newCluster);
    return newCluster;
  }

  /**
   * ã¿ã¹ã¯ã®æ§æ³é¢ã¨çµæé¢ã®å·®åãè¨ç®ãã
   */
  static async getClusterDiff(taskId: string, userId: string): Promise<ClusterDiff | null> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: clusters, error } = await sb
          .from('node_clusters')
          .select('id, cluster_type, cluster_nodes(node_id)')
          .eq('task_id', taskId)
          .eq('user_id', userId);

        if (error) throw error;

        const ideation = (clusters || []).find((c) => c.cluster_type === 'ideation');
        const result = (clusters || []).find((c) => c.cluster_type === 'result');

        if (!ideation) return null;

        const ideationNodeIds = (ideation.cluster_nodes || []).map((cn: any) => cn.node_id);
        const resultNodeIds = (result?.cluster_nodes || []).map((cn: any) => cn.node_id);

        const ideationSet = new Set(ideationNodeIds);
        const resultSet = new Set(resultNodeIds);

        const addedNodeIds = Array.from(resultSet).filter((id) => !ideationSet.has(id));
        const removedNodeIds = Array.from(ideationSet).filter((id) => !resultSet.has(id));

        return {
          taskId,
          userId,
          ideationNodeIds,
          resultNodeIds,
          addedNodeIds,
          removedNodeIds,
          discoveredOnPath: addedNodeIds,
        };
      } catch (error) {
        console.error('Error fetching cluster diff from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();

    const ideation = clustersStore.find(
      (c) => c.taskId === taskId && c.userId === userId && c.clusterType === 'ideation'
    );
    const result = clustersStore.find(
      (c) => c.taskId === taskId && c.userId === userId && c.clusterType === 'result'
    );

    if (!ideation) return null;

    const ideationSet = new Set(ideation.nodeIds);
    const resultSet = new Set(result?.nodeIds || []);

    const addedNodeIds = Array.from(resultSet).filter((id) => !ideationSet.has(id));
    const removedNodeIds = Array.from(ideationSet).filter((id) => !resultSet.has(id));

    return {
      taskId,
      userId,
      ideationNodeIds: ideation.nodeIds,
      resultNodeIds: result?.nodeIds || [],
      addedNodeIds,
      removedNodeIds,
      discoveredOnPath: addedNodeIds,
    };
  }

  /**
   * ã¿ã¹ã¯ã®æ§æ³ãã§ã¼ãºä¼è©±ããã¯ã©ã¹ã¿ã¼ãèªåçæãã
   */
  static async buildIdeationCluster(
    taskId: string,
    userId: string,
    extractedNodes: NodeData[]
  ): Promise<ClusterData> {
    const nodeIds = extractedNodes.map((n) => n.id);
    return this.upsertCluster(
      taskId,
      userId,
      'ideation',
      nodeIds,
      `æ§æ³ãã§ã¼ãºã§èªè­ãã¦ãã ${nodeIds.length} åã®ãã¼ã`
    );
  }

  /**
   * ã¿ã¹ã¯ã®çµæãã§ã¼ãºè¦ç´ããã¯ã©ã¹ã¿ã¼ãèªåçæãã
   */
  static async buildResultCluster(
    taskId: string,
    userId: string,
    extractedNodes: NodeData[]
  ): Promise<ClusterData> {
    const nodeIds = extractedNodes.map((n) => n.id);
    return this.upsertCluster(
      taskId,
      userId,
      'result',
      nodeIds,
      `çµæãã§ã¼ãºã®æçµçå°ç¯å² ${nodeIds.length} åã®ãã¼ã`
    );
  }
}
