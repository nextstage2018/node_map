// Phase 30a: 組織マスター API（GET / POST）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// 組織一覧取得
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
    const search = searchParams.get('search') || '';

    let query = supabase
      .from('organizations')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,domain.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Organizations API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Organizations API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '組織一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 組織作成
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
    const { name, domain } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '組織名は必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        domain: domain?.trim() || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[Organizations API] 作成エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Organizations API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '組織の作成に失敗しました' },
      { status: 500 }
    );
  }
}
