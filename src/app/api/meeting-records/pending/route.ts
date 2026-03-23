// 保留中の議事録API（プロジェクト未確定）
// GET: needs_project_review=true の議事録一覧を取得
// POST: プロジェクトを確定し、analyze パイプラインを実行
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: 保留中の議事録一覧
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase未設定' }, { status: 400 });
    }

    // metadata->needs_project_review が true の議事録を取得
    const { data: records, error } = await supabase
      .from('meeting_records')
      .select('id, project_id, title, meeting_date, source_type, metadata, created_at')
      .eq('metadata->>needs_project_review', 'true')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[PendingMeetingRecords] 取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 各レコードの推定プロジェクト名を取得
    const projectIds = [...new Set((records || []).map(r => r.project_id).filter(Boolean))];
    let projectMap: Record<string, { name: string; org_name?: string }> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, organizations(name)')
        .in('id', projectIds);

      if (projects) {
        for (const pj of projects) {
          const org = pj.organizations as { name: string } | null;
          projectMap[pj.id] = { name: pj.name, org_name: org?.name };
        }
      }
    }

    // 全プロジェクト一覧（ドロップダウン用）
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id, name, projects(id, name)')
      .order('name');

    const allProjects: { id: string; name: string; org_name: string }[] = [];
    if (allOrgs) {
      for (const org of allOrgs) {
        const orgProjects = org.projects as { id: string; name: string }[] | null;
        if (orgProjects) {
          for (const pj of orgProjects) {
            allProjects.push({ id: pj.id, name: pj.name, org_name: org.name });
          }
        }
      }
    }

    const enrichedRecords = (records || []).map(r => ({
      ...r,
      suggested_project: projectMap[r.project_id] || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        records: enrichedRecords,
        projects: allProjects,
      },
    });
  } catch (error) {
    console.error('[PendingMeetingRecords] エラー:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

// POST: プロジェクトを確定してanalyzeパイプラインを実行
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { record_id, project_id } = body;

    if (!record_id || !project_id) {
      return NextResponse.json({ error: 'record_id と project_id は必須です' }, { status: 400 });
    }

    // 既存レコードを取得
    const { data: record, error: fetchError } = await supabase
      .from('meeting_records')
      .select('id, metadata')
      .eq('id', record_id)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: '議事録が見つかりません' }, { status: 404 });
    }

    // project_id を更新し、needs_project_review を解除
    const existingMeta = (record.metadata as Record<string, unknown>) || {};
    const updatedMeta = {
      ...existingMeta,
      needs_project_review: false,
      project_match_method: 'user_confirmed',
      confirmed_by_user_id: userId,
      confirmed_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('meeting_records')
      .update({
        project_id,
        metadata: updatedMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record_id);

    if (updateError) {
      console.error('[PendingMeetingRecords] 更新エラー:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // analyze パイプラインを実行
    let analyzeResult = null;
    try {
      const analyzeRes = await fetch(`https://node-map-eight.vercel.app/api/meeting-records/${record_id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (analyzeRes.ok) {
        analyzeResult = await analyzeRes.json();
      }
    } catch (analyzeErr) {
      console.error('[PendingMeetingRecords] analyze実行エラー:', analyzeErr);
    }

    return NextResponse.json({
      success: true,
      data: { record_id, project_id, analyzed: !!analyzeResult?.success },
    });
  } catch (error) {
    console.error('[PendingMeetingRecords] エラー:', error);
    return NextResponse.json({ error: '確定に失敗しました' }, { status: 500 });
  }
}
