// Phase 24: Slack OAuth 2.0 フロー開始
// GET: Slack OAuth認証URLにリダイレクト
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
const REDIRECT_URI = process.env.SLACK_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/slack/callback`;

const SCOPES = [
  'channels:read',
  'channels:history',
  'chat:write',
  'im:read',
  'im:history',
  'users:read',
  'reactions:read',
  'reactions:write',
].join(',');

export async function GET() {
  try {
    // 認証確認
    const userId = await getServerUserId();

    if (!SLACK_CLIENT_ID) {
      return NextResponse.json(
        { success: false, error: 'Slack OAuth設定が未完了です（SLACK_CLIENT_IDが未設定）' },
        { status: 400 }
      );
    }

    // Slack OAuth URLを生成
    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state: userId,
    });

    const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Slack OAuth開始エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Slack認証の開始に失敗しました' },
      { status: 500 }
    );
  }
}
