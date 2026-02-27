// Phase 42h: 比較モードAPI
// 2人のユーザーの思考動線を比較し、共有ノード・分岐点を算出する
//
// GET /api/nodes/thought-map/compare?userAId=xxx&taskAId=yyy&userBId=xxx&taskBId=zzz
// → { success: true, data: { userA: {...}, userB: {...}, sharedNodeIds, divergencePoints } }

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const viewerId = await getServerUserId();
    if (!viewerId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userAId = searchParams.get('userAId');
    const taskAId = searchParams.get('taskAId');
    const userBId = searchParams.get('userBId');
    const taskBId = searchParams.get('taskBId');

    if (!userAId || !taskAId || !userBId || !taskBId) {
      return NextResponse.json(
        { success: false, error: 'userAId, taskAId, userBId, taskBId が必要です' },
        { status: 400 }
      );
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json(
        { success: false, error: 'DB接続エラー' },
        { status: 500 }
      );
    }

    // 両タスクのノード＋エッジを並行取得
    const [nodesA, edgesA, nodesB, edgesB, taskAData, taskBData] = await Promise.all([
      ThoughtNodeService.getLinkedNodes({ taskId: taskAId }),
      ThoughtNodeService.getEdges({ taskId: taskAId }),
      ThoughtNodeService.getLinkedNodes({ taskId: taskBId }),
      ThoughtNodeService.getEdges({ taskId: taskBId }),
      sb.from('tasks').select('title, seed_id').eq('id', taskAId).maybeSingle(),
      sb.from('tasks').select('title, seed_id').eq('id', taskBId).maybeSingle(),
    ]);

    // タスクに元の種がある場合は種のノード+エッジも統合
    let allNodesA = [...nodesA];
    let allEdgesA = [...edgesA];
    let allNodesB = [...nodesB];
    let allEdgesB = [...edgesB];

    if (taskAData.data?.seed_id) {
      const [seedNodes, seedEdges] = await Promise.all([
        ThoughtNodeService.getLinkedNodes({ seedId: taskAData.data.seed_id }),
        ThoughtNodeService.getEdges({ seedId: taskAData.data.seed_id }),
      ]);
      const existingIds = new Set(allNodesA.map(n => n.nodeId));
      for (const sn of seedNodes) {
        if (!existingIds.has(sn.nodeId)) {
          sn.appearPhase = 'seed';
          allNodesA.push(sn);
        }
      }
      const existingEdgeKeys = new Set(allEdgesA.map(e => `${e.fromNodeId}-${e.toNodeId}`));
      for (const se of seedEdges) {
        if (!existingEdgeKeys.has(`${se.fromNodeId}-${se.toNodeId}`)) {
          allEdgesA.push(se);
        }
      }
    }

    if (taskBData.data?.seed_id) {
      const [seedNodes, seedEdges] = await Promise.all([
        ThoughtNodeService.getLinkedNodes({ seedId: taskBData.data.seed_id }),
        ThoughtNodeService.getEdges({ seedId: taskBData.data.seed_id }),
      ]);
      const existingIds = new Set(allNodesB.map(n => n.nodeId));
      for (const sn of seedNodes) {
        if (!existingIds.has(sn.nodeId)) {
          sn.appearPhase = 'seed';
          allNodesB.push(sn);
        }
      }
      const existingEdgeKeys = new Set(allEdgesB.map(e => `${e.fromNodeId}-${e.toNodeId}`));
      for (const se of seedEdges) {
        if (!existingEdgeKeys.has(`${se.fromNodeId}-${se.toNodeId}`)) {
          allEdgesB.push(se);
        }
      }
    }

    // appearOrder を時系列で振り直し
    allNodesA.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    allNodesA.forEach((n, i) => { n.appearOrder = i + 1; });
    allNodesB.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    allNodesB.forEach((n, i) => { n.appearOrder = i + 1; });

    // 共有ノードID（両者が通ったナレッジマスタID）
    const nodeIdsA = new Set(allNodesA.map(n => n.nodeId));
    const nodeIdsB = new Set(allNodesB.map(n => n.nodeId));
    const sharedNodeIds = [...nodeIdsA].filter(id => nodeIdsB.has(id));

    // 分岐点を検出: 同じfromNodeIdから異なるtoNodeIdへ分かれている箇所
    const divergencePoints: Array<{
      nodeId: string;
      nodeLabel: string;
      userANextNodeIds: string[];
      userBNextNodeIds: string[];
    }> = [];

    // 共有ノードそれぞれについて、次のノードが異なるか検査
    const edgesAMap = new Map<string, string[]>();
    for (const e of allEdgesA) {
      if (!edgesAMap.has(e.fromNodeId)) edgesAMap.set(e.fromNodeId, []);
      edgesAMap.get(e.fromNodeId)!.push(e.toNodeId);
    }
    const edgesBMap = new Map<string, string[]>();
    for (const e of allEdgesB) {
      if (!edgesBMap.has(e.fromNodeId)) edgesBMap.set(e.fromNodeId, []);
      edgesBMap.get(e.fromNodeId)!.push(e.toNodeId);
    }

    for (const sharedId of sharedNodeIds) {
      const nextA = edgesAMap.get(sharedId) || [];
      const nextB = edgesBMap.get(sharedId) || [];
      // 両者とも次のノードがあり、かつ異なるものがある場合は分岐
      if (nextA.length > 0 && nextB.length > 0) {
        const setA = new Set(nextA);
        const setB = new Set(nextB);
        const onlyA = nextA.filter(id => !setB.has(id));
        const onlyB = nextB.filter(id => !setA.has(id));
        if (onlyA.length > 0 || onlyB.length > 0) {
          const nodeObj = allNodesA.find(n => n.nodeId === sharedId) || allNodesB.find(n => n.nodeId === sharedId);
          divergencePoints.push({
            nodeId: sharedId,
            nodeLabel: nodeObj?.nodeLabel || '',
            userANextNodeIds: onlyA,
            userBNextNodeIds: onlyB,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        userA: {
          nodes: allNodesA,
          edges: allEdgesA,
          taskTitle: taskAData.data?.title || '',
        },
        userB: {
          nodes: allNodesB,
          edges: allEdgesB,
          taskTitle: taskBData.data?.title || '',
        },
        sharedNodeIds,
        divergencePoints,
      },
    });
  } catch (error) {
    console.error('[Compare API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '比較データの取得に失敗しました' },
      { status: 500 }
    );
  }
}
