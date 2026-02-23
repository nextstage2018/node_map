/**
 * Phase 22: サーバーサイド認証ヘルパー
 * APIルートでログインユーザーIDを取得するためのユーティリティ
 * 
 * Phase 22.5: デモモード廃止 → 認証必須化
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isSupabaseConfigured } from './supabase';

/**
 * 認証エラークラス
 * API ルートで catch してステータス 401 を返すために使用
 */
export class AuthenticationError extends Error {
  constructor(message = '認証が必要です。ログインしてください。') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * サーバーサイドでリクエストから認証済みユーザーIDを取得する
 * 未認証の場合は AuthenticationError をスローする
 *
 * 使い方（APIルート内）:
 *   const userId = await getServerUserId();
 */
export async function getServerUserId(): Promise<string> {
  // Supabase未設定時はエラー（デモモード廃止）
  if (!isSupabaseConfigured()) {
    throw new AuthenticationError('Supabase が設定されていません。');
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
      throw new AuthenticationError('認証トークンが見つかりません。ログインしてください。');
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
      throw new AuthenticationError('セッションが無効です。再ログインしてください。');
    }

    return user.id;
  } catch (error) {
    // AuthenticationError はそのまま再スロー
    if (error instanceof AuthenticationError) {
      throw error;
    }
    console.error('[serverAuth] Unexpected error:', error);
    throw new AuthenticationError('認証処理中にエラーが発生しました。');
  }
}

/**
 * サーバーサイドで認証済みSupabaseクライアントを作成する
 * RLSポリシーがユーザーのコンテキストで適用される
 * 未認証の場合は null ではなく AuthenticationError をスロー
 */
export async function createAuthenticatedClient() {
  if (!isSupabaseConfigured()) {
    throw new AuthenticationError('Supabase が設定されていません。');
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
      throw new AuthenticationError('認証トークンが見つかりません。');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('認証クライアントの作成に失敗しました。');
  }
}
