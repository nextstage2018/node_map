import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

// POST: テンプレート作成
export async function POST(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    const body = await request.json();
    const { projectTypeId, title, description, estimatedHours, recurrenceType, recurrenceDay, sortOrder } = body;

    if (!projectTypeId || !title?.trim()) {
      return NextResponse.json({ error: '種別IDとタイトルは必須です' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('task_templates')
      .insert({
        project_type_id: projectTypeId,
        title: title.trim(),
        description: description?.trim() || null,
        estimated_hours: estimatedHours || null,
        recurrence_type: recurrenceType || null,
        recurrence_day: recurrenceDay !== undefined ? recurrenceDay : null,
        sort_order: sortOrder || 0,
        user_id: userId,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        projectTypeId: data.project_type_id,
        title: data.title,
        description: data.description,
        estimatedHours: data.estimated_hours ? parseFloat(data.estimated_hours) : undefined,
        recurrenceType: data.recurrence_type,
        recurrenceDay: data.recurrence_day,
        sortOrder: data.sort_order,
        userId: data.user_id,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'テンプレートの作成に失敗しました' }, { status: 500 });
  }
}

// PUT: テンプレート更新
export async function PUT(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    const body = await request.json();
    const { id, title, description, estimatedHours, recurrenceType, recurrenceDay, sortOrder } = body;

    if (!id) return NextResponse.json({ error: 'IDは必須です' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (estimatedHours !== undefined) updateData.estimated_hours = estimatedHours || null;
    if (recurrenceType !== undefined) updateData.recurrence_type = recurrenceType || null;
    if (recurrenceDay !== undefined) updateData.recurrence_day = recurrenceDay;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;

    const { data, error } = await sb
      .from('task_templates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        projectTypeId: data.project_type_id,
        title: data.title,
        description: data.description,
        estimatedHours: data.estimated_hours ? parseFloat(data.estimated_hours) : undefined,
        recurrenceType: data.recurrence_type,
        recurrenceDay: data.recurrence_day,
        sortOrder: data.sort_order,
        userId: data.user_id,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'テンプレートの更新に失敗しました' }, { status: 500 });
  }
}

// DELETE: テンプレート削除
export async function DELETE(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'IDは必須です' }, { status: 400 });

    const { error } = await sb
      .from('task_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'テンプレートの削除に失敗しました' }, { status: 500 });
  }
}
