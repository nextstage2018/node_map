// Gmail OAuth 手動トークン設定エンドポイント
// OAuth Playgroundなどで取得したrefresh_tokenを受け取り、
// access_tokenを取得してDBに保存する。
// ネットワークレベルのURL難読化問題のワークアラウンド。
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET認証（セキュリティ）
    const cronSecret = process.env.CRON_SECRET;
    const body = await request.json();
    const { refresh_token, secret } = body;

    if (cronSecret && secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!refresh_token) {
      return NextResponse.json({ success: false, error: 'refresh_tokenが必要です' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ success: false, error: 'Google OAuth環境変数が未設定です' }, { status: 400 });
    }

    const userId = process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'ENV_TOKEN_OWNER_IDが未設定です' }, { status: 500 });
    }

    console.log('[Manual Token] refresh_tokenからaccess_token取得開始');

    // refresh_tokenでaccess_tokenを取得
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[Manual Token] トークン取得失敗:', errBody);
      return NextResponse.json({
        success: false,
        error: 'refresh_tokenからaccess_token取得に失敗しました',
        detail: errBody,
      }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    console.log('[Manual Token] access_token取得成功', {
      has_access_token: !!tokenData.access_token,
      scope: tokenData.scope,
      expires_in: tokenData.expires_in,
    });

    // Calendar APIテスト
    let calendarOk = false;
    try {
      const testRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary?fields=id,summary', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      calendarOk = testRes.ok;
      const testBody = testRes.ok ? await testRes.json() : await testRes.text();
      console.log('[Manual Token] Calendar APIテスト:', testRes.ok ? `OK: ${JSON.stringify(testBody)}` : `FAIL: ${testRes.status} ${testBody}`);
    } catch (e) {
      console.warn('[Manual Token] Calendar APIテスト例外:', e);
    }

    // Gmail APIテスト（メールアドレス取得）
    let userEmail = '';
    try {
      const gmailRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (gmailRes.ok) {
        const profile = await gmailRes.json();
        userEmail = profile.emailAddress || '';
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
            refresh_token: refresh_token, // 元のrefresh_tokenを保存
            token_type: tokenData.token_type || 'Bearer',
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
      console.error('[Manual Token] DB保存エラー:', JSON.stringify(dbError));
      return NextResponse.json({ success: false, error: 'DB保存エラー', detail: dbError.message }, { status: 500 });
    }

    console.log('[Manual Token] 完了', { userId, userEmail, calendarOk });

    return NextResponse.json({
      success: true,
      email: userEmail,
      calendarOk,
      message: calendarOk
        ? 'トークン保存成功！Calendar APIも正常動作しています。'
        : 'トークン保存成功。ただしCalendar APIテストは失敗しました（スコープ不足の可能性）。',
    });
  } catch (error) {
    console.error('[Manual Token] エラー:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
