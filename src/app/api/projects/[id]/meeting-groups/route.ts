// P2-3: 会議グループ API（GET / POST）
// GET  /api/projects/[id]/meeting-groups — グループ一覧取得
// POST /api/projects/[id]/meeting-groups — グループ作成

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: true, data: [] });
    }

    // プロジェクト存在確認
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('meeting_groups')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MeetingGroups API] GET エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[MeetingGroups API] GET エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const { name, description, color, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, error: 'nameは必須です' }, { status: 400 });
    }

    const validColors = ['blue', 'green', 'purple', 'amber', 'rose'];
    if (color && !validColors.includes(color)) {
      return NextResponse.json({ success: false, error: `colorは ${validColors.join('/')} のいずれか` }, { status: 400 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // プロジェクト存在確認
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('meeting_groups')
      .insert({
        project_id: projectId,
        name: name.trim(),
        description: description || null,
        color: color || 'blue',
        sort_order: typeof sort_order === 'number' ? sort_order : 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[MeetingGroups API] POST エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[MeetingGroups API] POST エラー:', error);
    return NextResponse.json({ success: false, error: '作成に失敗しました' }, { status: 500 });
  }
}
