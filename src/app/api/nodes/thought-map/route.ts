// Phase 42f: 思考マップデータ取得API
// 他メンバーが特定ユーザーのタスク/種の思考動線を閲覧するためのAPI
// GET ?userId=xxx — そのユーザーのタスク一覧（思考ノード付き）
// GET ?userId=xxx&taskId=yyy — 特定タスクの思考ノード＋エッジ

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 認証確認（閲覧者自身の認証）
    const viewerId = await getServerUserId();
    if (!viewerId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const taskId = searchParams.get('taskId') || undefined;
    const seedId = searchParams.get('seedId') || undefined;

    // ユーザー指定なし → 組織内の全ユーザー一覧（思考ノード数付き）を返す
    if (!targetUserId) {
      const users = await getThoughtMapUsers();
      return NextResponse.json({ success: true, data: { users } });
    }

    // タスク/種 指定あり → そのタスクの思考ノード＋エッジを返す
    // タスクの場合は元の種のノード+エッジも統合して返す（一連の思考の流れ）
    if (taskId || seedId) {
      let allNodes: any[] = [];
      let allEdges: any[] = [];

      if (taskId) {
        // タスクのノード+エッジ
        const [taskNodes, taskEdges] = await Promise.all([
          ThoughtNodeService.getLinkedNodes({ taskId }),
          ThoughtNodeService.getEdges({ taskId }),
        ]);
        allNodes.push(...taskNodes);
        allEdges.push(...taskEdges);

        // 元の種があれば、種のノード+エッジも統合
        const sb = getServerSupabase() || getSupabase();
        if (sb) {
          const { data: taskData } = await sb
            .from('tasks')
            .select('seed_id')
            .eq('id', taskId)
            .maybeSingle();

          if (taskData?.seed_id) {
            const [seedNodes, seedEdges] = await Promise.all([
              ThoughtNodeService.getLinkedNodes({ seedId: taskData.seed_id }),
              ThoughtNodeService.getEdges({ seedId: taskData.seed_id }),
            ]);

            // 種のノードは必ず seed フェーズ（重複ノードは除外）
            const existingNodeIds = new Set(allNodes.map(n => n.nodeId));
            for (const sn of seedNodes) {
              if (!existingNodeIds.has(sn.nodeId)) {
                sn.appearPhase = 'seed'; // 種由来は常に seed ゾーン
                allNodes.push(sn);
              }
            }

            // 種のエッジも統合（重複除外）
            const existingEdgeKeys = new Set(allEdges.map(e => `${e.fromNodeId}-${e.toNodeId}`));
            for (const se of seedEdges) {
              const key = `${se.fromNodeId}-${se.toNodeId}`;
              if (!existingEdgeKeys.has(key)) {
                allEdges.push(se);
              }
            }
          }
        }
      } else {
        // 種を直接指定した場合
        const [nodes, edges] = await Promise.all([
          ThoughtNodeService.getLinkedNodes({ seedId }),
          ThoughtNodeService.getEdges({ seedId }),
        ]);
        allNodes = nodes;
        allEdges = edges;
      }

      // appearOrder を通し番号に振り直し（種→タスクの時系列順）
      allNodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      allNodes.forEach((n, i) => { n.appearOrder = i + 1; });

      return NextResponse.json({
        success: true,
        data: { nodes: allNodes, edges: allEdges },
      });
    }

    // ユーザー指定あり、タスク/種なし → そのユーザーのタスク一覧（ノード数付き）
    const tasks = await getUserTasksWithNodeCount(targetUserId);
    return NextResponse.json({
      success: true,
      data: { tasks },
    });
  } catch (error) {
    console.error('[Thought Map API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '思考マップデータの取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * 思考ノードを持つユーザー一覧を取得
 */
async function getThoughtMapUsers(): Promise<{
  userId: string;
  nodeCount: number;
  taskCount: number;
}[]> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return [];

  try {
    // thought_task_nodes からユーザーごとの集計
    const { data, error } = await sb
      .from('thought_task_nodes')
      .select('user_id');

    if (error || !data) return [];

    // ユーザーごとに集計
    const userMap = new Map<string, { nodeCount: number; taskIds: Set<string> }>();
    for (const row of data) {
      const uid = row.user_id;
      if (!userMap.has(uid)) {
        userMap.set(uid, { nodeCount: 0, taskIds: new Set() });
      }
      const entry = userMap.get(uid)!;
      entry.nodeCount++;
    }

    // タスク数も取得
    const { data: taskData } = await sb
      .from('thought_task_nodes')
      .select('user_id, task_id, seed_id');

    if (taskData) {
      for (const row of taskData) {
        const uid = row.user_id;
        if (!userMap.has(uid)) continue;
        const entry = userMap.get(uid)!;
        if (row.task_id) entry.taskIds.add(row.task_id);
        if (row.seed_id) entry.taskIds.add(`seed:${row.seed_id}`);
      }
    }

    return Array.from(userMap.entries()).map(([userId, info]) => ({
      userId,
      nodeCount: info.nodeCount,
      taskCount: info.taskIds.size,
    }));
  } catch {
    return [];
  }
}

/**
 * 特定ユーザーのタスク一覧（思考ノード数付き）
 */
async function getUserTasksWithNodeCount(userId: string): Promise<{
  id: string;
  type: 'task' | 'seed';
  title: string;
  phase: string;
  status: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}[]> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return [];

  try {
    // ユーザーのタスク一覧
    const { data: tasks } = await sb
      .from('tasks')
      .select('id, title, phase, status, seed_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // ユーザーの種一覧
    const { data: seeds } = await sb
      .from('seeds')
      .select('id, content, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    // 各タスク/種のノード数とエッジ数を取得
    const result: typeof getUserTasksWithNodeCount extends (...args: any) => Promise<infer R> ? R : never = [];

    // タスク（元の種のノード数も加算）
    for (const task of (tasks || [])) {
      const countPromises: Promise<any>[] = [
        sb.from('thought_task_nodes').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
        sb.from('thought_edges').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
      ];
      // 元の種のノード数も加算
      if (task.seed_id) {
        countPromises.push(
          sb.from('thought_task_nodes').select('id', { count: 'exact', head: true }).eq('seed_id', task.seed_id),
          sb.from('thought_edges').select('id', { count: 'exact', head: true }).eq('seed_id', task.seed_id),
        );
      }

      const counts = await Promise.all(countPromises);
      const nodeCount = (counts[0].count || 0) + (counts[2]?.count || 0);
      const edgeCount = (counts[1].count || 0) + (counts[3]?.count || 0);

      // ノードが1つ以上あるタスクのみ表示
      if (nodeCount > 0) {
        result.push({
          id: task.id,
          type: 'task',
          title: task.title,
          phase: task.phase || 'ideation',
          status: task.status || 'todo',
          nodeCount,
          edgeCount,
          createdAt: task.created_at,
          updatedAt: task.updated_at,
        });
      }
    }

    // タスク化済みの種IDを収集（タスク側で統合表示するため）
    const taskifiedSeedIds = new Set(
      (tasks || []).filter(t => t.seed_id).map(t => t.seed_id)
    );

    // 種（タスク化されていないもののみ表示）
    for (const seed of (seeds || [])) {
      // この種が既にタスク化されていれば、タスク側で統合表示するのでスキップ
      if (taskifiedSeedIds.has(seed.id)) continue;

      const [nodeRes, edgeRes] = await Promise.all([
        sb.from('thought_task_nodes').select('id', { count: 'exact', head: true }).eq('seed_id', seed.id),
        sb.from('thought_edges').select('id', { count: 'exact', head: true }).eq('seed_id', seed.id),
      ]);

      const nodeCount = nodeRes.count || 0;
      const edgeCount = edgeRes.count || 0;

      if (nodeCount > 0) {
        result.push({
          id: seed.id,
          type: 'seed',
          title: seed.content?.slice(0, 50) + (seed.content?.length > 50 ? '...' : ''),
          phase: 'seed',
          status: seed.status,
          nodeCount,
          edgeCount,
          createdAt: seed.created_at,
          updatedAt: seed.created_at,
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[Thought Map] getUserTasksWithNodeCount エラー:', error);
    return [];
  }
}
