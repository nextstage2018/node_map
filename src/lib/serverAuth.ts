/**
 * Phase 22: サーバーサイド認証ヘルパー
 * APIルートでログインユーザーIDを取得するためのユーティリティ
 */
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isSupabaseConfigured } from './supabase';

const DEMO_USER_ID = 'demo-user-001';

/**
 * サーバーサイドでリクエストから認証済みユーザーIDを取得する
 * Supabase未設定時（デモモード）は固定のデモユーザーIDを返す
 *
 * 使い方（APIルート内）:
 *   const userId = await getServerUserId();
 */
export async function getServerUserId(): Promise<string> {
  // デモモード: Supabase未設定時
  if (!isSupabaseConfigured()) {
    return DEMO_USER_ID;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // cookieからSupabaseセッショントークンを取得
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    // Supabase Auth のトークンを探す（複数の命名パターンに対応）
    let accessToken: string | null = null;

    for (const cookie of allCookies) {
      // sb-<project-ref>-auth-token パターン
      if (cookie.name.includes('auth-token')) {
        try {
          // JSON配列の場合（[access_token, refresh_token]）
          const parsed = JSON.parse(cookie.value);
          if (Array.isArray(parsed) && parsed[0]) {
            accessToken = parsed[0];
          } else if (parsed.access_token) {
            accessToken = parsed.access_token;
          }
        } catch {
          // JSON以外の場合はそのまま使用
          accessToken = cookie.value;
        }
        break;
      }
    }

    if (!accessToken) {
      // トークンが見つからない場合はデモモードにフォールバック
      console.warn('[serverAuth] No auth token found in cookies, falling back to demo mode');
      return DEMO_USER_ID;
    }

    // トークンを使ってSupabaseクライアントを作成し、ユーザー情報を取得
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.warn('[serverAuth] Failed to get user from token:', error?.message);
      return DEMO_USER_ID;
    }

    return user.id;
  } catch (error) {
    console.error('[serverAuth] Unexpected error:', error);
    return DEMO_USER_ID;
  }
}

/**
 * サーバーサイドで認証済みSupabaseクライアントを作成する
 * RLSポリシーがユーザーのコンテキストで適用される
 */
export async function createAuthenticatedClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    let accessToken: string | null = null;

    for (const cookie of allCookies) {
      if (cookie.name.includes('auth-token')) {
        try {
          const parsed = JSON.parse(cookie.value);
          if (Array.isArray(parsed) && parsed[0]) {
            accessToken = parsed[0];
          } else if (parsed.access_token) {
            accessToken = parsed.access_token;
          }
        } catch {
          accessToken = cookie.value;
        }
        break;
      }
    }

    if (!accessToken) {
      return null;
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
