// Phase 24: プロフィール編集API（Supabase Auth user_metadata対応）
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// デモモード用プロフィール
const demoProfiles: Record<string, any> = {
  'demo-user-001': {
    displayName: 'デモユーザー',
    email: 'demo@example.com',
    timezone: 'Asia/Tokyo',
    language: 'ja',
    avatarUrl: null,
  },
};

// GET: プロフィール取得
export async function GET() {
  try {
    const userId = await getServerUserId();

    // デモモード
    if (userId === 'demo-user-001' || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({
        success: true,
        data: demoProfiles[userId] || demoProfiles['demo-user-001'],
      });
    }

    // Supabase Auth からユーザー情報を取得
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json({
        success: true,
        data: demoProfiles['demo-user-001'],
      });
    }

    const { data: { user }, error } = await client.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'ユーザー情報の取得に失敗しました' },
        { status: 401 }
      );
    }

    const metadata = user.user_metadata || {};

    return NextResponse.json({
      success: true,
      data: {
        displayName: metadata.display_name || metadata.full_name || '',
        email: user.email || '',
        timezone: metadata.timezone || 'Asia/Tokyo',
        language: metadata.language || 'ja',
        avatarUrl: metadata.avatar_url || null,
      },
    });
  } catch (error) {
    console.error('プロフィール取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロフィールの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: プロフィール更新
export async function PUT(req: Request) {
  try {
    const userId = await getServerUserId();
    const body = await req.json();
    const { displayName, timezone, language, avatarUrl } = body;

    // デモモード
    if (userId === 'demo-user-001' || !supabaseUrl || !supabaseAnonKey) {
      if (!demoProfiles[userId]) demoProfiles[userId] = { ...demoProfiles['demo-user-001'] };
      if (displayName !== undefined) demoProfiles[userId].displayName = displayName;
      if (timezone !== undefined) demoProfiles[userId].timezone = timezone;
      if (language !== undefined) demoProfiles[userId].language = language;
      if (avatarUrl !== undefined) demoProfiles[userId].avatarUrl = avatarUrl;

      return NextResponse.json({
        success: true,
        data: demoProfiles[userId],
      });
    }

    // Supabase Auth の user_metadata を更新
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: '認証クライアントの取得に失敗しました' },
        { status: 500 }
      );
    }

    const updateData: Record<string, any> = {};
    if (displayName !== undefined) updateData.display_name = displayName;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (language !== undefined) updateData.language = language;
    if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;

    const { data, error } = await client.auth.updateUser({
      data: updateData,
    });

    if (error) {
      console.error('Supabase Auth更新エラー:', error);
      return NextResponse.json(
        { success: false, error: 'プロフィールの更新に失敗しました' },
        { status: 500 }
      );
    }

    const metadata = data.user.user_metadata || {};

    return NextResponse.json({
      success: true,
      data: {
        displayName: metadata.display_name || metadata.full_name || '',
        email: data.user.email || '',
        timezone: metadata.timezone || 'Asia/Tokyo',
        language: metadata.language || 'ja',
        avatarUrl: metadata.avatar_url || null,
      },
    });
  } catch (error) {
    console.error('プロフィール更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'プロフィールの保存に失敗しました' },
      { status: 500 }
    );
  }
}

// ヘルパー: 認証済みSupabaseクライアントを取得
async function getAuthClient() {
  try {
    const cookieStore = await cookies();
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const authCookieName = `sb-${projectRef}-auth-token`;

    const authCookie = cookieStore.get(authCookieName)?.value
      || cookieStore.get('sb-access-token')?.value;

    if (!authCookie) return null;

    let accessToken = authCookie;
    try {
      const parsed = JSON.parse(authCookie);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        accessToken = parsed[0];
      } else if (parsed.access_token) {
        accessToken = parsed.access_token;
      }
    } catch {
      // JSONでなければそのまま
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  } catch {
    return null;
  }
}
