// エッジ（線）管理サービス
// ノード間の思考経路・共起関係を記録する

import { EdgeData, NodeData } from '@/lib/types';

// インメモリストア（本番はSupabase）
let edgesStore: EdgeData[] = [];

// ヘルパー：エッジ生成
function makeEdge(
  id: string, src: string, tgt: string, userId: string,
  weight: number, taskIds: string[], edgeType: EdgeData['edgeType'],
  created: string
): EdgeData {
  return {
    id, sourceNodeId: src, targetNodeId: tgt, userId, weight, taskIds, edgeType,
    createdAt: created, updatedAt: new Date().toISOString(),
  };
}

// デモ用初期データ
function initDemoData(): void {
  if (edgesStore.length > 0) return;

  edgesStore = [
    // ===== user_self =====
    makeEdge('edge-1', 'node-1', 'node-2', 'user_self', 8, ['task-demo-1', 'task-demo-2'], 'co_occurrence', '2026-02-05T10:00:00Z'),
    makeEdge('edge-2', 'node-1', 'node-3', 'user_self', 5, ['task-demo-1'], 'causal', '2026-02-08T11:00:00Z'),
    makeEdge('edge-3', 'node-2', 'node-12', 'user_self', 4, ['task-demo-2'], 'sequence', '2026-02-10T14:00:00Z'),
    makeEdge('edge-4', 'node-3', 'node-11', 'user_self', 3, ['task-demo-1'], 'co_occurrence', '2026-02-08T11:00:00Z'),
    makeEdge('edge-5', 'node-9', 'node-1', 'user_self', 7, ['task-demo-1', 'task-demo-2'], 'co_occurrence', '2026-02-01T09:00:00Z'),
    makeEdge('edge-6', 'node-6', 'node-9', 'user_self', 6, ['task-demo-1'], 'co_occurrence', '2026-02-01T09:00:00Z'),
    makeEdge('edge-7', 'node-4', 'node-5', 'user_self', 2, ['task-demo-2'], 'sequence', '2026-02-12T09:30:00Z'),
    makeEdge('edge-8', 'node-10', 'node-12', 'user_self', 4, ['task-demo-2'], 'co_occurrence', '2026-02-07T15:00:00Z'),
    makeEdge('edge-9', 'node-10', 'node-4', 'user_self', 3, ['task-demo-2'], 'co_occurrence', '2026-02-10T14:00:00Z'),
    makeEdge('edge-10', 'node-7', 'node-1', 'user_self', 4, ['task-demo-1'], 'co_occurrence', '2026-02-02T10:00:00Z'),
    makeEdge('edge-11', 'node-8', 'node-11', 'user_self', 2, ['task-demo-1'], 'co_occurrence', '2026-02-06T10:00:00Z'),
    makeEdge('edge-12', 'node-13', 'node-14', 'user_self', 2, ['task-demo-1'], 'co_occurrence', '2026-02-15T11:00:00Z'),
    makeEdge('edge-13', 'node-1', 'node-14', 'user_self', 2, ['task-demo-1'], 'causal', '2026-02-15T11:00:00Z'),
    // ===== user_tanaka =====
    makeEdge('t-edge-1', 't-node-1', 't-node-2', 'user_tanaka', 10, ['task-tanaka-1'], 'co_occurrence', '2026-01-20T10:00:00Z'),
    makeEdge('t-edge-2', 't-node-1', 't-node-3', 'user_tanaka', 8, ['task-tanaka-1'], 'causal', '2026-01-22T11:00:00Z'),
    makeEdge('t-edge-3', 't-node-3', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', '2026-01-22T11:00:00Z'),
    makeEdge('t-edge-4', 't-node-10', 't-node-2', 'user_tanaka', 9, ['task-tanaka-1', 'task-tanaka-2'], 'co_occurrence', '2026-01-20T10:00:00Z'),
    makeEdge('t-edge-5', 't-node-11', 't-node-6', 'user_tanaka', 6, ['task-tanaka-2'], 'co_occurrence', '2026-02-03T10:00:00Z'),
    makeEdge('t-edge-6', 't-node-11', 't-node-7', 'user_tanaka', 5, ['task-tanaka-2'], 'sequence', '2026-02-05T11:00:00Z'),
    makeEdge('t-edge-7', 't-node-4', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', '2026-01-25T14:00:00Z'),
    makeEdge('t-edge-8', 't-node-12', 't-node-5', 'user_tanaka', 4, ['task-tanaka-2'], 'causal', '2026-01-28T09:00:00Z'),
    makeEdge('t-edge-9', 't-node-8', 't-node-10', 'user_tanaka', 5, ['task-tanaka-1'], 'co_occurrence', '2026-01-20T10:00:00Z'),
    // ===== user_sato =====
    makeEdge('s-edge-1', 's-node-1', 's-node-2', 'user_sato', 9, ['task-sato-1'], 'co_occurrence', '2026-01-22T10:00:00Z'),
    makeEdge('s-edge-2', 's-node-2', 's-node-4', 'user_sato', 7, ['task-sato-1'], 'causal', '2026-01-25T14:00:00Z'),
    makeEdge('s-edge-3', 's-node-3', 's-node-7', 'user_sato', 6, ['task-sato-1'], 'co_occurrence', '2026-02-01T11:00:00Z'),
    makeEdge('s-edge-4', 's-node-6', 's-node-1', 'user_sato', 8, ['task-sato-1'], 'co_occurrence', '2026-01-20T09:00:00Z'),
    makeEdge('s-edge-5', 's-node-4', 's-node-5', 'user_sato', 3, ['task-sato-1'], 'sequence', '2026-02-10T09:00:00Z'),
    makeEdge('s-edge-6', 's-node-9', 's-node-2', 'user_sato', 4, ['task-sato-1'], 'co_occurrence', '2026-02-05T11:00:00Z'),
    // ===== user_yamada =====
    makeEdge('y-edge-1', 'y-node-1', 'y-node-2', 'user_yamada', 10, ['task-yamada-1'], 'co_occurrence', '2026-01-20T10:00:00Z'),
    makeEdge('y-edge-2', 'y-node-2', 'y-node-3', 'user_yamada', 8, ['task-yamada-1'], 'causal', '2026-01-22T11:00:00Z'),
    makeEdge('y-edge-3', 'y-node-1', 'y-node-4', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', '2026-02-01T14:00:00Z'),
    makeEdge('y-edge-4', 'y-node-5', 'y-node-1', 'user_yamada', 6, ['task-yamada-1'], 'co_occurrence', '2026-02-01T09:00:00Z'),
    makeEdge('y-edge-5', 'y-node-6', 'y-node-1', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', '2026-01-25T10:00:00Z'),
    makeEdge('y-edge-6', 'y-node-7', 'y-node-3', 'user_yamada', 4, ['task-yamada-1'], 'sequence', '2026-02-08T11:00:00Z'),
  ];
}

export class EdgeService {
  /**
   * ユーザーのエッジ一覧を取得
   */
  static async getEdges(userId: string, taskId?: string): Promise<EdgeData[]> {
    initDemoData();
    let result = edgesStore.filter((e) => e.userId === userId);

    if (taskId) {
      result = result.filter((e) => e.taskIds.includes(taskId));
    }

    return result.sort((a, b) => b.weight - a.weight);
  }

  /**
   * エッジを追加または重み加算（同一ペアが存在すれば）
   */
  static async upsertEdge(
    sourceNodeId: string,
    targetNodeId: string,
    userId: string,
    taskId: string,
    edgeType: EdgeData['edgeType'] = 'co_occurrence'
  ): Promise<EdgeData> {
    initDemoData();
    const now = new Date().toISOString();

    // 既存エッジ検索（方向問わず）
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
      createdAt: now,
      updatedAt: now,
    };

    edgesStore.push(newEdge);
    return newEdge;
  }

  /**
   * ノード群から共起エッジを一括生成する
   * 同一コンテキスト内で出現したノード同士をつなぐ
   */
  static async createCoOccurrenceEdges(
    nodes: NodeData[],
    userId: string,
    taskId: string
  ): Promise<EdgeData[]> {
    const edges: EdgeData[] = [];

    // 全ノードペアの組み合わせ
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const edge = await this.upsertEdge(
          nodes[i].id,
          nodes[j].id,
          userId,
          taskId,
          'co_occurrence'
        );
        edges.push(edge);
      }
    }

    return edges;
  }

  /**
   * 時系列順のノード群から順序エッジを生成する
   * タスク進行フェーズの思考経路を記録
   */
  static async createSequenceEdges(
    orderedNodes: NodeData[],
    userId: string,
    taskId: string
  ): Promise<EdgeData[]> {
    const edges: EdgeData[] = [];

    for (let i = 0; i < orderedNodes.length - 1; i++) {
      const edge = await this.upsertEdge(
        orderedNodes[i].id,
        orderedNodes[i + 1].id,
        userId,
        taskId,
        'sequence'
      );
      edges.push(edge);
    }

    return edges;
  }
}
