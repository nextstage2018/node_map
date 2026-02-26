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
    const { name, description, status, organizationId } = body;

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

    // organization name をフラット化
    const mapped = {
      ...data,
      organization_name: data?.organizations?.name || null,
    };

    return NextResponse.json({ success: true, data: mapped });
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
