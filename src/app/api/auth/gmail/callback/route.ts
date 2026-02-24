// Phase 24: Gmail OAuth 2.0 コールバック
// GET: Googleからのリダイレクト処理 → トークン取得 → DB保存 → 設定画面へリダイレクト
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

// リクエストURLからアプリのベースURLを取得
function getAppUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request);
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // userId
    const error = searchParams.get('error');

    if (error) {
      console.error('Gmail OAuth エラー:', error);
      return NextResponse.redirect(`${appUrl}/settings?error=gmail_denied`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appUrl}/settings?error=gmail_invalid`);
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.redirect(`${appUrl}/settings?error=gmail_not_configured`);
    }

    // 認証コードをトークンに交換
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('Gmail トークン取得失敗:', errBody);
      return NextResponse.redirect(`${appUrl}/settings?error=gmail_token_failed`);
    }

    const tokenData = await tokenResponse.json();

    // ユーザー情報を取得（メールアドレス確認用）
    let userEmail = '';
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        userEmail = userInfo.emailAddress || '';
      }
    } catch {
      // ユーザー情報取得失敗は致命的ではない
    }

    // トークンをDBに保存（Service Role Key でRLSをバイパス）
    const sb = createServerClient();
    const userId = state;
    const now = new Date().toISOString();

    if (sb) {
      const { error: dbError } = await sb
        .from('user_service_tokens')
        .upsert(
          {
            user_id: userId,
            service_name: 'gmail',
            token_data: {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              token_type: tokenData.token_type,
              expiry: tokenData.expires_in
                ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                : null,
              email: userEmail,
            },
            is_active: true,
            connected_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id,service_name' }
        );

      if (dbError) {
        console.error('Gmail トークンDB保存エラー:', dbError);
        const errDetail = encodeURIComponent(dbError.message || JSON.stringify(dbError));
        return NextResponse.redirect(`${appUrl}/settings?error=gmail_save_failed&detail=${errDetail}`);
      }
    } else {
      console.error('Supabase未設定のためトークン保存をスキップ');
    }

    return NextResponse.redirect(`${appUrl}/settings?auth=success&service=Gmail`);
  } catch (error) {
    console.error('Gmail OAuthコールバックエラー:', error);
    return NextResponse.redirect(`${appUrl}/settings?error=gmail_callback_failed`);
  }
}
