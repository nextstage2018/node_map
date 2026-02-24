import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET: プロフィール取得（Supabase Auth から実データ）
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const profile = {
      displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || '',
      email: user.email || '',
      timezone: user.user_metadata?.timezone || 'Asia/Tokyo',
      language: user.user_metadata?.language || 'ja',
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('プロフィール取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロフィールの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: プロフィール更新（Supabase Auth user_metadata に保存）
export async function PUT(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { displayName, timezone, language } = body;

    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        display_name: displayName ?? user.user_metadata?.display_name,
        timezone: timezone ?? user.user_metadata?.timezone ?? 'Asia/Tokyo',
        language: language ?? user.user_metadata?.language ?? 'ja',
      },
    });

    if (updateError) throw updateError;

    const profile = {
      displayName: displayName ?? user.user_metadata?.display_name ?? '',
      email: user.email || '',
      timezone: timezone ?? user.user_metadata?.timezone ?? 'Asia/Tokyo',
      language: language ?? user.user_metadata?.language ?? 'ja',
    };

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('プロフィール更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロフィールの保存に失敗しました' },
      { status: 500 }
    );
  }
}
