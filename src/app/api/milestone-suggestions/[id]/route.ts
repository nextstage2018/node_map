// v8.0: マイルストーン提案 承認/却下/更新API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// PATCH: ステータス更新（承認/却下）+ インライン編集
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // 提案を取得
    const { data: suggestion, error: fetchError } = await supabase
      .from('milestone_suggestions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !suggestion) {
      return NextResponse.json({ success: false, error: '提案が見つかりません' }, { status: 404 });
    }

    // 承認: マイルストーンを作成
    if (body.status === 'accepted') {
      // マイルストーンを作成
      const milestoneData: Record<string, unknown> = {
        project_id: suggestion.project_id,
        title: body.title || suggestion.title,
        description: body.description || suggestion.description || '',
        target_date: body.target_date || suggestion.target_date || null,
        status: 'pending',
        source_meeting_record_id: suggestion.meeting_record_id,
        auto_generated: true,
      };

      // success_criteriaをdescriptionに含める
      if (suggestion.success_criteria) {
        milestoneData.description = `${milestoneData.description}\n\n達成条件: ${suggestion.success_criteria}`;
      }

      const { data: newMilestone, error: msError } = await supabase
        .from('milestones')
        .insert(milestoneData)
        .select('id')
        .single();

      if (msError) {
        console.error('[MilestoneSuggestions] MS作成エラー:', msError);
        return NextResponse.json({ success: false, error: msError.message }, { status: 500 });
      }

      // 提案を承認済みに更新
      await supabase
        .from('milestone_suggestions')
        .update({
          status: 'accepted',
          accepted_milestone_id: newMilestone.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        data: {
          suggestion_id: id,
          milestone_id: newMilestone.id,
          status: 'accepted',
        },
      });
    }

    // 却下
    if (body.status === 'dismissed') {
      await supabase
        .from('milestone_suggestions')
        .update({
          status: 'dismissed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        data: { suggestion_id: id, status: 'dismissed' },
      });
    }

    // インライン編集（ステータス変更なし）
    const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updateFields.title = body.title;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.success_criteria !== undefined) updateFields.success_criteria = body.success_criteria;
    if (body.target_date !== undefined) updateFields.target_date = body.target_date;
    if (body.priority !== undefined) updateFields.priority = body.priority;

    const { error: updateError } = await supabase
      .from('milestone_suggestions')
      .update(updateFields)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { suggestion_id: id } });
  } catch (error) {
    console.error('[MilestoneSuggestions] PATCH エラー:', error);
    return NextResponse.json({ success: false, error: '更新に失敗しました' }, { status: 500 });
  }
}

// DELETE: 提案を削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    const { error } = await supabase
      .from('milestone_suggestions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MilestoneSuggestions] DELETE エラー:', error);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
