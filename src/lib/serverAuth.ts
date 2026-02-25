// Phase 22: サーバーサイド認証ヘルパー
// APIルートから認証ユーザーのIDを取得する

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
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
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

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

/**
 * Phase 35: サーバーサイドでログインユーザーのメールアドレスを取得する
 * - Supabase未設定時 → null
 * - ログイン済み → ユーザーのメールアドレス
 * - 未ログイン → null
 */
export async function getServerUserEmail(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseUrl.startsWith('http')) {
    return null;
  }

  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.email || null;
  } catch {
    return null;
  }
}
