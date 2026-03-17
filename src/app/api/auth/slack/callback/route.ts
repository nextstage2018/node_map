// Phase 24: Slack OAuth 2.0 コールバック
// GET: Slackからのリダイレクト処理 → トークン取得 → DB保存 → 設定画面へリダイレクト
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.SLACK_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/slack/callback`;

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
      console.error('Slack OAuth エラー:', error);
      return NextResponse.redirect(`${appUrl}/settings?error=slack_denied`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appUrl}/settings?error=slack_invalid`);
    }

    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      return NextResponse.redirect(`${appUrl}/settings?error=slack_not_configured`);
    }

    // 認証コードをトークンに交換
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('Slack トークン取得失敗:', tokenData.error);
      return NextResponse.redirect(`${appUrl}/settings?error=slack_token_failed`);
    }

    // 認証ユーザーのプロフィールを取得（個人名表示用）
    let authedUserName = '';
    let authedUserEmail = '';
    const authedUserId = tokenData.authed_user?.id || '';
    if (authedUserId && tokenData.access_token) {
      try {
        const profileRes = await fetch(`https://slack.com/api/users.info?user=${authedUserId}`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profileData = await profileRes.json();
        if (profileData.ok && profileData.user) {
          authedUserName = profileData.user.real_name || profileData.user.name || '';
          authedUserEmail = profileData.user.profile?.email || '';
        }
      } catch (e) {
        console.warn('[Slack OAuth] ユーザープロフィール取得失敗（続行）:', e);
      }
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
            service_name: 'slack',
            token_data: {
              access_token: tokenData.access_token,
              token_type: tokenData.token_type,
              team_id: tokenData.team?.id || '',
              team_name: tokenData.team?.name || '',
              bot_user_id: tokenData.bot_user_id || '',
              scope: tokenData.scope || '',
              // 認証ユーザー自身のSlack ID（メッセージのuser_id紐づけに必要）
              authed_user_id: authedUserId,
              authed_user_scope: tokenData.authed_user?.scope || '',
              // 認証ユーザーの個人情報（サイドバー表示用）
              authed_user_name: authedUserName,
              authed_user_email: authedUserEmail,
            },
            is_active: true,
            connected_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id,service_name' }
        );

      if (dbError) {
        console.error('Slack トークンDB保存エラー:', dbError);
        return NextResponse.redirect(`${appUrl}/settings?error=slack_save_failed`);
      }
    } else {
      console.error('Supabase未設定のためトークン保存をスキップ');
    }

    return NextResponse.redirect(`${appUrl}/settings?auth=success&service=Slack`);
  } catch (error) {
    console.error('Slack OAuthコールバックエラー:', error);
    return NextResponse.redirect(`${appUrl}/settings?error=slack_callback_failed`);
  }
}
