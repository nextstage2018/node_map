// Phase 24: Gmail OAuth 2.0 フロー開始
// GET: Google OAuth認証URLにリダイレクト
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  // Phase B拡張: Google Calendar 連携
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  // Google Drive 連携（アプリが作成・開いたファイルのみ管理）
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export async function GET() {
  try {
    // ENV_TOKEN_OWNER_ID が設定されている場合は常にそれを使う
    // （getServerUserId()はAPIルートでCookie読取りが不安定なため）
    const userId = process.env.ENV_TOKEN_OWNER_ID || 'demo-user-001';
    console.log('[OAuth Start] userId:', userId, '(ENV_TOKEN_OWNER_ID直接使用)');

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { success: false, error: 'Gmail OAuth設定が未完了です（GMAIL_CLIENT_IDが未設定）' },
        { status: 400 }
      );
    }

    // Google OAuth URLを生成
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: userId, // ユーザーIDをstateに含めてコールバックで取得
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log('[OAuth Start] redirect_uri:', REDIRECT_URI);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Gmail OAuth開始エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Gmail認証の開始に失敗しました' },
      { status: 500 }
    );
  }
}
