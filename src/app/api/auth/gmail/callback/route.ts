// Gmail OAuth 2.0 コールバック
// Googleからのリダイレクトを受け取り、トークン交換→DB保存→設定画面にリダイレクト
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // URLパラメータ取得
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    console.log('[OAuth Callback] 受信', {
      hasCode: !!code,
      codeLength: code?.length,
      codePrefix: code?.substring(0, 10),
      error,
    });

    if (error) {
      console.error('[OAuth Callback] Google側エラー:', error);
      return NextResponse.redirect(`${appUrl}/settings?error=${error}`);
    }

    if (!code) {
      console.error('[OAuth Callback] codeパラメータなし');
      return NextResponse.redirect(`${appUrl}/settings?error=no_code`);
    }

    // ENV_TOKEN_OWNER_IDを直接使用
    const userId = process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      console.error('[OAuth Callback] ENV_TOKEN_OWNER_ID未設定');
      return NextResponse.redirect(`${appUrl}/settings?error=no_owner_id`);
    }

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
      console.error('[OAuth Callback] トークン交換失敗:', tokenResponse.status, errBody);
      return NextResponse.redirect(`${appUrl}/settings?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[OAuth Callback] トークン交換成功', {
      has_access_token: !!tokenData.access_token,
      has_refresh_token: !!tokenData.refresh_token,
      scope: tokenData.scope,
    });

    // メールアドレス取得
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
      // 非致命的
    }

    // DB保存（upsertではなく明示的にupdate → 失敗ならinsert）
    const sb = createServerClient();
    if (!sb) {
      console.error('[OAuth Callback] Supabase未設定');
      return NextResponse.redirect(`${appUrl}/settings?error=db_error`);
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
      scope: tokenData.scope || '',
    };

    // まずUPDATEを試行
    const { data: updateResult, error: updateError } = await sb
      .from('user_service_tokens')
      .update({
        token_data: newTokenData,
        is_active: true,
        connected_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('service_name', 'gmail')
      .select('user_id, updated_at');

    console.log('[OAuth Callback] UPDATE結果:', {
      rowsAffected: updateResult?.length || 0,
      error: updateError ? JSON.stringify(updateError) : null,
    });

    // UPDATEで0行の場合はINSERT
    if (!updateResult || updateResult.length === 0) {
      console.log('[OAuth Callback] 既存行なし → INSERT実行');
      const { error: insertError } = await sb
        .from('user_service_tokens')
        .insert({
          user_id: userId,
          service_name: 'gmail',
          token_data: newTokenData,
          is_active: true,
          connected_at: now,
          updated_at: now,
        });

      if (insertError) {
        console.error('[OAuth Callback] INSERT失敗:', JSON.stringify(insertError));
        return NextResponse.redirect(`${appUrl}/settings?error=db_insert_failed`);
      }
    } else if (updateError) {
      console.error('[OAuth Callback] UPDATE失敗:', JSON.stringify(updateError));
      return NextResponse.redirect(`${appUrl}/settings?error=db_update_failed`);
    }

    // 読み戻し検証
    const { data: verifyRow } = await sb
      .from('user_service_tokens')
      .select('updated_at, token_data')
      .eq('user_id', userId)
      .eq('service_name', 'gmail')
      .single();

    const savedScope = (verifyRow?.token_data as Record<string, unknown>)?.scope || '';
    console.log('[OAuth Callback] 検証:', {
      updated_at: verifyRow?.updated_at,
      savedScope,
      hasDriveReadonly: String(savedScope).includes('drive.readonly'),
    });

    console.log('[OAuth Callback] 完了 userId:', userId, 'email:', userEmail);
    return NextResponse.redirect(`${appUrl}/settings?auth=success&service=Gmail`);
  } catch (err) {
    console.error('[OAuth Callback] 予期せぬエラー:', err);
    return NextResponse.redirect(`${appUrl}/settings?error=unexpected`);
  }
}
