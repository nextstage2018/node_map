// Phase 24: Slack OAuth 2.0 コールバック
// GET: Slackからのリダイレクト処理 → トークン取得 → DB保存 → 設定画面へリダイレクト
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.SLACK_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/slack/callback`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // userId
    const error = searchParams.get('error');

    if (error) {
      console.error('Slack OAuth エラー:', error);
      return NextResponse.redirect(`${APP_URL}/settings?error=slack_denied`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${APP_URL}/settings?error=slack_invalid`);
    }

    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      return NextResponse.redirect(`${APP_URL}/settings?error=slack_not_configured`);
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
      return NextResponse.redirect(`${APP_URL}/settings?error=slack_token_failed`);
    }

    // トークンをDBに保存
    const sb = getSupabase();
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
            },
            is_active: true,
            connected_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id,service_name' }
        );

      if (dbError) {
        console.error('Slack トークンDB保存エラー:', dbError);
        return NextResponse.redirect(`${APP_URL}/settings?error=slack_save_failed`);
      }
    }

    return NextResponse.redirect(`${APP_URL}/settings?success=slack_connected`);
  } catch (error) {
    console.error('Slack OAuthコールバックエラー:', error);
    return NextResponse.redirect(`${APP_URL}/settings?error=slack_callback_failed`);
  }
}
