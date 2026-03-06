// V2-E: 検討ツリーノード API（GET一覧 / POST作成）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ノード一覧取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('tree_id');

    if (!treeId) {
      return NextResponse.json({ success: false, error: 'tree_id は必須です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('decision_tree_nodes')
      .select('*')
      .eq('tree_id', treeId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[DecisionTreeNodes API] 一覧取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[DecisionTreeNodes API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ノード一覧の取得に失敗しました' }, { status: 500 });
  }
}

// ノード作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { tree_id, parent_node_id, title, node_type, description, source_meeting_id } = body;

    if (!tree_id) {
      return NextResponse.json({ success: false, error: 'tree_id は必須です' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: 'タイトルは必須です' }, { status: 400 });
    }
    if (!node_type) {
      return NextResponse.json({ success: false, error: 'node_type は必須です' }, { status: 400 });
    }

    const validNodeTypes = ['topic', 'option', 'decision', 'action'];
    if (!validNodeTypes.includes(node_type)) {
      return NextResponse.json({ success: false, error: `node_type は ${validNodeTypes.join(', ')} のいずれかです` }, { status: 400 });
    }

    // sort_order を自動計算（同じ親の最大値 + 1）
    const sortQuery = supabase
      .from('decision_tree_nodes')
      .select('sort_order')
      .eq('tree_id', tree_id);

    if (parent_node_id) {
      sortQuery.eq('parent_node_id', parent_node_id);
    } else {
      sortQuery.is('parent_node_id', null);
    }

    const { data: siblings } = await sortQuery.order('sort_order', { ascending: false }).limit(1);
    const nextSortOrder = siblings && siblings.length > 0 ? siblings[0].sort_order + 1 : 0;

    const { data, error } = await supabase
      .from('decision_tree_nodes')
      .insert({
        tree_id,
        parent_node_id: parent_node_id || null,
        title: title.trim(),
        node_type,
        status: 'active',
        description: description?.trim() || null,
        source_meeting_id: source_meeting_id || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('[DecisionTreeNodes API] 作成エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 作成履歴を記録
    await supabase.from('decision_tree_node_history').insert({
      node_id: data.id,
      previous_status: null,
      new_status: 'active',
      reason: '新規作成',
      meeting_record_id: source_meeting_id || null,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[DecisionTreeNodes API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ノードの作成に失敗しました' }, { status: 500 });
  }
}
