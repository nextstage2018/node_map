// V2-E: 検討ツリー詳細 CRUD API（GET / PUT / DELETE）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ノードを階層構造に変換するヘルパー
interface TreeNode {
  id: string;
  tree_id: string;
  parent_node_id: string | null;
  title: string;
  node_type: string;
  status: string;
  description: string | null;
  cancel_reason: string | null;
  cancel_meeting_id: string | null;
  source_meeting_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: TreeNode[];
}

function buildNodeHierarchy(flatNodes: Omit<TreeNode, 'children'>[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // まず全ノードをマップに登録
  for (const node of flatNodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  // 親子関係を構築
  for (const node of flatNodes) {
    const treeNode = nodeMap.get(node.id)!;
    if (node.parent_node_id && nodeMap.has(node.parent_node_id)) {
      nodeMap.get(node.parent_node_id)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  // sort_order でソート
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// 検討ツリー詳細取得（全ノード含む、階層構造）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // ツリー本体を取得
    const { data: tree, error: treeError } = await supabase
      .from('decision_trees')
      .select('*')
      .eq('id', id)
      .single();

    if (treeError) {
      console.error('[DecisionTrees API] 詳細取得エラー:', treeError);
      return NextResponse.json({ success: false, error: treeError.message }, { status: 500 });
    }

    if (!tree) {
      return NextResponse.json({ success: false, error: 'ツリーが見つかりません' }, { status: 404 });
    }

    // 全ノードを取得
    const { data: nodes, error: nodesError } = await supabase
      .from('decision_tree_nodes')
      .select('*')
      .eq('tree_id', id)
      .order('sort_order', { ascending: true });

    if (nodesError) {
      console.error('[DecisionTrees API] ノード取得エラー:', nodesError);
      return NextResponse.json({ success: false, error: nodesError.message }, { status: 500 });
    }

    // 階層構造に変換
    const hierarchicalNodes = buildNodeHierarchy(nodes || []);

    return NextResponse.json({
      success: true,
      data: {
        ...tree,
        nodes: hierarchicalNodes,
      },
    });
  } catch (error) {
    console.error('[DecisionTrees API] エラー:', error);
    return NextResponse.json({ success: false, error: '検討ツリー詳細の取得に失敗しました' }, { status: 500 });
  }
}

// 検討ツリー更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;

    const { data, error } = await supabase
      .from('decision_trees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[DecisionTrees API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[DecisionTrees API] エラー:', error);
    return NextResponse.json({ success: false, error: '検討ツリーの更新に失敗しました' }, { status: 500 });
  }
}

// 検討ツリー削除（ノードはCASCADE）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { error } = await supabase
      .from('decision_trees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DecisionTrees API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DecisionTrees API] エラー:', error);
    return NextResponse.json({ success: false, error: '検討ツリーの削除に失敗しました' }, { status: 500 });
  }
}
