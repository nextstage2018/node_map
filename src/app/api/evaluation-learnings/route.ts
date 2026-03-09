// V2-G: 学習データ記録API — GET / POST
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/evaluation-learnings?project_id=xxx&milestone_id=xxx
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
    const projectId = searchParams.get('project_id');
    const milestoneId = searchParams.get('milestone_id');

    if (!projectId && !milestoneId) {
      return NextResponse.json(
        { success: false, error: 'project_id または milestone_id が必要です' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('evaluation_learnings')
      .select('*')
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (milestoneId) {
      query = query.eq('milestone_id', milestoneId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[EvaluationLearnings GET] エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[EvaluationLearnings GET] エラー:', error);
    return NextResponse.json({ success: false, error: '学習データの取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/evaluation-learnings
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
    const {
      milestone_id,
      project_id,
      ai_judgment,
      ai_reasoning,
      human_judgment,
      human_reasoning,
      gap_analysis,
      learning_point,
      meeting_record_id,
    } = body;

    // バリデーション
    if (!milestone_id || !project_id || !ai_judgment) {
      return NextResponse.json(
        { success: false, error: 'milestone_id, project_id, ai_judgment は必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('evaluation_learnings')
      .insert({
        milestone_id,
        project_id,
        ai_judgment,
        ai_reasoning: ai_reasoning || null,
        human_judgment: human_judgment || null,
        human_reasoning: human_reasoning || null,
        gap_analysis: gap_analysis || null,
        learning_point: learning_point || null,
        meeting_record_id: meeting_record_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[EvaluationLearnings POST] エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[EvaluationLearnings POST] エラー:', error);
    return NextResponse.json({ success: false, error: '学習データの記録に失敗しました' }, { status: 500 });
  }
}
