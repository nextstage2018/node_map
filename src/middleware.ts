/**
 * Phase 22.5: 認証ミドルウェア
 * デモモード廃止 → 未認証ユーザーはログイン画面にリダイレクト
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Supabaseが設定されているか判定
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

// 認証不要なパス
const publicPaths = ['/login', '/signup', '/auth/callback', '/api/auth/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公開パス、静的ファイルはスキップ
  if (
    publicPaths.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Supabase未設定時もログインページにリダイレクト（デモモード廃止）
  if (!isConfigured) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Supabase が設定されていません' },
        { status: 503 }
      );
    }
    // ログインページ自体は表示（エラーメッセージ表示用）
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'not_configured');
    return NextResponse.redirect(loginUrl);
  }

  // Supabase Authのセッショントークンを確認
  let hasToken = false;
  const allCookies = request.cookies.getAll();

  for (const cookie of allCookies) {
    if (cookie.name.includes('auth-token')) {
      hasToken = true;
      break;
    }
  }

  if (!hasToken) {
    // APIルートの場合は 401 JSON を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ページの場合はログイン画面にリダイレクト
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
