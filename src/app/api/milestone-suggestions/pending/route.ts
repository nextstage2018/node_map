// v8.0: 自動登録マイルストーン取得API
// auto_generated=true のマイルストーンを返す（MS提案は自動承認に変更済み）
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'project_idは必須です' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // 自動登録されたマイルストーン（直近30日、pendingのもの）を取得
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase
      .from('milestones')
      .select('id, project_id, title, description, success_criteria, target_date, status, auto_generated, source_meeting_record_id, created_at')
      .eq('project_id', projectId)
      .eq('auto_generated', true)
      .in('status', ['pending', 'in_progress'])
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MilestoneSuggestions] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[MilestoneSuggestions] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
