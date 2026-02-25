// Phase 30a: プロジェクトメンバー API（GET / POST）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクトメンバー一覧取得
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

    let query = supabase
      .from('project_members')
      .select('*')
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
