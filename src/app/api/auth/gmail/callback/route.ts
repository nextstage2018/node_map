// Gmail OAuth 2.0 コールバック
// 成功時: /settings にリダイレクト（成功メッセージ表示）
// 失敗時: /settings にリダイレクト（エラーメッセージ表示）
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

function redirectToSettings(params: Record<string, string>) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = new URLSearchParams(params);
  return NextResponse.redirect(`${appUrl}/settings?${searchParams.toString()}`);
}

export async function GET(request: NextRequest) {
  try {
    // 1. URLパラメータ
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      return redirectToSettings({ error: 'gmail_denied' });
    }

    if (!code) {
      return redirectToSettings({ error: 'gmail_invalid' });
    }

    // 2. マルチユーザー対応: stateパラメータからuserIdを取得（フォールバック: ENV_TOKEN_OWNER_ID）
    const stateUserId = request.nextUrl.searchParams.get('state');
    const userId = stateUserId || process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      return redirectToSettings({ error: 'gmail_invalid' });
    }

    // 3. トークン交換
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
      console.error('[Gmail Callback] トークン交換失敗:', tokenResponse.status, errBody.substring(0, 200));
      return redirectToSettings({ error: 'gmail_token_failed' });
    }

    const tokenData = await tokenResponse.json();

    // 4. スコープ確認
    const scope = tokenData.scope || '';

    // 5. メールアドレス取得
    let userEmail = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        userEmail = profile.emailAddress || '';
      }
    } catch {
      // メールアドレス取得失敗は致命的でないのでスキップ
    }

    // 6. DB保存（REST API直接）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Gmail Callback] Supabase環境変数未設定');
      return redirectToSettings({ error: 'gmail_save_failed' });
    }

    const now = new Date().toISOString();
    const newTokenData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expiry: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      email: userEmail,
      scope: scope,
    };

    // PATCH via REST API
    const updateUrl = `${supabaseUrl}/rest/v1/user_service_tokens?user_id=eq.${userId}&service_name=eq.gmail`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        token_data: newTokenData,
        is_active: true,
        connected_at: now,
        updated_at: now,
      }),
    });

    const updateResBody = await updateRes.text();
    let updateRows: unknown[] = [];
    try { updateRows = JSON.parse(updateResBody); } catch { /* */ }

    let dbSaved = false;

    if (Array.isArray(updateRows) && updateRows.length > 0) {
      dbSaved = true;
    } else {
      // INSERT試行
      const insertUrl = `${supabaseUrl}/rest/v1/user_service_tokens`;
      const insertRes = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: userId,
          service_name: 'gmail',
          token_data: newTokenData,
          is_active: true,
          connected_at: now,
          updated_at: now,
        }),
      });

      if (insertRes.ok) {
        dbSaved = true;
      } else {
        const insertBody = await insertRes.text();
        console.error('[Gmail Callback] DB INSERT失敗:', insertRes.status, insertBody.substring(0, 150));
      }
    }

    if (!dbSaved) {
      return redirectToSettings({ error: 'gmail_save_failed' });
    }

    // 成功 → 設定画面にリダイレクト
    return redirectToSettings({ authResult: 'success', service: 'Google' });

  } catch (err) {
    console.error('[Gmail Callback] 予期せぬエラー:', err);
    return redirectToSettings({ error: 'gmail_callback_failed' });
  }
}
