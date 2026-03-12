// デバッグ: Cronと同じ条件でカレンダーAPIをテスト
// GET /api/cron/debug-calendar?secret=CRON_SECRET
// ENV_TOKEN_OWNER_IDを使い、トークン取得→リフレッシュ→API呼び出しを段階的に確認

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export async function GET(request: NextRequest) {
  const steps: { step: string; result: string; detail?: unknown }[] = [];

  try {
    // Step 0: 認証
    const authHeader = request.headers.get('authorization');
    const urlSecret = request.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 1: ENV_TOKEN_OWNER_ID
    const ownerId = process.env.ENV_TOKEN_OWNER_ID;
    steps.push({
      step: '1. ENV_TOKEN_OWNER_ID',
      result: ownerId ? `OK: ${ownerId}` : 'FAIL: 未設定',
    });
    if (!ownerId) {
      return NextResponse.json({ success: false, steps });
    }

    // Step 2: 環境変数チェック
    const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
    const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
    steps.push({
      step: '2. Google OAuth環境変数',
      result: GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? 'OK' : 'FAIL',
      detail: {
        GMAIL_CLIENT_ID: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 20)}...` : '(空)',
        GMAIL_CLIENT_SECRET: GOOGLE_CLIENT_SECRET ? `${GOOGLE_CLIENT_SECRET.substring(0, 8)}...` : '(空)',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '設定済み' : '(空)',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '設定済み' : '(空)',
      },
    });

    // Step 3: Supabaseクライアント
    const sb = createServerClient();
    steps.push({
      step: '3. Supabase createServerClient()',
      result: sb ? 'OK' : 'FAIL: null',
    });
    if (!sb) {
      return NextResponse.json({ success: false, steps });
    }

    // Step 3b: DB内の全gmailトークン行を確認（user_id不一致の検出用）
    const { data: allRows } = await sb
      .from('user_service_tokens')
      .select('user_id, is_active, connected_at, updated_at')
      .eq('service_name', 'gmail')
      .order('updated_at', { ascending: false })
      .limit(5);
    steps.push({
      step: '3b. DB内の全gmailトークン行',
      result: `${allRows?.length || 0}行`,
      detail: allRows?.map(r => ({
        user_id: r.user_id,
        is_active: r.is_active,
        updated_at: r.updated_at,
        matches_owner: r.user_id === ownerId,
      })),
    });

    // Step 4: トークン取得（全カラム取得して整合性チェック）
    const { data: tokenRow, error: tokenErr } = await sb
      .from('user_service_tokens')
      .select('*')
      .eq('user_id', ownerId)
      .eq('service_name', 'gmail')
      .eq('is_active', true)
      .maybeSingle();

    if (tokenErr || !tokenRow?.token_data) {
      steps.push({
        step: '4. トークン取得',
        result: `FAIL: ${tokenErr?.message || 'token_data null'}`,
        detail: { error: tokenErr },
      });
      return NextResponse.json({ success: false, steps });
    }

    const tokenData = tokenRow.token_data as Record<string, unknown>;
    steps.push({
      step: '4. トークン取得',
      result: 'OK',
      detail: {
        access_token_prefix: (tokenData.access_token as string)?.substring(0, 20) + '...',
        refresh_token_exists: !!tokenData.refresh_token,
        expiry: tokenData.expiry,
        email: tokenData.email,
        scope: tokenData.scope,
        is_active: tokenRow.is_active,
        updated_at: tokenRow.updated_at,
      },
    });

    // Step 5: アクセストークンで直接Calendar APIテスト
    const accessToken = tokenData.access_token as string;
    const testRes = await fetch(`${CALENDAR_API_BASE}/calendars/primary?fields=id,summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let workingToken = accessToken;

    if (testRes.ok) {
      const testData = await testRes.json();
      steps.push({
        step: '5. Calendar API直接テスト (stored token)',
        result: `OK: ${testRes.status}`,
        detail: testData,
      });
    } else {
      const errBody = await testRes.text().catch(() => '');
      steps.push({
        step: '5. Calendar API直接テスト (stored token)',
        result: `FAIL: HTTP ${testRes.status}`,
        detail: { error: errBody.substring(0, 500) },
      });

      // Step 5b: まず旧トークンをrevokeして新規発行を強制
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        steps.push({ step: '5b. 旧トークンrevoke', result: 'OK' });
      } catch {
        steps.push({ step: '5b. 旧トークンrevoke', result: 'SKIP (エラー、続行)' });
      }

      // Step 6: リフレッシュトークンで新しいアクセストークンを取得
      if (tokenData.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokenData.refresh_token as string,
            grant_type: 'refresh_token',
          }),
        });

        if (refreshRes.ok) {
          const newToken = await refreshRes.json();
          workingToken = newToken.access_token;
          steps.push({
            step: '6. トークンリフレッシュ',
            result: 'OK: 新しいアクセストークン取得成功',
            detail: {
              new_token_prefix: newToken.access_token?.substring(0, 20) + '...',
              expires_in: newToken.expires_in,
            },
          });

          // 新しいトークンでCalendar APIテスト
          const retryRes = await fetch(`${CALENDAR_API_BASE}/calendars/primary?fields=id,summary`, {
            headers: { Authorization: `Bearer ${workingToken}` },
          });
          if (retryRes.ok) {
            steps.push({
              step: '6b. Calendar API再テスト (refreshed token)',
              result: `OK: ${retryRes.status}`,
            });

            // DB更新
            await sb
              .from('user_service_tokens')
              .update({
                token_data: {
                  ...tokenData,
                  access_token: newToken.access_token,
                  expiry: newToken.expires_in
                    ? new Date(Date.now() + newToken.expires_in * 1000).toISOString()
                    : tokenData.expiry,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', ownerId)
              .eq('service_name', 'gmail');
            steps.push({ step: '6c. DB更新', result: 'OK' });
          } else {
            const retryErr = await retryRes.text().catch(() => '');
            steps.push({
              step: '6b. Calendar API再テスト (refreshed token)',
              result: `FAIL: HTTP ${retryRes.status}`,
              detail: { error: retryErr.substring(0, 300) },
            });

            // Step 6d: 他のGoogle APIでトークンをテスト（Calendar固有の問題か切り分け）
            try {
              const tokenInfoRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(workingToken)}`
              );
              const tokenInfoData = await tokenInfoRes.json();
              steps.push({
                step: '6d. tokeninfo (トークン検証)',
                result: tokenInfoRes.ok ? 'OK: トークンは有効' : `FAIL: HTTP ${tokenInfoRes.status}`,
                detail: tokenInfoRes.ok ? {
                  scope: tokenInfoData.scope,
                  expires_in: tokenInfoData.expires_in,
                  email: tokenInfoData.email,
                  audience: tokenInfoData.aud?.substring(0, 30) + '...',
                } : tokenInfoData,
              });
            } catch (tiErr) {
              steps.push({ step: '6d. tokeninfo', result: `ERROR: ${String(tiErr)}` });
            }

            // Step 6e: Gmail APIでもテスト
            try {
              const gmailRes = await fetch(
                'https://www.googleapis.com/gmail/v1/users/me/profile',
                { headers: { Authorization: `Bearer ${workingToken}` } }
              );
              steps.push({
                step: '6e. Gmail API テスト',
                result: gmailRes.ok ? `OK: ${gmailRes.status}` : `FAIL: HTTP ${gmailRes.status}`,
              });
            } catch (gmErr) {
              steps.push({ step: '6e. Gmail API テスト', result: `ERROR: ${String(gmErr)}` });
            }
          }
        } else {
          const refreshErr = await refreshRes.text().catch(() => '');
          steps.push({
            step: '6. トークンリフレッシュ',
            result: `FAIL: HTTP ${refreshRes.status}`,
            detail: { error: refreshErr.substring(0, 500) },
          });
        }
      } else {
        steps.push({
          step: '6. トークンリフレッシュ',
          result: 'SKIP: リフレッシュトークンまたはOAuth環境変数なし',
          detail: {
            has_refresh_token: !!tokenData.refresh_token,
            has_client_id: !!GOOGLE_CLIENT_ID,
            has_client_secret: !!GOOGLE_CLIENT_SECRET,
          },
        });
      }
    }

    // Step 7: calendarClient.service.tsのgetEventsを呼んでみる
    try {
      const { getEvents } = await import('@/services/calendar/calendarClient.service');
      const now = new Date();
      const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();

      const events = await getEvents(ownerId, timeMin, timeMax, 'primary', 50);
      steps.push({
        step: '7. getEvents() (Cronと同じ呼び出し)',
        result: `OK: ${events.length}件`,
        detail: events.map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
          hasAttachments: (e.attachments?.length || 0) > 0,
          hangoutLink: e.hangoutLink || null,
        })),
      });
    } catch (getEventsErr) {
      steps.push({
        step: '7. getEvents() (Cronと同じ呼び出し)',
        result: `FAIL: ${String(getEventsErr)}`,
      });
    }

    return NextResponse.json({ success: true, steps });
  } catch (topErr) {
    steps.push({ step: 'トップレベルエラー', result: `FAIL: ${String(topErr)}` });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
