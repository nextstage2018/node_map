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
    if (taskId || seedId) {
      const [nodes, edges] = await Promise.all([
        ThoughtNodeService.getLinkedNodes({ taskId, seedId }),
        ThoughtNodeService.getEdges({ taskId, seedId }),
      ]);

      return NextResponse.json({
        success: true,
        data: { nodes, edges },
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
      .select('id, title, phase, status, created_at, updated_at')
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

    // タスク
    for (const task of (tasks || [])) {
      const [nodeRes, edgeRes] = await Promise.all([
        sb.from('thought_task_nodes').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
        sb.from('thought_edges').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
      ]);

      const nodeCount = nodeRes.count || 0;
      const edgeCount = edgeRes.count || 0;

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

    // 種
    for (const seed of (seeds || [])) {
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
