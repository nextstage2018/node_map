// クラスター（面）管理サービス
// タスクに対する認識範囲（構想面・結果面）を管理する

import { ClusterData, ClusterDiff, NodeData } from '@/lib/types';

// インメモリストア（本番はSupabase）
let clustersStore: ClusterData[] = [];

// デモ用初期データ
function initDemoData(): void {
  if (clustersStore.length > 0) return;

  const userId = 'demo-user';

  clustersStore = [
    // タスク1の構想面（マーケティング・SEO・田中・WebリニューアルPJ）
    {
      id: 'cluster-1',
      taskId: 'task-demo-1',
      userId,
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-2', 'node-6', 'node-9'],
      summary: 'WebリニューアルPJのマーケティングとSEO対策について、田中さんと方針を検討',
      createdAt: '2026-02-08T09:00:00Z',
    },
    // タスク1の結果面（構想 + コンテンツ戦略・ユーザーリサーチ・コンバージョン率が追加）
    {
      id: 'cluster-2',
      taskId: 'task-demo-1',
      userId,
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-3', 'node-6', 'node-9', 'node-11', 'node-12'],
      summary: 'コンテンツ戦略とユーザーリサーチの観点を追加。コンバージョン率の指標も取り入れた総合的な方針に',
      createdAt: '2026-02-10T17:00:00Z',
    },
    // タスク2の構想面
    {
      id: 'cluster-3',
      taskId: 'task-demo-2',
      userId,
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-4', 'node-10'],
      summary: '新規顧客獲得のためリスティング広告を検討',
      createdAt: '2026-02-12T09:00:00Z',
    },
    // タスク2の結果面
    {
      id: 'cluster-4',
      taskId: 'task-demo-2',
      userId,
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-4', 'node-5', 'node-10', 'node-12'],
      summary: 'リスティング広告にSEO・LTV分析・コンバージョン率の視点を加えた施策に拡張',
      createdAt: '2026-02-14T18:00:00Z',
    },
  ];
}

export class ClusterService {
  /**
   * クラスター一覧取得
   */
  static async getClusters(userId: string, taskId?: string): Promise<ClusterData[]> {
    initDemoData();
    let result = clustersStore.filter((c) => c.userId === userId);
    if (taskId) {
      result = result.filter((c) => c.taskId === taskId);
    }
    return result;
  }

  /**
   * クラスターを作成または更新
   */
  static async upsertCluster(
    taskId: string,
    userId: string,
    clusterType: 'ideation' | 'result',
    nodeIds: string[],
    summary?: string
  ): Promise<ClusterData> {
    initDemoData();
    const now = new Date().toISOString();

    // 既存クラスター検索
    const existing = clustersStore.find(
      (c) => c.taskId === taskId && c.userId === userId && c.clusterType === clusterType
    );

    if (existing) {
      // ノードIDをマージ（重複除去）
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
   * タスクの構想面と結果面の差分を計算する
   */
  static async getClusterDiff(taskId: string, userId: string): Promise<ClusterDiff | null> {
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

    // 結果にあって構想になかったノード（広がった範囲）
    const addedNodeIds = Array.from(resultSet).filter((id) => !ideationSet.has(id));

    // 構想にあって結果になかったノード（狭まった範囲）
    const removedNodeIds = Array.from(ideationSet).filter((id) => !resultSet.has(id));

    return {
      taskId,
      userId,
      ideationNodeIds: ideation.nodeIds,
      resultNodeIds: result?.nodeIds || [],
      addedNodeIds,
      removedNodeIds,
      discoveredOnPath: addedNodeIds, // 経路上の発見 ≈ 追加されたノード
    };
  }

  /**
   * タスクの構想フェーズ会話からクラスターを自動生成する
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
      `構想フェーズで認識していた ${nodeIds.length} 個のノード`
    );
  }

  /**
   * タスクの結果フェーズ要約からクラスターを自動生成する
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
      `結果フェーズの最終着地範囲 ${nodeIds.length} 個のノード`
    );
  }
}
