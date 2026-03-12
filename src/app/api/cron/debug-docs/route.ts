// Docs API / Drive API アクセス診断エンドポイント
// 特定のファイルIDに対して各種APIでアクセスを試行し、結果を返す
import { NextRequest, NextResponse } from 'next/server';
import { getValidAccessToken } from '@/services/calendar/calendarClient.service';

export const dynamic = 'force-dynamic';

const FILE_ID = '1mK9siR1alG7bTY0e81c-bQw34iR5_E_RZlye7CwC3Ac';

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

  // 1. DB からトークン情報を読み取り
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbTokenInfo: Record<string, unknown> = {};

  if (supabaseUrl && serviceRoleKey) {
    const dbRes = await fetch(
      `${supabaseUrl}/rest/v1/user_service_tokens?user_id=eq.${userId}&service_name=eq.gmail&select=token_data,updated_at`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    const rows = await dbRes.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      const td = row.token_data || {};
      dbTokenInfo = {
        updated_at: row.updated_at,
        scope: td.scope || '(なし)',
        has_drive_readonly: String(td.scope || '').includes('drive.readonly'),
        access_token_prefix: td.access_token ? td.access_token.substring(0, 20) + '...' : '(なし)',
        expiry: td.expiry || '(なし)',
      };
    }
  }

  // 2. getValidAccessToken() でアクセストークン取得
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({
      error: 'アクセストークン取得失敗',
      dbTokenInfo,
    }, { status: 500 });
  }

  const tokenPrefix = accessToken.substring(0, 20) + '...';

  // 3. 各APIをテスト
  const results: Record<string, unknown> = {
    fileId: FILE_ID,
    dbTokenInfo,
    usedTokenPrefix: tokenPrefix,
    tokenMatchesDb: tokenPrefix === dbTokenInfo.access_token_prefix,
  };

  // Test A: Google Docs API
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

  // Test B: Drive API files.get (通常)
  try {
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,owners,shared`,
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

  // Test C: Drive API files.get (supportsAllDrives=true)
  try {
    const driveRes2 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const driveBody2 = await driveRes2.text();
    results.driveGetAllDrives = {
      status: driveRes2.status,
      ok: driveRes2.ok,
      body: driveBody2.substring(0, 300),
    };
  } catch (e) {
    results.driveGetAllDrives = { error: String(e) };
  }

  // Test D: Drive API files.list (ファイル名検索)
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name contains 'Gemini' and mimeType='application/vnd.google-apps.document'&fields=files(id,name,owners)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
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

  // Test E: Drive API files.export
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

  // Test F: tokeninfo（トークンの実際のスコープを確認）
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

  return NextResponse.json({ success: true, results });
}
