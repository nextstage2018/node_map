// v3.4: プロジェクト別 意思決定ログ（decision_log）取得API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'active', 'superseded', etc.
    const nodeId = searchParams.get('node_id'); // filter by decision_tree_node_id

    let query = supabase
      .from('decision_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (nodeId) {
      query = query.eq('decision_tree_node_id', nodeId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('[DecisionLog API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 統計情報
    const stats = {
      total: data?.length || 0,
      active: data?.filter(d => d.status === 'active').length || 0,
      superseded: data?.filter(d => d.status === 'superseded').length || 0,
      this_week: data?.filter(d => {
        const created = new Date(d.created_at);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return created > weekAgo;
      }).length || 0,
    };

    return NextResponse.json({ success: true, data, stats });
  } catch (error) {
    console.error('[DecisionLog API] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
