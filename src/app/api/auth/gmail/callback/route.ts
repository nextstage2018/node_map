// Gmail OAuth 2.0 コールバック
// 結果をHTML画面に直接表示（リダイレクトだと問題が見えないため）
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI
  || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/gmail/callback`;

// 結果をHTML画面で表示するヘルパー
function htmlResponse(title: string, steps: { label: string; status: string; detail?: string }[]) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const rows = steps.map(s => {
    const icon = s.status === 'OK' ? '✅' : s.status === 'SKIP' ? '⏭️' : '❌';
    const detail = s.detail ? `<div style="color:#888;font-size:13px;margin-top:2px">${s.detail}</div>` : '';
    return `<div style="margin:8px 0;padding:8px 12px;background:#f9f9f9;border-radius:6px">${icon} <strong>${s.label}</strong>: ${s.status}${detail}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:0 20px">
<h2>${title}</h2>${rows}
<a href="${appUrl}/settings" style="display:inline-block;margin-top:16px;padding:8px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">設定画面に戻る</a>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  const steps: { label: string; status: string; detail?: string }[] = [];

  try {
    // 1. URLパラメータ
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      steps.push({ label: '認証コード', status: 'NG', detail: `Google側エラー: ${error}` });
      return htmlResponse('Google認証エラー', steps);
    }

    if (!code) {
      steps.push({ label: '認証コード', status: 'NG', detail: 'codeパラメータが見つかりません' });
      return htmlResponse('Google認証エラー', steps);
    }

    steps.push({ label: '認証コード受信', status: 'OK', detail: `長さ=${code.length}, 先頭=${code.substring(0, 8)}...` });

    // 2. マルチユーザー対応: stateパラメータからuserIdを取得（フォールバック: ENV_TOKEN_OWNER_ID）
    const stateUserId = request.nextUrl.searchParams.get('state');
    const userId = stateUserId || process.env.ENV_TOKEN_OWNER_ID;
    if (!userId) {
      steps.push({ label: 'ユーザーID', status: 'NG', detail: 'stateパラメータもENV_TOKEN_OWNER_IDも未設定' });
      return htmlResponse('設定エラー', steps);
    }
    steps.push({ label: 'ユーザーID', status: 'OK', detail: `${userId.substring(0, 8)}... (${stateUserId ? 'state' : 'ENV'})` });

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
      steps.push({ label: 'トークン交換', status: 'NG', detail: `HTTP ${tokenResponse.status}: ${errBody.substring(0, 200)}` });
      return htmlResponse('トークン交換失敗', steps);
    }

    const tokenData = await tokenResponse.json();
    steps.push({
      label: 'トークン交換',
      status: 'OK',
      detail: `access_token=${!!tokenData.access_token}, refresh_token=${!!tokenData.refresh_token}, scope=${tokenData.scope || '(なし)'}`,
    });

    // 4. スコープ確認
    const scope = tokenData.scope || '';
    const hasDriveReadonly = scope.includes('drive.readonly');
    steps.push({
      label: 'drive.readonly スコープ',
      status: hasDriveReadonly ? 'OK' : 'NG',
      detail: hasDriveReadonly ? '含まれています' : `スコープ一覧: ${scope}`,
    });

    // 5. メールアドレス取得
    let userEmail = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        userEmail = profile.emailAddress || '';
        steps.push({ label: 'メールアドレス', status: 'OK', detail: userEmail });
      } else {
        steps.push({ label: 'メールアドレス', status: 'SKIP', detail: `取得失敗 (${profileRes.status})` });
      }
    } catch {
      steps.push({ label: 'メールアドレス', status: 'SKIP', detail: '取得エラー' });
    }

    // 6. DB保存（REST API直接）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      steps.push({ label: 'DB保存', status: 'NG', detail: 'Supabase環境変数未設定' });
      return htmlResponse('DB設定エラー', steps);
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

    if (Array.isArray(updateRows) && updateRows.length > 0) {
      steps.push({ label: 'DB保存 (UPDATE)', status: 'OK', detail: `${updateRows.length}行更新` });
    } else {
      steps.push({ label: 'DB保存 (UPDATE)', status: 'NG', detail: `HTTP ${updateRes.status}: ${updateResBody.substring(0, 150)}` });

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
      const insertBody = await insertRes.text();
      steps.push({ label: 'DB保存 (INSERT)', status: insertRes.ok ? 'OK' : 'NG', detail: `HTTP ${insertRes.status}: ${insertBody.substring(0, 150)}` });
    }

    // 7. 読み戻し検証
    const verifyUrl = `${supabaseUrl}/rest/v1/user_service_tokens?user_id=eq.${userId}&service_name=eq.gmail&select=updated_at,token_data`;
    const verifyRes = await fetch(verifyUrl, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });
    const verifyRows = await verifyRes.json().catch(() => []);
    const verifyRow = Array.isArray(verifyRows) ? verifyRows[0] : null;
    const savedScope = verifyRow?.token_data?.scope || '';
    const savedUpdatedAt = verifyRow?.updated_at || '';

    steps.push({
      label: 'DB検証',
      status: String(savedScope).includes('drive.readonly') ? 'OK' : 'NG',
      detail: `updated_at=${savedUpdatedAt}, drive.readonly=${String(savedScope).includes('drive.readonly')}`,
    });

    const allOk = steps.every(s => s.status === 'OK' || s.status === 'SKIP');
    return htmlResponse(allOk ? 'Google認証 成功！' : 'Google認証 一部問題あり', steps);

  } catch (err) {
    steps.push({ label: '予期せぬエラー', status: 'NG', detail: String(err) });
    return htmlResponse('Google認証エラー', steps);
  }
}
