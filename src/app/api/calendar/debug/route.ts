// カレンダー接続デバッグ用エンドポイント
// GET /api/calendar/debug でブラウザから直接確認可能

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const steps: { step: string; result: string; detail?: unknown }[] = [];

  try {
    // Step 1: ユーザー認証
    const userId = await getServerUserId();
    steps.push({ step: '1. ユーザー認証', result: userId ? `OK (${userId.substring(0, 8)}...)` : 'FAIL: 未認証' });
    if (!userId) {
      return NextResponse.json({ success: false, steps }, { status: 401 });
    }

    // Step 2: トークン取得
    const sb = createServerClient();
    if (!sb) {
      steps.push({ step: '2. Supabaseクライアント', result: 'FAIL: createServerClient() returned null' });
      return NextResponse.json({ success: false, steps });
    }
    steps.push({ step: '2. Supabaseクライアント', result: 'OK' });

    // Step 3: user_service_tokens からトークン取得
    const { data: tokenRow, error: tokenErr } = await sb
      .from('user_service_tokens')
      .select('token_data, is_active, connected_at, updated_at')
      .eq('user_id', userId)
      .eq('service_name', 'gmail')
      .eq('is_active', true)
      .single();

    if (tokenErr) {
      steps.push({ step: '3. トークン取得', result: `FAIL: ${tokenErr.message}`, detail: tokenErr });
      return NextResponse.json({ success: false, steps });
    }
    if (!tokenRow?.token_data) {
      steps.push({ step: '3. トークン取得', result: 'FAIL: token_data が null' });
      return NextResponse.json({ success: false, steps });
    }

    const tokenData = tokenRow.token_data as Record<string, unknown>;
    steps.push({
      step: '3. トークン取得',
      result: 'OK',
      detail: {
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
        scope: tokenData.scope || '(未保存)',
        email: tokenData.email || '(なし)',
        expiry: tokenData.expiry || '(なし)',
        connected_at: tokenRow.connected_at,
        updated_at: tokenRow.updated_at,
      },
    });

    // Step 4: トークン有効期限チェック
    const expiry = tokenData.expiry as string | null;
    if (expiry) {
      const expiryDate = new Date(expiry);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      const diffMin = Math.round(diffMs / 60000);
      steps.push({
        step: '4. トークン有効期限',
        result: diffMs > 0 ? `OK (残り${diffMin}分)` : `期限切れ (${diffMin}分前に失効)`,
        detail: { expiry, now: now.toISOString(), diffMinutes: diffMin },
      });
    } else {
      steps.push({ step: '4. トークン有効期限', result: '情報なし (expiryフィールドなし)' });
    }

    // Step 5: トークンリフレッシュテスト
    const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
    const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
    steps.push({
      step: '5. OAuth環境変数',
      result: GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? 'OK' : 'FAIL',
      detail: {
        GMAIL_CLIENT_ID: GOOGLE_CLIENT_ID ? `設定済み (${GOOGLE_CLIENT_ID.substring(0, 15)}...)` : '未設定',
        GMAIL_CLIENT_SECRET: GOOGLE_CLIENT_SECRET ? '設定済み' : '未設定',
      },
    });

    // Step 6: 実際のAPI呼び出しテスト（primary calendar）
    let accessToken = tokenData.access_token as string;

    // まず現在のトークンでテスト
    const testRes1 = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary?fields=id,summary', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (testRes1.ok) {
      const calData = await testRes1.json();
      steps.push({
        step: '6. Calendar API テスト (現在のトークン)',
        result: 'OK',
        detail: { calendarId: calData.id, summary: calData.summary },
      });
    } else {
      const errText = await testRes1.text();
      steps.push({
        step: '6. Calendar API テスト (現在のトークン)',
        result: `FAIL: HTTP ${testRes1.status}`,
        detail: { status: testRes1.status, error: errText.substring(0, 500) },
      });

      // Step 7: トークンリフレッシュ試行
      if (tokenData.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        try {
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
            const newTokenData = await refreshRes.json();
            accessToken = newTokenData.access_token;
            steps.push({
              step: '7. トークンリフレッシュ',
              result: 'OK (新しいトークン取得)',
              detail: { new_expires_in: newTokenData.expires_in },
            });

            // リフレッシュ後に再テスト
            const testRes2 = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary?fields=id,summary', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (testRes2.ok) {
              const calData2 = await testRes2.json();
              steps.push({
                step: '8. Calendar API テスト (リフレッシュ後)',
                result: 'OK',
                detail: { calendarId: calData2.id, summary: calData2.summary },
              });
            } else {
              steps.push({
                step: '8. Calendar API テスト (リフレッシュ後)',
                result: `FAIL: HTTP ${testRes2.status}`,
              });
            }
          } else {
            const refreshErr = await refreshRes.text();
            steps.push({
              step: '7. トークンリフレッシュ',
              result: `FAIL: HTTP ${refreshRes.status}`,
              detail: { error: refreshErr.substring(0, 500) },
            });
          }
        } catch (refreshCatchErr) {
          steps.push({
            step: '7. トークンリフレッシュ',
            result: `FAIL: 例外`,
            detail: { error: String(refreshCatchErr) },
          });
        }
      } else {
        steps.push({
          step: '7. トークンリフレッシュ',
          result: 'スキップ (refresh_token or OAuth credentials missing)',
        });
      }
    }

    // Step 9: 空き時間テスト
    try {
      const { findFreeSlots, formatFreeSlotsForContext } = await import('@/services/calendar/calendarClient.service');
      const now = new Date();
      const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
      const jst = new Date(jstMs);
      const tomorrowStart = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) - 9 * 60 * 60 * 1000);
      const weekEnd = new Date(tomorrowStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const freeSlots = await findFreeSlots(userId, tomorrowStart.toISOString(), weekEnd.toISOString(), 60);
      steps.push({
        step: '9. 空き時間検索テスト',
        result: `OK (${freeSlots.length}件)`,
        detail: { formatted: formatFreeSlotsForContext(freeSlots) },
      });
    } catch (fsErr) {
      steps.push({
        step: '9. 空き時間検索テスト',
        result: `FAIL: ${String(fsErr)}`,
      });
    }

    return NextResponse.json({ success: true, steps });
  } catch (topErr) {
    steps.push({ step: 'トップレベルエラー', result: `FAIL: ${String(topErr)}` });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
