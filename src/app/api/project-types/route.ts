import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

// GET: プロジェクト種別一覧（テンプレート付き）
export async function GET() {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    // プロジェクト種別を取得
    const { data: types, error } = await sb
      .from('project_types')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 各種別のテンプレートを取得
    const typeIds = (types || []).map((t: any) => t.id);
    let templates: any[] = [];
    if (typeIds.length > 0) {
      const { data: tmpl, error: tmplError } = await sb
        .from('task_templates')
        .select('*')
        .in('project_type_id', typeIds)
        .order('sort_order', { ascending: true });

      if (!tmplError && tmpl) templates = tmpl;
    }

    // テンプレートを種別ごとにグループ化
    const result = (types || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      userId: t.user_id,
      createdAt: t.created_at,
      templates: templates
        .filter((tmpl: any) => tmpl.project_type_id === t.id)
        .map((tmpl: any) => ({
          id: tmpl.id,
          projectTypeId: tmpl.project_type_id,
          title: tmpl.title,
          description: tmpl.description,
          estimatedHours: tmpl.estimated_hours ? parseFloat(tmpl.estimated_hours) : undefined,
          recurrenceType: tmpl.recurrence_type,
          recurrenceDay: tmpl.recurrence_day,
          sortOrder: tmpl.sort_order,
          userId: tmpl.user_id,
          createdAt: tmpl.created_at,
        })),
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching project types:', error);
    return NextResponse.json({ error: 'プロジェクト種別の取得に失敗しました' }, { status: 500 });
  }
}

// POST: プロジェクト種別を作成
export async function POST(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '種別名は必須です' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('project_types')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        userId: data.user_id,
        createdAt: data.created_at,
        templates: [],
      },
    });
  } catch (error) {
    console.error('Error creating project type:', error);
    return NextResponse.json({ error: 'プロジェクト種別の作成に失敗しました' }, { status: 500 });
  }
}

// PUT: プロジェクト種別を更新
export async function PUT(request: Request) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    const body = await request.json();
    const { id, name, description } = body;

    if (!id) return NextResponse.json({ error: 'IDは必須です' }, { status: 400 });

    const { data, error } = await sb
      .from('project_types')
      .update({
        name: name?.trim(),
        description: description?.trim() || null,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating project type:', error);
    return NextResponse.json({ error: 'プロジェクト種別の更新に失敗しました' }, { status: 500 });
  }
}

// DELETE: プロジェクト種別を削除（CASCADE でテンプレートも削除）
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
      .from('project_types')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project type:', error);
    return NextResponse.json({ error: 'プロジェクト種別の削除に失敗しました' }, { status: 500 });
  }
}
