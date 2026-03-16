// Phase 42f: 思考マップデータ取得API
// 他メンバーが特定ユーザーのタスク/種の思考動線を閲覧するためのAPI
// GET — 全ユーザー一覧（思考ノード数付き）
// GET ?userId=xxx&mode=overview — そのユーザーの全ノード＋全エッジ（全体マップ）
// GET ?userId=xxx — そのユーザーのタスク一覧（個別トレースのステップ2）
// GET ?userId=xxx&taskId=yyy — 特定タスクの思考ノード＋エッジ（個別トレース）

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
    const rawUserId = searchParams.get('userId');
    // 'current' の場合は認証済みユーザーのIDに解決
    const targetUserId = rawUserId === 'current' ? viewerId : rawUserId;
    const taskId = searchParams.get('taskId') || undefined;
    const seedId = searchParams.get('seedId') || undefined;
    const milestoneId = searchParams.get('milestoneId') || undefined; // V2-H
    const projectId = searchParams.get('projectId') || undefined; // V2-H
    const mode = searchParams.get('mode'); // 'overview' = 全体マップ

    // 思考マップ用: プロジェクト内のチェックポイント70点以上タスク一覧（userIdなしでもOK）
    if (projectId && mode === 'qualified-tasks') {
      const { tasks: qualifiedTasks, debug } = await getQualifiedTasks(projectId, viewerId);
      return NextResponse.json({
        success: true,
        data: { tasks: qualifiedTasks, debug },
      });
    }

    // ユーザー指定なし → 組織内の全ユーザー一覧（思考ノード数付き）を返す
    if (!targetUserId) {
      const users = await getThoughtMapUsers();
      return NextResponse.json({ success: true, data: { users } });
    }

    // 全体マップモード: そのユーザーの全ノード＋全エッジを返す
    if (mode === 'overview') {
      const overviewData = await getUserOverviewMap(targetUserId);
      return NextResponse.json({ success: true, data: overviewData });
    }

    // V2-H: マイルストーンスコープ — milestone_id でフィルタした思考ノード＋エッジを返す
    if (milestoneId) {
      const milestoneNodes = await ThoughtNodeService.getLinkedNodes({ milestoneId });
      // マイルストーンに紐づくノードのIDセットを作成
      const milestoneNodeIds = new Set(milestoneNodes.map(n => n.nodeId));
      // そのノードに関連するエッジを取得（ユーザーの全エッジからフィルタ）
      const sb = getServerSupabase() || getSupabase();
      let filteredEdges: any[] = [];
      if (sb && targetUserId) {
        const { data: allEdges } = await sb
          .from('thought_edges')
          .select('*')
          .eq('user_id', targetUserId)
          .order('edge_order', { ascending: true });
        // 両端のノードがマイルストーンスコープ内のエッジのみ
        filteredEdges = (allEdges || [])
          .filter((e: any) => milestoneNodeIds.has(e.from_node_id) && milestoneNodeIds.has(e.to_node_id))
          .map((row: any) => ({
            id: row.id,
            fromNodeId: row.from_node_id,
            toNodeId: row.to_node_id,
            edgeType: row.edge_type,
            edgeOrder: row.edge_order,
            taskId: row.task_id,
            seedId: row.seed_id,
          }));
      }

      // マイルストーン情報も返す
      let milestoneInfo = null;
      if (sb) {
        const { data: ms } = await sb
          .from('milestones')
          .select('id, title, description, start_context, status, target_date')
          .eq('id', milestoneId)
          .maybeSingle();
        milestoneInfo = ms;
      }

      return NextResponse.json({
        success: true,
        data: {
          nodes: milestoneNodes,
          edges: filteredEdges,
          milestone: milestoneInfo,
        },
      });
    }

    // V2-H: プロジェクトスコープ — projectIdに属するマイルストーン一覧を返す（思考マップUIのフィルタ用）
    if (projectId && mode === 'milestones') {
      const sb = getServerSupabase() || getSupabase();
      if (sb) {
        const { data: milestones } = await sb
          .from('milestones')
          .select('id, title, description, start_context, status, target_date, sort_order')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true });
        return NextResponse.json({
          success: true,
          data: { milestones: milestones || [] },
        });
      }
    }

    // タスク/種 指定あり → そのタスクの思考ノード＋エッジを返す
    // タスクの場合は元の種のノード+エッジも統合して返す（一連の思考の流れ）
    // + 会話ターンデータも返す（思考マップの再生用）
    if (taskId || seedId) {
      let allNodes: any[] = [];
      let allEdges: any[] = [];
      let conversations: any[] = [];

      if (taskId) {
        // タスクのノード+エッジ
        const [taskNodes, taskEdges] = await Promise.all([
          ThoughtNodeService.getLinkedNodes({ taskId }),
          ThoughtNodeService.getEdges({ taskId }),
        ]);
        allNodes.push(...taskNodes);
        allEdges.push(...taskEdges);

        // 会話ターンデータを取得（思考マップ再生用）- checkpointも含む
        const sb2 = getServerSupabase() || getSupabase();
        if (sb2) {
          const { data: convData } = await sb2
            .from('task_conversations')
            .select('id, role, content, phase, created_at')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

          if (convData) {
            let turnCounter = 0;
            conversations = convData.map((c: any) => {
              const isCheckpoint = c.phase === 'checkpoint';
              if (!isCheckpoint) turnCounter++;
              return {
                turnIndex: isCheckpoint ? turnCounter : turnCounter,
                role: c.role,
                content: c.content?.slice(0, 300) || '',
                phase: c.phase,
                createdAt: c.created_at,
                isCheckpoint,
              };
            });
          }
        }

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
        data: { nodes: allNodes, edges: allEdges, conversations },
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
 * 全体マップ: ユーザーの全ノード＋全エッジ＋タスク一覧を返す
 * ノードは重複を排除してユニークなナレッジノードに集約
 */
async function getUserOverviewMap(userId: string): Promise<{
  nodes: any[];
  edges: any[];
  tasks: { id: string; type: 'task' | 'seed'; title: string; phase: string; }[];
}> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return { nodes: [], edges: [], tasks: [] };

  try {
    // 全ノードを取得（タスク+種の両方）
    const { data: allNodeRows, error: nodeError } = await sb
      .from('thought_task_nodes')
      .select('*, knowledge_master_entries(label)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (nodeError || !allNodeRows) return { nodes: [], edges: [], tasks: [] };

    // 全エッジを取得
    const { data: allEdgeRows, error: edgeError } = await sb
      .from('thought_edges')
      .select('*')
      .eq('user_id', userId)
      .order('edge_order', { ascending: true });

    // ノードをナレッジマスタID(node_id)で重複排除
    // 同じキーワードが複数のタスク/種で使われている場合、1つのノードにまとめる
    const nodeMap = new Map<string, any>();
    const nodeTaskMap = new Map<string, Set<string>>(); // nodeId → 関連タスク/種IDのセット

    for (const row of allNodeRows) {
      const nodeId = row.node_id;

      // このノードに関連するタスク/種を記録
      if (!nodeTaskMap.has(nodeId)) nodeTaskMap.set(nodeId, new Set());
      if (row.task_id) nodeTaskMap.get(nodeId)!.add(row.task_id);
      if (row.seed_id) nodeTaskMap.get(nodeId)!.add(`seed:${row.seed_id}`);

      // まだ登録されていないか、より早い出現の場合は更新
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: row.id,
          nodeId: row.node_id,
          nodeLabel: row.knowledge_master_entries?.label || '',
          userId: row.user_id,
          appearOrder: 0, // 後で振り直し
          isMainRoute: row.is_main_route,
          appearPhase: row.seed_id ? 'seed' : (row.appear_phase || 'ideation'),
          createdAt: row.created_at,
          // 全体マップ用: 関連タスク数（後で設定）
          relatedTaskCount: 0,
        });
      }
    }

    // appearOrder を全体での時系列順で振り直し
    const nodes = Array.from(nodeMap.values());
    nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    nodes.forEach((n, i) => {
      n.appearOrder = i + 1;
      n.relatedTaskCount = nodeTaskMap.get(n.nodeId)?.size || 0;
    });

    // エッジも重複排除（from-to のペアで）
    const edgeKeySet = new Set<string>();
    const edges: any[] = [];
    for (const row of (allEdgeRows || [])) {
      const key = `${row.from_node_id}-${row.to_node_id}`;
      if (edgeKeySet.has(key)) continue;
      edgeKeySet.add(key);

      edges.push({
        id: row.id,
        fromNodeId: row.from_node_id,
        toNodeId: row.to_node_id,
        edgeType: row.edge_type,
        edgeOrder: row.edge_order,
        taskId: row.task_id,
        seedId: row.seed_id,
      });
    }

    // タスク/種の簡易一覧（フィルター用）
    const { data: taskRows } = await sb
      .from('tasks')
      .select('id, title, phase, status')
      .eq('user_id', userId);
    const { data: seedRows } = await sb
      .from('seeds')
      .select('id, content, status')
      .eq('user_id', userId);

    const tasks: any[] = [];
    for (const t of (taskRows || [])) {
      tasks.push({ id: t.id, type: 'task', title: t.title, phase: t.phase || 'ideation' });
    }
    for (const s of (seedRows || [])) {
      tasks.push({
        id: s.id,
        type: 'seed',
        title: s.content?.slice(0, 40) + (s.content?.length > 40 ? '...' : ''),
        phase: 'seed',
      });
    }

    return { nodes, edges, tasks };
  } catch (error) {
    console.error('[Thought Map] getUserOverviewMap エラー:', error);
    return { nodes: [], edges: [], tasks: [] };
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

/**
 * プロジェクト内のチェックポイント85点以上タスク一覧を取得
 * task_conversations(phase='checkpoint', role='assistant') のJSON contentからtotal_scoreを読む
 */
async function getQualifiedTasks(projectId: string, userId: string): Promise<{
  tasks: {
    id: string;
    title: string;
    status: string;
    checkpointScore: number;
    nodeCount: number;
    edgeCount: number;
    evaluatedAt: string;
  }[];
  debug: any;
}> {
  const sb = getServerSupabase() || getSupabase();
  if (!sb) return { tasks: [], debug: { error: 'no supabase' } };

  try {
    // プロジェクト内の全タスクを取得（担当者情報付き）
    const { data: tasks, error: taskErr } = await sb
      .from('tasks')
      .select('id, title, status, assigned_contact_id')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    if (taskErr || !tasks || tasks.length === 0) {
      return { tasks: [], debug: { taskErr, taskCount: tasks?.length || 0, projectId } };
    }

    // 担当者名を一括解決
    const contactIds = [...new Set(tasks.filter(t => t.assigned_contact_id).map(t => t.assigned_contact_id))];
    const contactMap: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await sb
        .from('contact_persons')
        .select('id, name')
        .in('id', contactIds);
      for (const c of (contacts || [])) {
        contactMap[c.id] = c.name;
      }
    }

    const debugInfo: any[] = [];
    const result: {
      id: string;
      title: string;
      status: string;
      checkpointScore: number;
      nodeCount: number;
      edgeCount: number;
      evaluatedAt: string;
      assigneeName: string | null;
      assigneeContactId: string | null;
    }[] = [];

    // 各タスクのチェックポイント結果を取得
    for (const task of tasks) {
      // 最新のチェックポイント結果を取得
      const { data: checkpoints, error: cpErr } = await sb
        .from('task_conversations')
        .select('content, created_at')
        .eq('task_id', task.id)
        .eq('phase', 'checkpoint')
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!checkpoints || checkpoints.length === 0) {
        // デバッグ: このタスクの全conversation phaseを確認
        const { data: allConvs } = await sb
          .from('task_conversations')
          .select('phase, role, created_at')
          .eq('task_id', task.id)
          .order('created_at', { ascending: false })
          .limit(5);
        debugInfo.push({
          taskId: task.id,
          title: task.title,
          reason: 'no_checkpoint_found',
          cpErr,
          recentConversations: allConvs?.map((c: any) => ({ phase: c.phase, role: c.role })) || [],
        });
        continue;
      }

      let score = 0;
      try {
        const parsed = JSON.parse(checkpoints[0].content);
        score = parsed.total_score || 0;
      } catch (parseErr) {
        debugInfo.push({
          taskId: task.id,
          title: task.title,
          reason: 'json_parse_error',
          contentPreview: checkpoints[0].content?.slice(0, 100),
        });
        continue;
      }

      if (score < 0) {
        debugInfo.push({
          taskId: task.id,
          title: task.title,
          reason: 'score_below_threshold',
          score,
        });
        continue;
      }

      // ノード数・エッジ数を取得
      const [nodeRes, edgeRes] = await Promise.all([
        sb.from('thought_task_nodes').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
        sb.from('thought_edges').select('id', { count: 'exact', head: true }).eq('task_id', task.id),
      ]);

      result.push({
        id: task.id,
        title: task.title,
        status: task.status || 'todo',
        checkpointScore: score,
        nodeCount: nodeRes.count || 0,
        edgeCount: edgeRes.count || 0,
        evaluatedAt: checkpoints[0].created_at,
        assigneeName: task.assigned_contact_id ? contactMap[task.assigned_contact_id] || null : null,
        assigneeContactId: task.assigned_contact_id || null,
      });
    }

    // スコア降順でソート
    result.sort((a, b) => b.checkpointScore - a.checkpointScore);

    return { tasks: result, debug: { totalTasks: tasks.length, debugInfo } };
  } catch (error) {
    console.error('[Thought Map] getQualifiedTasks エラー:', error);
    return { tasks: [], debug: { error: String(error) } };
  }
}
