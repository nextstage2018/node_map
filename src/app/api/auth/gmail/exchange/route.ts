// Gmail OAuth トークン交換エンドポイント
// クライアントサイドから受け取ったcodeでGoogleトークンを取得し、DBに保存する。
// コールバックHTML中継ページ（/api/auth/gmail/callback）から呼び出される。
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'codeが必要です' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ success: false, error: 'Google OAuth設定が未完了です' }, { status: 400 });
    }

    const userId = process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'ENV_TOKEN_OWNER_IDが未設定です' }, { status: 500 });
    }

    console.log('[OAuth Exchange] トークン交換開始', {
      codeLength: code.length,
      codePrefix: code.substring(0, 10),
      codeSuffix: code.substring(code.length - 10),
      userId,
      redirectUri: REDIRECT_URI,
    });

    // トークン交換
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
      console.error('[OAuth Exchange] トークン取得失敗:', errBody);
      return NextResponse.json({
        success: false,
        error: 'Googleトークン取得に失敗しました',
        detail: errBody,
      }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    console.log('[OAuth Exchange] トークン交換成功', {
      has_access_token: !!tokenData.access_token,
      access_token_prefix: tokenData.access_token?.substring(0, 15),
      has_refresh_token: !!tokenData.refresh_token,
      scope: tokenData.scope,
      expires_in: tokenData.expires_in,
    });

    // 新しいトークンで即座にCalendar APIテスト
    let calendarOk = false;
    try {
      const testRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary?fields=id', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      calendarOk = testRes.ok;
      console.log('[OAuth Exchange] Calendar APIテスト:', testRes.ok ? 'OK' : `FAIL: ${testRes.status}`);
    } catch {
      console.warn('[OAuth Exchange] Calendar APIテスト失敗（続行）');
    }

    // ユーザー情報取得（メールアドレス確認用）
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
      // 非致命的
    }

    // DB保存
    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 500 });
    }

    const now = new Date().toISOString();
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
            scope: tokenData.scope || '',
          },
          is_active: true,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id,service_name' }
      );

    if (dbError) {
      console.error('[OAuth Exchange] DB保存エラー:', JSON.stringify(dbError));
      return NextResponse.json({ success: false, error: 'DB保存エラー', detail: dbError.message }, { status: 500 });
    }

    console.log('[OAuth Exchange] 完了 userId:', userId, 'email:', userEmail, 'calendarOk:', calendarOk);

    return NextResponse.json({
      success: true,
      email: userEmail,
      calendarOk,
    });
  } catch (error) {
    console.error('[OAuth Exchange] エラー:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
