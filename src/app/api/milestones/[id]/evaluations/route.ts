// V2-F: マイルストーン評価履歴取得API
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

    const { id } = await params;

    // マイルストーンの存在確認
    const { data: milestone, error: msError } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', id)
      .single();

    if (msError || !milestone) {
      return NextResponse.json({ success: false, error: 'マイルストーンが見つかりません' }, { status: 404 });
    }

    // 評価履歴取得（新しい順）
    const { data: evaluations, error: fetchError } = await supabase
      .from('milestone_evaluations')
      .select('*')
      .eq('milestone_id', id)
      .order('evaluated_at', { ascending: false });

    if (fetchError) {
      console.error('[Milestone Evaluations] 取得エラー:', fetchError);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: evaluations || [],
    });
  } catch (error) {
    console.error('[Milestone Evaluations] エラー:', error);
    return NextResponse.json({ success: false, error: '評価履歴の取得に失敗しました' }, { status: 500 });
  }
}
