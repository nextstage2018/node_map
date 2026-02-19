// エッジ（線）管理サービス
// ノード間の思考経路・共起関係を記録する
// Phase 10: 本流（分野レベル）/ 支流（キーワードレベル）の区別を追加

import { EdgeData, NodeData } from '@/lib/types';
import { getSupabase } from '@/lib/supabase';

// インメモリストア（本番はSupabase）
let edgesStore: EdgeData[] = [];

// ヘルパー：エッジ生成
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

// デモ用初期データ
function initDemoData(): void {
  if (edgesStore.length > 0) return;

  edgesStore = [
    // ===== user_self =====
    // マーケティング→SEO対策（同分野：本流）
    makeEdge('edge-1', 'node-1', 'node-2', 'user_self', 8, ['task-demo-1', 'task-demo-2'], 'co_occurrence', 'main', 'bidirectional', '2026-02-05T10:00:00Z'),
    // マーケティング→コンテンツ戦略（同分野：本流、因果）
    makeEdge('edge-2', 'node-1', 'node-3', 'user_self', 5, ['task-demo-1'], 'causal', 'main', 'forward', '2026-02-08T11:00:00Z'),
    // SEO対策→コンバージョン率（異分野：支流）
    makeEdge('edge-3', 'node-2', 'node-12', 'user_self', 4, ['task-demo-2'], 'sequence', 'tributary', 'forward', '2026-02-10T14:00:00Z'),
    // コンテンツ戦略→ユーザーリサーチ（異分野：支流）
    makeEdge('edge-4', 'node-3', 'node-11', 'user_self', 3, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-08T11:00:00Z'),
    // WebリニューアルPJ→マーケティング（プロジェクト関連：支流）
    makeEdge('edge-5', 'node-9', 'node-1', 'user_self', 7, ['task-demo-1', 'task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // 田中→WebリニューアルPJ（人物関連：支流）
    makeEdge('edge-6', 'node-6', 'node-9', 'user_self', 6, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // リスティング広告→LTV分析（同分野：本流）
    makeEdge('edge-7', 'node-4', 'node-5', 'user_self', 2, ['task-demo-2'], 'sequence', 'main', 'forward', '2026-02-12T09:30:00Z'),
    // 新規顧客獲得施策→コンバージョン率（プロジェクト関連：支流）
    makeEdge('edge-8', 'node-10', 'node-12', 'user_self', 4, ['task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-07T15:00:00Z'),
    // 新規顧客獲得施策→リスティング広告（プロジェクト関連：支流）
    makeEdge('edge-9', 'node-10', 'node-4', 'user_self', 3, ['task-demo-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-10T14:00:00Z'),
    // 鈴木→マーケティング（人物関連：支流）
    makeEdge('edge-10', 'node-7', 'node-1', 'user_self', 4, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-02T10:00:00Z'),
    // 佐藤→ユーザーリサーチ（人物関連：支流）
    makeEdge('edge-11', 'node-8', 'node-11', 'user_self', 2, ['task-demo-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-06T10:00:00Z'),
    // ブランディング→SNS運用（同分野：本流）
    makeEdge('edge-12', 'node-13', 'node-14', 'user_self', 2, ['task-demo-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-15T11:00:00Z'),
    // マーケティング→SNS運用（同分野：本流、因果）
    makeEdge('edge-13', 'node-1', 'node-14', 'user_self', 2, ['task-demo-1'], 'causal', 'main', 'forward', '2026-02-15T11:00:00Z'),
    // ===== user_tanaka =====
    // 経営戦略→マーケティング（異分野：支流だが重要→本流扱い）
    makeEdge('t-edge-1', 't-node-1', 't-node-2', 'user_tanaka', 10, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-20T10:00:00Z'),
    // 経営戦略→KPI設計（同分野：本流、因果）
    makeEdge('t-edge-2', 't-node-1', 't-node-3', 'user_tanaka', 8, ['task-tanaka-1'], 'causal', 'main', 'forward', '2026-01-22T11:00:00Z'),
    // KPI設計→ROI（同分野：本流）
    makeEdge('t-edge-3', 't-node-3', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-22T11:00:00Z'),
    // WebリニューアルPJ→マーケティング（プロジェクト関連：支流）
    makeEdge('t-edge-4', 't-node-10', 't-node-2', 'user_tanaka', 9, ['task-tanaka-1', 'task-tanaka-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T10:00:00Z'),
    // 新規顧客獲得施策→コンバージョン率（プロジェクト関連：支流）
    makeEdge('t-edge-5', 't-node-11', 't-node-6', 'user_tanaka', 6, ['task-tanaka-2'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-03T10:00:00Z'),
    // 新規顧客獲得施策→LTV分析（プロジェクト関連：支流、順序）
    makeEdge('t-edge-6', 't-node-11', 't-node-7', 'user_tanaka', 5, ['task-tanaka-2'], 'sequence', 'tributary', 'forward', '2026-02-05T11:00:00Z'),
    // 予算管理→ROI（同分野：本流）
    makeEdge('t-edge-7', 't-node-4', 't-node-13', 'user_tanaka', 7, ['task-tanaka-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-25T14:00:00Z'),
    // 競合分析→SEO対策（異分野：支流、因果）
    makeEdge('t-edge-8', 't-node-12', 't-node-5', 'user_tanaka', 4, ['task-tanaka-2'], 'causal', 'tributary', 'forward', '2026-01-28T09:00:00Z'),
    // 鈴木→WebリニューアルPJ（人物関連：支流）
    makeEdge('t-edge-9', 't-node-8', 't-node-10', 'user_tanaka', 5, ['task-tanaka-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T10:00:00Z'),
    // ===== user_sato =====
    // デザイン→UI/UX（同分野：本流）
    makeEdge('s-edge-1', 's-node-1', 's-node-2', 'user_sato', 9, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-22T10:00:00Z'),
    // UI/UX→ユーザーリサーチ（同分野：本流、因果）
    makeEdge('s-edge-2', 's-node-2', 's-node-4', 'user_sato', 7, ['task-sato-1'], 'causal', 'main', 'forward', '2026-01-25T14:00:00Z'),
    // プロトタイプ→フィグマ（同分野：本流）
    makeEdge('s-edge-3', 's-node-3', 's-node-7', 'user_sato', 6, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-01T11:00:00Z'),
    // WebリニューアルPJ→デザイン（プロジェクト関連：支流）
    makeEdge('s-edge-4', 's-node-6', 's-node-1', 'user_sato', 8, ['task-sato-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-01-20T09:00:00Z'),
    // ユーザーリサーチ→コンバージョン率（異分野：支流、順序）
    makeEdge('s-edge-5', 's-node-4', 's-node-5', 'user_sato', 3, ['task-sato-1'], 'sequence', 'tributary', 'forward', '2026-02-10T09:00:00Z'),
    // アクセシビリティ→UI/UX（同分野：本流）
    makeEdge('s-edge-6', 's-node-9', 's-node-2', 'user_sato', 4, ['task-sato-1'], 'co_occurrence', 'main', 'bidirectional', '2026-02-05T11:00:00Z'),
    // ===== user_yamada =====
    // バックエンド→API設計（同分野：本流）
    makeEdge('y-edge-1', 'y-node-1', 'y-node-2', 'user_yamada', 10, ['task-yamada-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-20T10:00:00Z'),
    // API設計→データベース（同分野：本流、因果）
    makeEdge('y-edge-2', 'y-node-2', 'y-node-3', 'user_yamada', 8, ['task-yamada-1'], 'causal', 'main', 'forward', '2026-01-22T11:00:00Z'),
    // バックエンド→セキュリティ（異分野：支流）
    makeEdge('y-edge-3', 'y-node-1', 'y-node-4', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T14:00:00Z'),
    // WebリニューアルPJ→バックエンド（プロジェクト関連：支流）
    makeEdge('y-edge-4', 'y-node-5', 'y-node-1', 'user_yamada', 6, ['task-yamada-1'], 'co_occurrence', 'tributary', 'bidirectional', '2026-02-01T09:00:00Z'),
    // CI/CD→バックエンド（同分野：本流）
    makeEdge('y-edge-5', 'y-node-6', 'y-node-1', 'user_yamada', 5, ['task-yamada-1'], 'co_occurrence', 'main', 'bidirectional', '2026-01-25T10:00:00Z'),
    // パフォーマンス最適化→データベース（同分野：本流、順序）
    makeEdge('y-edge-6', 'y-node-7', 'y-node-3', 'user_yamada', 4, ['task-yamada-1'], 'sequence', 'main', 'forward', '2026-02-08T11:00:00Z'),
  ];
}

export class EdgeService {
  /**
   * ユーザーのエッジ一覧を取得
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

        if (taskId) {
          return edges.filter((e) => e.taskIds.includes(taskId));
        }
        return edges;
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
          // Increment weight
          const { data: updated } = await sb
            .from('node_edges')
            .update({
              weight: (data.weight || 0) + 1,
              updated_at: now,
            })
            .eq('id', data.id)
            .select()
            .single();

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
            weight: (updated?.weight || data.weight || 0) + 1,
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
        // 同分野のキーワード同士 → 本流、それ以外 → 支流
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
