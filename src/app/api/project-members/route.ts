// Phase 30a+48: プロジェクトメンバー API（GET / POST / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクトメンバー一覧取得
// GET /api/project-members?project_id=xxx → プロジェクトのメンバー一覧（コンタクト名付き）
// GET /api/project-members?contact_id=xxx → コンタクトが所属するプロジェクト一覧（プロジェクト名付き）
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
    const projectId = searchParams.get('project_id');
    const contactId = searchParams.get('contact_id');

    if (contactId) {
      // コンタクトが所属するプロジェクト一覧（プロジェクト名付き）
      const { data, error } = await supabase
        .from('project_members')
        .select('*, projects(id, name, status)')
        .eq('user_id', userId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ProjectMembers API] contact_id取得エラー:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data: data || [] });
    }

    // プロジェクトのメンバー一覧（コンタクト名付き）
    let query = supabase
      .from('project_members')
      .select('*, contact_persons(id, display_name, email, company_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ProjectMembers API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[ProjectMembers API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトメンバーの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// プロジェクトメンバー追加
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
    const { projectId, contactId, role } = body;

    if (!projectId || !contactId) {
      return NextResponse.json(
        { success: false, error: 'プロジェクトIDとコンタクトIDは必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        contact_id: contactId,
        role: role || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[ProjectMembers API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[ProjectMembers API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトメンバーの追加に失敗しました' },
      { status: 500 }
    );
  }
}

// プロジェクトメンバー削除
export async function DELETE(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const projectId = searchParams.get('project_id');
    const contactId = searchParams.get('contact_id');

    if (id) {
      // IDで直接削除
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('[ProjectMembers API] 削除エラー:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else if (projectId && contactId) {
      // project_id + contact_id で削除
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('contact_id', contactId)
        .eq('user_id', userId);

      if (error) {
        console.error('[ProjectMembers API] 削除エラー:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'idまたはproject_id+contact_idが必要です' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ProjectMembers API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトメンバーの削除に失敗しました' },
      { status: 500 }
    );
  }
}
