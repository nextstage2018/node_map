// Phase 22: サーバーサイド認証ヘルパー
// APIルートから認証ユーザーのIDを取得する

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const DEMO_USER_ID = 'demo-user-001';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * サーバーサイドで認証ユーザーIDを取得する
 * - Supabase未設定時（デモモード）→ 'demo-user-001' を返す
 * - ログイン済み → ユーザーのUUIDを返す
 * - 未ログイン → 'demo-user-001' を返す（デモモードとして動作）
 */
export async function getServerUserId(): Promise<string> {
  // Supabase未設定 → デモモード
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    return DEMO_USER_ID;
  }

  try {
    const cookieStore = await cookies();

    // Supabase Auth のアクセストークンを取得
    // sb-<project-ref>-auth-token の形式でCookieに保存されている
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const authCookieName = `sb-${projectRef}-auth-token`;

    const authCookie = cookieStore.get(authCookieName)?.value
      || cookieStore.get('sb-access-token')?.value;

    if (!authCookie) {
      return DEMO_USER_ID;
    }

    // トークンからユーザー情報を取得
    let accessToken = authCookie;

    // Cookie値がJSON配列の場合（Supabase v2の形式）
    try {
      const parsed = JSON.parse(authCookie);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        accessToken = parsed[0];
      } else if (parsed.access_token) {
        accessToken = parsed.access_token;
      }
    } catch {
      // JSONでなければそのまま使用
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return DEMO_USER_ID;
    }

    return user.id;
  } catch (error) {
    console.error('getServerUserId error:', error);
    return DEMO_USER_ID;
  }
}
