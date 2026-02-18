// クラスター（面）管理サービス
// タスクに対する認識範囲（構想面・結果面）を管理する

import { ClusterData, ClusterDiff, NodeData } from '@/lib/types';

// インメモリストア（本番はSupabase）
let clustersStore: ClusterData[] = [];

// デモ用初期データ
function initDemoData(): void {
  if (clustersStore.length > 0) return;

  clustersStore = [
    // ===== user_self のクラスター =====
    // タスク1: Webリニューアル マーケティング方針
    {
      id: 'cluster-1',
      taskId: 'task-demo-1',
      userId: 'user_self',
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-2', 'node-6', 'node-9'],
      summary: 'Webリニューアル マーケティング方針',
      createdAt: '2026-02-08T09:00:00Z',
    },
    {
      id: 'cluster-2',
      taskId: 'task-demo-1',
      userId: 'user_self',
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-3', 'node-6', 'node-9', 'node-11', 'node-12', 'node-13', 'node-14'],
      summary: 'コンテンツ戦略・ユーザーリサーチ・ブランディング・SNS運用を含む総合方針に拡大',
      createdAt: '2026-02-10T17:00:00Z',
    },
    // タスク2: 新規顧客獲得の広告施策
    {
      id: 'cluster-3',
      taskId: 'task-demo-2',
      userId: 'user_self',
      clusterType: 'ideation',
      nodeIds: ['node-1', 'node-4', 'node-10'],
      summary: '新規顧客獲得の広告施策',
      createdAt: '2026-02-12T09:00:00Z',
    },
    {
      id: 'cluster-4',
      taskId: 'task-demo-2',
      userId: 'user_self',
      clusterType: 'result',
      nodeIds: ['node-1', 'node-2', 'node-4', 'node-5', 'node-10', 'node-12'],
      summary: 'リスティング広告にSEO・LTV分析・コンバージョン率の視点を加えた施策に拡張',
      createdAt: '2026-02-14T18:00:00Z',
    },
    // ===== user_tanaka のクラスター =====
    // タスク: Webリニューアル全体戦略
    {
      id: 'cluster-t1',
      taskId: 'task-tanaka-1',
      userId: 'user_tanaka',
      clusterType: 'ideation',
      nodeIds: ['t-node-1', 't-node-2', 't-node-10', 't-node-4'],
      summary: 'Webリニューアル全体戦略',
      createdAt: '2026-01-20T09:00:00Z',
    },
    {
      id: 'cluster-t2',
      taskId: 'task-tanaka-1',
      userId: 'user_tanaka',
      clusterType: 'result',
      nodeIds: ['t-node-1', 't-node-2', 't-node-3', 't-node-4', 't-node-10', 't-node-12', 't-node-13'],
      summary: 'KPI設計・競合分析・ROIを含む包括的な戦略に発展',
      createdAt: '2026-02-05T17:00:00Z',
    },
    // タスク: 顧客獲得コスト最適化
    {
      id: 'cluster-t3',
      taskId: 'task-tanaka-2',
      userId: 'user_tanaka',
      clusterType: 'ideation',
      nodeIds: ['t-node-11', 't-node-6', 't-node-7'],
      summary: '顧客獲得コスト最適化',
      createdAt: '2026-02-03T09:00:00Z',
    },
    {
      id: 'cluster-t4',
      taskId: 'task-tanaka-2',
      userId: 'user_tanaka',
      clusterType: 'result',
      nodeIds: ['t-node-5', 't-node-6', 't-node-7', 't-node-11', 't-node-12'],
      summary: 'SEO・競合分析の視点を追加し、コスト効率の高い施策を特定',
      createdAt: '2026-02-10T17:00:00Z',
    },
    // ===== user_sato のクラスター =====
    {
      id: 'cluster-s1',
      taskId: 'task-sato-1',
      userId: 'user_sato',
      clusterType: 'ideation',
      nodeIds: ['s-node-1', 's-node-2', 's-node-6'],
      summary: 'WebリニューアルPJ デザイン刷新',
      createdAt: '2026-01-22T09:00:00Z',
    },
    {
      id: 'cluster-s2',
      taskId: 'task-sato-1',
      userId: 'user_sato',
      clusterType: 'result',
      nodeIds: ['s-node-1', 's-node-2', 's-node-3', 's-node-4', 's-node-5', 's-node-6', 's-node-7', 's-node-9'],
      summary: 'プロトタイプ・ユーザーリサーチ・アクセシビリティを加えた包括的なデザイン方針に',
      createdAt: '2026-02-12T17:00:00Z',
    },
    // ===== user_yamada のクラスター =====
    {
      id: 'cluster-y1',
      taskId: 'task-yamada-1',
      userId: 'user_yamada',
      clusterType: 'ideation',
      nodeIds: ['y-node-1', 'y-node-2', 'y-node-5'],
      summary: 'WebリニューアルPJ バックエンド設計',
      createdAt: '2026-01-22T09:00:00Z',
    },
    {
      id: 'cluster-y2',
      taskId: 'task-yamada-1',
      userId: 'user_yamada',
      clusterType: 'result',
      nodeIds: ['y-node-1', 'y-node-2', 'y-node-3', 'y-node-4', 'y-node-5', 'y-node-6', 'y-node-7'],
      summary: 'データベース・セキュリティ・CI/CD・パフォーマンス最適化を含む総合設計に',
      createdAt: '2026-02-10T17:00:00Z',
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
