// V2-E: 検討ツリーノード詳細 API（GET / PUT / DELETE）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ノード詳細取得（変更履歴含む）
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

    // ノード本体を取得
    const { data: node, error: nodeError } = await supabase
      .from('decision_tree_nodes')
      .select('*')
      .eq('id', id)
      .single();

    if (nodeError) {
      console.error('[DecisionTreeNodes API] 詳細取得エラー:', nodeError);
      return NextResponse.json({ success: false, error: nodeError.message }, { status: 500 });
    }

    if (!node) {
      return NextResponse.json({ success: false, error: 'ノードが見つかりません' }, { status: 404 });
    }

    // 変更履歴を取得
    const { data: history, error: historyError } = await supabase
      .from('decision_tree_node_history')
      .select('*')
      .eq('node_id', id)
      .order('changed_at', { ascending: false });

    if (historyError) {
      console.error('[DecisionTreeNodes API] 履歴取得エラー:', historyError);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...node,
        history: history || [],
      },
    });
  } catch (error) {
    console.error('[DecisionTreeNodes API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ノード詳細の取得に失敗しました' }, { status: 500 });
  }
}

// ノード更新（ステータス変更時に履歴自動記録）
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
    if (body.status !== undefined) updateData.status = body.status;
    if (body.cancel_reason !== undefined) updateData.cancel_reason = body.cancel_reason;
    if (body.cancel_meeting_id !== undefined) updateData.cancel_meeting_id = body.cancel_meeting_id;

    // ステータス変更の場合、変更前のステータスを取得
    let oldStatus: string | null = null;
    if (body.status !== undefined) {
      const { data: current } = await supabase
        .from('decision_tree_nodes')
        .select('status')
        .eq('id', id)
        .single();

      oldStatus = current?.status || null;
    }

    const { data, error } = await supabase
      .from('decision_tree_nodes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[DecisionTreeNodes API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // ステータス変更時に履歴を記録
    if (body.status !== undefined && oldStatus !== body.status) {
      await supabase.from('decision_tree_node_history').insert({
        node_id: id,
        previous_status: oldStatus,
        new_status: body.status,
        reason: body.cancel_reason || null,
        meeting_record_id: body.cancel_meeting_id || null,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[DecisionTreeNodes API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ノードの更新に失敗しました' }, { status: 500 });
  }
}

// ノード削除（子ノードはCASCADE）
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
      .from('decision_tree_nodes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DecisionTreeNodes API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DecisionTreeNodes API] エラー:', error);
    return NextResponse.json({ success: false, error: 'ノードの削除に失敗しました' }, { status: 500 });
  }
}
