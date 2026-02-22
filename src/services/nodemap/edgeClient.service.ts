// ã¨ãã¸ï¼ç·ï¼ç®¡çãµã¼ãã¹
// ãã¼ãéã®æèçµè·¯ã»å±èµ·é¢ä¿ãè¨é²ãã
// Phase 10: æ¬æµï¼åéã¬ãã«ï¼/ æ¯æµï¼ã­ã¼ã¯ã¼ãã¬ãã«ï¼ã®åºå¥ãè¿½å 

import { EdgeData, NodeData } from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

// ã¤ã³ã¡ã¢ãªã¹ãã¢ï¼æ¬çªã¯Supabaseï¼
let edgesStore: EdgeData[] = [];

// ãã«ãã¼ï¼ã¨ãã¸çæ
function makeEdge(
  id: string, src: string, tgt: string, userId: string,
  weight: number, taskIds: string[], edgeType: EdgeData['edgeType'],
  flowType: EdgeData['flowType'], direction: EdgeData['direction'],
  created: string
): EdgeData {
  return {
    id, sourceNodeId: src, targetNodeId: tgt, userId, weight, taskIds, edgeType,
    flowType, direction,
    createdAt: created, updatedAt: new Date().toISOString(),
  };
}

// ãã¢ç¨åæãã¼ã¿
function initDemoData(): void {
  if (edgesStore.length > 0) return;

  edgesStore = [
    // ===== user_self =====
    // ãã¼ã±ãã£ã³ã°âSEOå¯¾ç­ï¼ååéï¼æ¬æµï¼
    makeEdge('edge-1', 'node-1', 'node-2', 'user_self', 8, ['task-demo-1', 'task-demo-2'], 'co_occurrence', 'main', 'bidirectional', '2026-02-05T10:00:00Z'),
    // ãã¼ã±ãã£ã³ã°âã³ã³ãã³ãæ¦ç¥ï¼ååéï¼æ¬æµãå æï¼
    makeEdge('edge-2', 'node-1', 'node-3', 'user_self', 5, ['task-demo-1'], 'causal', 'main', 'forward', '2026-02-08T11:00:00Z'),
    // SEOå¯¾ç­âã³ã³ãã¼ã¸ã§ã³çï¼ç°åéï¼æ¯æµï¼
    makeEdge('edge-3', 'node-2', 'node-12', 'user_self', 4, ['task-demo-2'], 'sequence', 'tributary', 'forward', '2026-02-10T14:00:00Z'),
    // ã³ã³ãã³ãæ¦ç¥âã¦ã¼ã¶ã¼ãªãµã¼ãï¼ç°åéï¼æ¯æµï¼
    makeEdge('edge-4', 'node-3', 'node-11', 'user_self', 3, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-08T11:00:00Z'),
    // Webãªãã¥ã¼ã¢ã«PJâãã¼ã±ãã£ã³ã°ï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('edge-5', 'node-9', 'node-1', 'user_self', 7, ['task-demo-1', 'task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // ç°ä¸­âWebãªãã¥ã¼ã¢ã«PJï¼äººç©é¢é£ï¼æ¯æµï¼
    makeEdge('edge-6', 'node-6', 'node-9', 'user_self', 6, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // ãªã¹ãã£ã³ã°åºåâLTVåæï¼ååéï¼æ¬æµï¼
    makeEdge('edge-7', 'node-4', 'node-5', 'user_self', 2, ['task-demo-2'], 'sequence', 'main', 'forward', '2026-02-12T09:30:00Z'),
    // æ°è¦é¡§å®¢ç²å¾æ½ç­âã³ã³ãã¼ã¸ã§ã³çï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('edge-8', 'node-10', 'node-12', 'user_self', 4, ['task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-07T15:00:00Z'),
    // æ°è¦é¡§å®¢ç²å¾æ½ç­âãªã¹ãã£ã³ã°åºåï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('edge-9', 'node-10', 'node-4', 'user_self', 3, ['task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-10T14:00:00Z'),
    // é´æ¨âãã¼ã±ãã£ã³ã°ï¼äººç©é¢é£ï¼æ¯æµï¼
    makeEdge('edge-10', 'node-7', 'node-1', 'user_self', 4, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-02T10:00:00Z'),
    // ä½è¤âã¦ã¼ã¶ã¼ãªãµã¼ãï¼äººç©é¢é£ï¼æ¯æµï¼
    makeEdge('edge-11', 'node-8', 'node-11', 'user_self', 2, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-06T10:00:00Z'),
    // ãã©ã³ãã£ã³ã°âSNSéç¨ï¼ååéï¼æ¬æµï¼
    makeEdge('edge-12', 'node-13', 'node-14', 'user_self', 2, ['task-demo-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-15T11:00:00Z'),
    // ãã¼ã±ãã£ã³ã°âSNSéç¨ï¼ååéï¼æ¬æµãå æï¼
    makeEdge('edge-13', 'node-1', 'node-14', 'user_self', 2, ['task-demo-1'], 'causal', 'main', 'forward', '2026-02-15T11:00:00Z'),
    // ===== user_tanaka =====
    // çµå¶æ¦ç¥âãã¼ã±ãã£ã³ã°ï¼ç°åéï¼æ¯æµã ãéè¦âæ¬æµæ±ãï¼
    makeEdge('t-edge-1', 't-node-1', 't-node-2', 'user_tanaka', 10, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-20T10:00:00Z'),
    // çµå¶æ¦ç¥âKPIè¨­è¨ï¼ååéï¼æ¬æµãå æï¼
    makeEdge('t-edge-2', 't-node-1', 't-node-3', 'user_tanaka', 8, ['task-tanaka-1'], 'causal', 'main', 'forward', '2026-01-22T11:00:00Z'),
    // KPIè¨­è¨âROIï¼ååéï¼æ¬æµï¼
    makeEdge('t-edge-3', 't-node-3', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-22T11:00:00Z'),
    // Webãªãã¥ã¼ã¢ã«PJâãã¼ã±ãã£ã³ã°ï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('t-edge-4', 't-node-10', 't-node-2', 'user_tanaka', 9, ['task-tanaka-1', 'task-tanaka-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T10:00:00Z'),
    // æ°è¦é¡§å®¢ç²å¾æ½ç­âã³ã³ãã¼ã¸ã§ã³çï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('t-edge-5', 't-node-11', 't-node-6', 'user_tanaka', 6, ['task-tanaka-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-03T10:00:00Z'),
    // æ°è¦é¡§å®¢ç²å¾æ½ç­âLTVåæï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµãé åºï¼
    makeEdge('t-edge-6', 't-node-11', 't-node-7', 'user_tanaka', 5, ['task-tanaka-2'], 'sequence', 'tributary', 'forward', '2026-02-05T11:00:00Z'),
    // äºç®ç®¡çâROIï¼ååéï¼æ¬æµï¼
    makeEdge('t-edge-7', 't-node-4', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-25T14:00:00Z'),
    // ç«¶ååæâSEOå¯¾ç­ï¼ç°åéï¼æ¯æµãå æï¼
    makeEdge('t-edge-8', 't-node-12', 't-node-5', 'user_tanaka', 4, ['task-tanaka-2'], 'causal', 'tributary', 'forward', '2026-01-28T09:00:00Z'),
    // é´æ¨âWebãªãã¥ã¼ã¢ã«PJï¼äººç©é¢é£ï¼æ¯æµï¼
    makeEdge('t-edge-9', 't-node-8', 't-node-10', 'user_tanaka', 5, ['task-tanaka-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T10:00:00Z'),
    // ===== user_sato =====
    // ãã¶ã¤ã³âUI/UXï¼ååéï¼æ¬æµï¼
    makeEdge('s-edge-1', 's-node-1', 's-node-2', 'user_sato', 9, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-22T10:00:00Z'),
    // UI/UXâã¦ã¼ã¶ã¼ãªãµã¼ãï¼ååéï¼æ¬æµãå æï¼
    makeEdge('s-edge-2', 's-node-2', 's-node-4', 'user_sato', 7, ['task-sato-1'], 'causal', 'main', 'forward', '2026-01-25T14:00:00Z'),
    // ãã­ãã¿ã¤ãâãã£ã°ãï¼ååéï¼æ¬æµï¼
    makeEdge('s-edge-3', 's-node-3', 's-node-7', 'user_sato', 6, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-01T11:00:00Z'),
    // Webãªãã¥ã¼ã¢ã«PJâãã¶ã¤ã³ï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('s-edge-4', 's-node-6', 's-node-1', 'user_sato', 8, ['task-sato-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T09:00:00Z'),
    // ã¦ã¼ã¶ã¼ãªãµã¼ãâã³ã³ãã¼ã¸ã§ã³çï¼ç°åéï¼æ¯æµãé åºï¼
    makeEdge('s-edge-5', 's-node-4', 's-node-5', 'user_sato', 3, ['task-sato-1'], 'sequence', 'tributary', 'forward', '2026-02-10T09:00:00Z'),
    // ã¢ã¯ã»ã·ããªãã£âUI/UXï¼ååéï¼æ¬æµï¼
    makeEdge('s-edge-6', 's-node-9', 's-node-2', 'user_sato', 4, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-05T11:00:00Z'),
    // ===== user_yamada =====
    // ããã¯ã¨ã³ãâAPIè¨­è¨ï¼ååéï¼æ¬æµï¼
    makeEdge('y-edge-1', 'y-node-1', 'y-node-2', 'user_yamada', 10, ['task-yamada-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-20T10:00:00Z'),
    // APIè¨­è¨âãã¼ã¿ãã¼ã¹ï¼ååéï¼æ¬æµãå æï¼
    makeEdge('y-edge-2', 'y-node-2', 'y-node-3', 'user_yamada', 8, ['task-yamada-1'], 'causal', 'main', 'forward', '2026-01-22T11:00:00Z'),
    // ããã¯ã¨ã³ãâã»ã­ã¥ãªãã£ï¼ç°åéï¼æ¯æµï¼
    makeEdge('y-edge-3', 'y-node-1', 'y-node-4', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T14:00:00Z'),
    // Webãªãã¥ã¼ã¢ã«PJâããã¯ã¨ã³ãï¼ãã­ã¸ã§ã¯ãé¢é£ï¼æ¯æµï¼
    makeEdge('y-edge-4', 'y-node-5', 'y-node-1', 'user_yamada', 6, ['task-yamada-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // CI/CDâããã¯ã¨ã³ãï¼ååéï¼æ¬æµï¼
    makeEdge('y-edge-5', 'y-node-6', 'y-node-1', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-25T10:00:00Z'),
    // ããã©ã¼ãã³ã¹æé©åâãã¼ã¿ãã¼ã¹ï¼ååéï¼æ¬æµãé åºï¼
    makeEdge('y-edge-6', 'y-node-7', 'y-node-3', 'user_yamada', 4, ['task-yamada-1'], 'sequence', 'main', 'forward', '2026-02-08T11:00:00Z'),
  ];
}

export class EdgeService {
  /**
   * ã¦ã¼ã¶ã¼ã®ã¨ãã¸ä¸è¦§ãåå¾
   */
  static async getEdges(userId: string, taskId?: string): Promise<EdgeData[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb
          .from('node_edges')
          .select('id, source_node_id, target_node_id, user_id, weight, edge_type, flow_type, direction, checkpoint_id, created_at, updated_at, edge_tasks(task_id)');

        query = query.eq('user_id', userId);

        const { data, error } = await query.order('weight', { ascending: false });
        if (error) throw error;

        const edges = (data || []).map((row: any) => ({
          id: row.id,
          sourceNodeId: row.source_node_id,
          targetNodeId: row.target_node_id,
          userId: row.user_id,
          weight: row.weight,
          taskIds: (row.edge_tasks || []).map((et: any) => et.task_id),
          edgeType: row.edge_type as EdgeData['edgeType'],
          flowType: row.flow_type as EdgeData['flowType'],
          direction: row.direction as EdgeData['direction'],
          checkpointId: row.checkpoint_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        // BugFix⑥: bidirectionalエッジの逆方向ミラーを追加
        const mirroredEdges: EdgeData[] = [];
        for (const edge of edges) {
          if (edge.direction === 'bidirectional') {
            mirroredEdges.push({
              ...edge,
              id: `${edge.id}-mirror`,
              sourceNodeId: edge.targetNodeId,
              targetNodeId: edge.sourceNodeId,
            });
          }
        }
        const allEdges = [...edges, ...mirroredEdges];

        if (taskId) {
          return allEdges.filter(e => e.taskIds.includes(taskId));
        }

        return allEdges;
      } catch (error) {
        console.error('Error fetching edges from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    let result = edgesStore.filter((e) => e.userId === userId);

    if (taskId) {
      result = result.filter((e) => e.taskIds.includes(taskId));
    }

    // BugFix⑥: bidirectionalエッジの逆方向ミラーを追加（デモデータ）
    const mirroredResult: EdgeData[] = [];
    for (const edge of result) {
      if (edge.direction === 'bidirectional') {
        mirroredResult.push({
          ...edge,
          id: `${edge.id}-mirror`,
          sourceNodeId: edge.targetNodeId,
          targetNodeId: edge.sourceNodeId,
        });
      }
    }
    result = [...result, ...mirroredResult];

    return result.sort((a, b) => b.weight - a.weight);
  }

  /**
   * ã¨ãã¸ãè¿½å ã¾ãã¯éã¿å ç®ï¼åä¸ãã¢ãå­å¨ããã°ï¼
   */
  static async upsertEdge(
    sourceNodeId: string,
    targetNodeId: string,
    userId: string,
    taskId: string,
    edgeType: EdgeData['edgeType'] = 'co_occurrence',
    flowType: EdgeData['flowType'] = 'tributary',
    direction: EdgeData['direction'] = 'bidirectional'
  ): Promise<EdgeData> {
    const sb = getSupabase();
    if (sb) {
      try {
        const now = new Date().toISOString();

        // Upsert edge on (source_node_id, target_node_id, user_id, edge_type) conflict
        const { data, error } = await sb
          .from('node_edges')
          .upsert(
            {
              source_node_id: sourceNodeId,
              target_node_id: targetNodeId,
              user_id: userId,
              weight: 1,
              edge_type: edgeType,
              flow_type: flowType,
              direction,
              updated_at: now,
            },
            { onConflict: 'source_node_id,target_node_id,user_id,edge_type' }
          )
          .select()
          .single();

        if (error) throw error;

        if (data) {
          // BugFix④: Increment weight only for existing edges (not newly created)
          // upsert creates new edge with weight:1, existing edge keeps its weight
          // We only increment if this was an existing edge
          const isExisting = (data.weight || 0) > 1;
          let updated: any = data;
          if (isExisting) {
            const { data: updatedData } = await sb
              .from('node_edges')
              .update({
                weight: (data.weight || 0) + 1,
                updated_at: now,
              })
              .eq('id', data.id)
              .select()
              .single();
            if (updatedData) updated = updatedData;
          }

          // Add task association
          await sb.from('edge_tasks').upsert(
            {
              edge_id: data.id,
              task_id: taskId,
            },
            { onConflict: 'edge_id,task_id' }
          );

          return {
            id: data.id,
            sourceNodeId: data.source_node_id,
            targetNodeId: data.target_node_id,
            userId: data.user_id,
            weight: updated?.weight || data.weight || 1,
            taskIds: [taskId],
            edgeType: data.edge_type as EdgeData['edgeType'],
            flowType: data.flow_type as EdgeData['flowType'],
            direction: data.direction as EdgeData['direction'],
            checkpointId: data.checkpoint_id,
            createdAt: data.created_at,
            updatedAt: updated?.updated_at || now,
          };
        }
      } catch (error) {
        console.error('Error upserting edge to Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    const now = new Date().toISOString();

    const existing = edgesStore.find(
      (e) =>
        e.userId === userId &&
        e.edgeType === edgeType &&
        ((e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId) ||
          (e.sourceNodeId === targetNodeId && e.targetNodeId === sourceNodeId))
    );

    if (existing) {
      existing.weight += 1;
      existing.updatedAt = now;
      if (!existing.taskIds.includes(taskId)) {
        existing.taskIds.push(taskId);
      }
      return existing;
    }

    const newEdge: EdgeData = {
      id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceNodeId,
      targetNodeId,
      userId,
      weight: 1,
      taskIds: [taskId],
      edgeType,
      flowType,
      direction,
      createdAt: now,
      updatedAt: now,
    };

    edgesStore.push(newEdge);
    return newEdge;
  }

  /**
   * ãã¼ãç¾¤ããå±èµ·ã¨ãã¸ãä¸æ¬çæãã
   * åä¸ã³ã³ãã­ã¹ãåã§åºç¾ãããã¼ãåå£«ãã¤ãªã
   */
  static async createCoOccurrenceEdges(
    nodes: NodeData[],
    userId: string,
    taskId: string
  ): Promise<EdgeData[]> {
    const edges: EdgeData[] = [];

    // å¨ãã¼ããã¢ã®çµã¿åãã
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        // ååéã®ã­ã¼ã¯ã¼ãåå£« â æ¬æµãããä»¥å¤ â æ¯æµ
        const bothKeywords = nodes[i].type === 'keyword' && nodes[j].type === 'keyword';
        const sameField = bothKeywords && nodes[i].fieldId && nodes[i].fieldId === nodes[j].fieldId;
        const flowType: EdgeData['flowType'] = sameField ? 'main' : 'tributary';

        const edge = await this.upsertEdge(
          nodes[i].id,
          nodes[j].id,
          userId,
          taskId,
          'co_occurrence',
          flowType,
          'bidirectional'
        );
        edges.push(edge);
      }
    }

    return edges;
  }

  /**
   * æç³»åé ã®ãã¼ãç¾¤ããé åºã¨ãã¸ãçæãã
   * ã¿ã¹ã¯é²è¡ãã§ã¼ãºã®æèçµè·¯ãè¨é²
   */
  static async createSequenceEdges(
    orderedNodes: NodeData[],
    userId: string,
    taskId: string
  ): Promise<EdgeData[]> {
    const edges: EdgeData[] = [];

    for (let i = 0; i < orderedNodes.length - 1; i++) {
      const bothKeywords = orderedNodes[i].type === 'keyword' && orderedNodes[i + 1].type === 'keyword';
      const sameField = bothKeywords && orderedNodes[i].fieldId && orderedNodes[i].fieldId === orderedNodes[i + 1].fieldId;
      const flowType: EdgeData['flowType'] = sameField ? 'main' : 'tributary';

      const edge = await this.upsertEdge(
        orderedNodes[i].id,
        orderedNodes[i + 1].id,
        userId,
        taskId,
        'sequence',
        flowType,
        'forward'
      );
      edges.push(edge);
    }

    return edges;
  }
}
