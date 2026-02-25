// Phase 30d: プロジェクト API（GET / POST）
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

    let query = supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Projects API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
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
    const { name, description, status } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'プロジェクト名は必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        status: status || 'active',
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[Projects API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Projects API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロジェクトの作成に失敗しました' },
      { status: 500 }
    );
  }
}
