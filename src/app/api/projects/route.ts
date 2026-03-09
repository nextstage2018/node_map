// Phase 30d: プロジェクト API（GET / POST）
// Phase 40c: organization_id 追加
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクト一覧取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || '';
    const organizationId = searchParams.get('organization_id') || '';
    const limitParam = searchParams.get('limit');

    let query = supabase
      .from('projects')
      .select('*, organizations(name)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }
    // v3.1: limit パラメータ対応
    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        query = query.limit(limit);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Projects API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // organization name をフラット化
    const mapped = (data || []).map((p: any) => ({
      ...p,
      organization_name: p.organizations?.name || null,
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクト一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// プロジェクト作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, description, status, organizationId, projectTypeId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'プロジェクト名は必須です' },
        { status: 400 }
      );
    }

    const insertData: Record<string, unknown> = {
      name: name.trim(),
      description: description?.trim() || null,
      status: status || 'active',
      user_id: userId,
    };

    if (organizationId) {
      insertData.organization_id = organizationId;
    }
    // Phase 50: プロジェクト種別
    if (projectTypeId) {
      insertData.project_type_id = projectTypeId;
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select('*, organizations(name)')
      .single();

    if (error) {
      console.error('[Projects API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Phase 50: プロジェクト種別が指定されている場合、テンプレートからタスクを自動生成
    let generatedTasks: any[] = [];
    if (projectTypeId && data?.id) {
      try {
        const { data: templates, error: tmplError } = await supabase
          .from('task_templates')
          .select('*')
          .eq('project_type_id', projectTypeId)
          .order('sort_order', { ascending: true });

        if (!tmplError && templates && templates.length > 0) {
          const now = new Date().toISOString();
          const tasksToInsert = templates.map((tmpl: any) => ({
            id: crypto.randomUUID(),
            title: tmpl.title,
            description: tmpl.description || '',
            status: 'todo',
            priority: 'medium',
            phase: 'ideation',
            task_type: 'personal',
            task_category: 'routine',
            template_id: tmpl.id,
            project_id: data.id,
            estimated_hours: tmpl.estimated_hours,
            recurrence_type: tmpl.recurrence_type,
            recurrence_day: tmpl.recurrence_day,
            tags: [],
            user_id: userId,
            created_at: now,
            updated_at: now,
            ideation_at: now,
          }));

          const { data: insertedTasks, error: taskError } = await supabase
            .from('tasks')
            .insert(tasksToInsert)
            .select();

          if (taskError) {
            console.error('[Projects API] タスク自動生成エラー:', taskError);
          } else {
            generatedTasks = insertedTasks || [];
          }
        }
      } catch (e) {
        console.error('[Projects API] テンプレートタスク生成エラー:', e);
      }
    }

    // organization name をフラット化
    const mapped = {
      ...data,
      organization_name: data?.organizations?.name || null,
    };

    return NextResponse.json({
      success: true,
      data: mapped,
      generatedTaskCount: generatedTasks.length,
    });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40c: プロジェクト更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { projectId, name, description, status, organizationId } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId は必須です' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (organizationId !== undefined) updateData.organization_id = organizationId || null;

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('*, organizations(name)')
      .single();

    if (error) {
      console.error('[Projects API] 更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const mapped = {
      ...data,
      organization_name: data?.organizations?.name || null,
    };

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトの更新に失敗しました' },
      { status: 500 }
    );
  }
}
