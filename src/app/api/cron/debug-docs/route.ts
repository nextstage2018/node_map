// Docs API / Drive API アクセス診断エンドポイント
// 特定のファイルIDに対して各種APIでアクセスを試行し、結果を返す
// v2: REST API直接読み取り + getValidAccessToken() 両方で比較
import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/services/calendar/calendarClient.service';

export const dynamic = 'force-dynamic';

const FILE_ID = '1mK9siR1alG7bTY0e81c-bQw34iR5_E_RZlye7CwC3Ac';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const urlSecret = request.nextUrl.searchParams.get('secret');
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.ENV_TOKEN_OWNER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'ENV_TOKEN_OWNER_ID未設定' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ========================================
  // Step 1: REST APIで直接DBからトークンを読み取り
  // ========================================
  let dbTokenData: Record<string, unknown> | null = null;
  let dbUpdatedAt = '';
  let restAccessToken = '';
  let restRefreshToken = '';

  if (supabaseUrl && serviceRoleKey) {
    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/user_service_tokens?user_id=eq.${userId}&service_name=eq.gmail&select=token_data,updated_at`,
      {
        headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` },
        cache: 'no-store',
      }
    );
    const rows = await dbRes.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      dbTokenData = row.token_data || {};
      dbUpdatedAt = row.updated_at || '';
      restAccessToken = (dbTokenData as Record<string, string>).access_token || '';
      restRefreshToken = (dbTokenData as Record<string, string>).refresh_token || '';
    }
  }

  const dbInfo = {
    updated_at: dbUpdatedAt,
    scope: (dbTokenData as Record<string, string>)?.scope || '(なし)',
    has_drive_readonly: String((dbTokenData as Record<string, string>)?.scope || '').includes('drive.readonly'),
    access_token_prefix: restAccessToken ? restAccessToken.substring(0, 20) + '...' : '(なし)',
    expiry: (dbTokenData as Record<string, string>)?.expiry || '(なし)',
  };

  // ========================================
  // Step 2: REST直接トークンが期限切れなら手動リフレッシュ
  // ========================================
  let usedAccessToken = restAccessToken;
  let tokenSource = 'db_direct';

  if (restAccessToken) {
    // tokeninfoで有効性チェック
    try {
      const checkRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${restAccessToken}`);
      if (!checkRes.ok && restRefreshToken && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        // 期限切れ → リフレッシュ
        tokenSource = 'db_direct_refreshed';
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: restRefreshToken,
            grant_type: 'refresh_token',
          }),
        });
        if (refreshRes.ok) {
          const newToken = await refreshRes.json();
          usedAccessToken = newToken.access_token;

          // DBも更新（scope保持）
          if (supabaseUrl && serviceRoleKey && dbTokenData) {
            const updatedTokenData = {
              ...dbTokenData,
              access_token: newToken.access_token,
              expiry: newToken.expires_in
                ? new Date(Date.now() + newToken.expires_in * 1000).toISOString()
                : (dbTokenData as Record<string, string>).expiry,
            };
            await fetch(
              `${supabaseUrl}/rest/v1/user_service_tokens?user_id=eq.${userId}&service_name=eq.gmail`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': serviceRoleKey,
                  'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  token_data: updatedTokenData,
                  updated_at: new Date().toISOString(),
                }),
              }
            );
          }
        } else {
          tokenSource = 'db_direct_refresh_failed';
        }
      }
    } catch {
      // tokeninfoエラーは無視
    }
  }

  // ========================================
  // Step 3: getValidAccessToken() でも取得（比較用）
  // ========================================
  let gvaToken = '';
  let gvaError = '';
  try {
    const t = await getValidAccessToken(userId);
    gvaToken = t || '';
  } catch (e) {
    gvaError = String(e);
  }

  // ========================================
  // Step 4: 比較情報
  // ========================================
  const results: Record<string, unknown> = {
    fileId: FILE_ID,
    dbInfo,
    tokenSource,
    usedTokenPrefix: usedAccessToken ? usedAccessToken.substring(0, 20) + '...' : '(なし)',
    gvaTokenPrefix: gvaToken ? gvaToken.substring(0, 20) + '...' : '(なし)',
    tokensMatch: usedAccessToken && gvaToken ? usedAccessToken === gvaToken : 'N/A',
    gvaError: gvaError || undefined,
  };

  // ========================================
  // Step 5: 使用するトークンでAPI群をテスト
  // ========================================
  const accessToken = usedAccessToken || gvaToken;
  if (!accessToken) {
    return NextResponse.json({
      error: 'アクセストークン取得失敗',
      results,
    }, { status: 500 });
  }

  // Test A: tokeninfo（実際のスコープ確認）
  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
    );
    const tokenInfoBody = await tokenInfoRes.text();
    results.tokenInfo = {
      status: tokenInfoRes.status,
      ok: tokenInfoRes.ok,
      body: tokenInfoBody.substring(0, 500),
    };
  } catch (e) {
    results.tokenInfo = { error: String(e) };
  }

  // Test B: Google Docs API
  try {
    const docsRes = await fetch(`https://docs.googleapis.com/v1/documents/${FILE_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const docsBody = await docsRes.text();
    results.docsApi = {
      status: docsRes.status,
      ok: docsRes.ok,
      body: docsBody.substring(0, 300),
    };
  } catch (e) {
    results.docsApi = { error: String(e) };
  }

  // Test C: Drive API files.get
  try {
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,owners,shared&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const driveBody = await driveRes.text();
    results.driveGet = {
      status: driveRes.status,
      ok: driveRes.ok,
      body: driveBody.substring(0, 300),
    };
  } catch (e) {
    results.driveGet = { error: String(e) };
  }

  // Test D: Drive API files.export
  try {
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const exportBody = await exportRes.text();
    results.driveExport = {
      status: exportRes.status,
      ok: exportRes.ok,
      bodyLength: exportBody.length,
      bodyPreview: exportBody.substring(0, 200),
    };
  } catch (e) {
    results.driveExport = { error: String(e) };
  }

  // Test E: Drive API files.list（検索）
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchBody = await searchRes.text();
    results.driveSearch = {
      status: searchRes.status,
      ok: searchRes.ok,
      body: searchBody.substring(0, 500),
    };
  } catch (e) {
    results.driveSearch = { error: String(e) };
  }

  return NextResponse.json({ success: true, results });
}
