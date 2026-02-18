// エッジ（線）管理サービス
// ノード間の思考経路・共起関係を記録する

import { EdgeData, NodeData } from '@/lib/types';

// インメモリストア（本番はSupabase）
let edgesStore: EdgeData[] = [];

// デモ用初期データ
function initDemoData(): void {
  if (edgesStore.length > 0) return;

  const now = new Date().toISOString();
  const userId = 'demo-user';

  edgesStore = [
    // マーケティング ↔ SEO対策（強い関連）
    {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-2',
      userId,
      weight: 8,
      taskIds: ['task-demo-1', 'task-demo-2'],
      edgeType: 'co_occurrence',
      createdAt: '2026-02-05T10:00:00Z',
      updatedAt: now,
    },
    // マーケティング → コンテンツ戦略（因果）
    {
      id: 'edge-2',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-3',
      userId,
      weight: 5,
      taskIds: ['task-demo-1'],
      edgeType: 'causal',
      createdAt: '2026-02-08T11:00:00Z',
      updatedAt: now,
    },
    // SEO対策 → コンバージョン率（順序）
    {
      id: 'edge-3',
      sourceNodeId: 'node-2',
      targetNodeId: 'node-12',
      userId,
      weight: 4,
      taskIds: ['task-demo-2'],
      edgeType: 'sequence',
      createdAt: '2026-02-10T14:00:00Z',
      updatedAt: now,
    },
    // コンテンツ戦略 ↔ ユーザーリサーチ
    {
      id: 'edge-4',
      sourceNodeId: 'node-3',
      targetNodeId: 'node-11',
      userId,
      weight: 3,
      taskIds: ['task-demo-1'],
      edgeType: 'co_occurrence',
      createdAt: '2026-02-08T11:00:00Z',
      updatedAt: now,
    },
    // WebリニューアルPJ ↔ マーケティング
    {
      id: 'edge-5',
      sourceNodeId: 'node-9',
      targetNodeId: 'node-1',
      userId,
      weight: 7,
      taskIds: ['task-demo-1', 'task-demo-2'],
      edgeType: 'co_occurrence',
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    // 田中 ↔ WebリニューアルPJ
    {
      id: 'edge-6',
      sourceNodeId: 'node-6',
      targetNodeId: 'node-9',
      userId,
      weight: 6,
      taskIds: ['task-demo-1'],
      edgeType: 'co_occurrence',
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    // リスティング広告 → LTV分析（順序）
    {
      id: 'edge-7',
      sourceNodeId: 'node-4',
      targetNodeId: 'node-5',
      userId,
      weight: 2,
      taskIds: ['task-demo-2'],
      edgeType: 'sequence',
      createdAt: '2026-02-12T09:30:00Z',
      updatedAt: now,
    },
    // 新規顧客獲得施策 ↔ コンバージョン率
    {
      id: 'edge-8',
      sourceNodeId: 'node-10',
      targetNodeId: 'node-12',
      userId,
      weight: 4,
      taskIds: ['task-demo-2'],
      edgeType: 'co_occurrence',
      createdAt: '2026-02-07T15:00:00Z',
      updatedAt: now,
    },
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
