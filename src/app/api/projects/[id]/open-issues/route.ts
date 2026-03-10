// v3.4: プロジェクト別 未確定事項（open_issues）取得API
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
    const status = searchParams.get('status'); // 'open', 'resolved', 'stale', or null (all)
    const nodeId = searchParams.get('node_id'); // filter by related_decision_node_id

    let query = supabase
      .from('open_issues')
      .select('*')
      .eq('project_id', projectId)
      .order('priority_score', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (nodeId) {
      query = query.eq('related_decision_node_id', nodeId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('[OpenIssues API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 統計情報
    const stats = {
      total: data?.length || 0,
      open: data?.filter(d => d.status === 'open').length || 0,
      stale: data?.filter(d => d.status === 'stale').length || 0,
      resolved: data?.filter(d => d.status === 'resolved').length || 0,
      avg_days_stagnant: data && data.length > 0
        ? Math.round(data.filter(d => d.status !== 'resolved').reduce((sum, d) => sum + (d.days_stagnant || 0), 0) / Math.max(data.filter(d => d.status !== 'resolved').length, 1))
        : 0,
    };

    return NextResponse.json({ success: true, data, stats });
  } catch (error) {
    console.error('[OpenIssues API] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
