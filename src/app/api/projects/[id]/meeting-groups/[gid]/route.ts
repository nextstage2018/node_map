// P2-3: 会議グループ個別 API（PUT / DELETE）
// PUT    /api/projects/[id]/meeting-groups/[gid] — グループ更新
// DELETE /api/projects/[id]/meeting-groups/[gid] — グループ削除

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gid: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, gid: groupId } = await params;
    const body = await request.json();
    const { name, description, color, sort_order } = body;

    const validColors = ['blue', 'green', 'purple', 'amber', 'rose'];
    if (color && !validColors.includes(color)) {
      return NextResponse.json({ success: false, error: `colorは ${validColors.join('/')} のいずれか` }, { status: 400 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // 更新対象の存在確認（project_idも一致確認）
    const { data: existing } = await supabase
      .from('meeting_groups')
      .select('id')
      .eq('id', groupId)
      .eq('project_id', projectId)
      .single();

    if (!existing) {
      return NextResponse.json({ success: false, error: '会議グループが見つかりません' }, { status: 404 });
    }

    // 更新フィールドを構築（指定されたもののみ）
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ success: false, error: 'nameは空にできません' }, { status: 400 });
      }
      updateFields.name = name.trim();
    }
    if (description !== undefined) updateFields.description = description;
    if (color !== undefined) updateFields.color = color;
    if (sort_order !== undefined && typeof sort_order === 'number') updateFields.sort_order = sort_order;

    const { data, error } = await supabase
      .from('meeting_groups')
      .update(updateFields)
      .eq('id', groupId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('[MeetingGroups API] PUT エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[MeetingGroups API] PUT エラー:', error);
    return NextResponse.json({ success: false, error: '更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; gid: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId, gid: groupId } = await params;

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // 削除対象の存在確認
    const { data: existing } = await supabase
      .from('meeting_groups')
      .select('id')
      .eq('id', groupId)
      .eq('project_id', projectId)
      .single();

    if (!existing) {
      return NextResponse.json({ success: false, error: '会議グループが見つかりません' }, { status: 404 });
    }

    // 削除（ON DELETE SET NULLにより、配下のrecords/rules/trees/agendasのmeeting_group_idはNULLに）
    const { error } = await supabase
      .from('meeting_groups')
      .delete()
      .eq('id', groupId)
      .eq('project_id', projectId);

    if (error) {
      console.error('[MeetingGroups API] DELETE エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MeetingGroups API] DELETE エラー:', error);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
