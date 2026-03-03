// Phase 48: ファイルアップロード完了 → DB登録API
// クライアントがGoogle Driveに直接アップロードした後、このAPIでファイルを検索しDB登録を行う
// CORS制約でクライアントがDriveレスポンスを読めない場合でも、サーバー側で検索して対応
import { NextResponse, NextRequest } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Google OAuth トークン取得ヘルパー
async function getAccessToken(userId: string): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  const { data: tokenRow } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .single();

  if (!tokenRow?.token_data) return null;
  const token = tokenRow.token_data as { access_token: string; refresh_token: string; expiry?: string };

  if (token.expiry && new Date(token.expiry) < new Date()) {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: token.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      if (res.ok) {
        const newToken = await res.json();
        await sb
          .from('user_service_tokens')
          .update({
            token_data: { ...token, access_token: newToken.access_token, expiry: newToken.expires_in ? new Date(Date.now() + newToken.expires_in * 1000).toISOString() : token.expiry },
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('service_name', 'gmail');
        return newToken.access_token;
      }
    } catch { /* fallthrough */ }
  }
  return token.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const {
      docId,
      driveFileId: providedDriveFileId,
      driveUrl: providedDriveUrl,
      orgId,
      projectId,
      projectName,
      targetFolderId,
      renamedFileName,
      originalFileName,
      mimeType,
      fileSize,
      direction,
      documentType,
      yearMonth,
      memo,
    } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: '必須パラメータが不足しています' }, { status: 400 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    let driveFileId = providedDriveFileId;
    let driveUrl = providedDriveUrl;

    // driveFileIdが提供されていない場合（CORS制約でクライアントがレスポンスを読めなかった場合）
    // サーバー側でGoogle Drive APIを使ってファイルを検索する
    if (!driveFileId && targetFolderId && renamedFileName) {
      console.log('[Drive Upload Complete] driveFileIdなし → サーバー側でファイル検索');
      const accessToken = await getAccessToken(userId);
      if (accessToken) {
        // フォルダ内のファイルをファイル名で検索
        const query = `name='${renamedFileName.replace(/'/g, "\\'")}' and '${targetFolderId}' in parents and trashed=false`;
        const params = new URLSearchParams({
          q: query,
          fields: 'files(id,name,webViewLink)',
          pageSize: '1',
        });

        try {
          const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.files && searchData.files.length > 0) {
              driveFileId = searchData.files[0].id;
              driveUrl = searchData.files[0].webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
              console.log('[Drive Upload Complete] ファイル発見:', driveFileId);
            }
          }
        } catch (err) {
          console.error('[Drive Upload Complete] ファイル検索エラー:', err);
        }
      }
    }

    if (!driveFileId) {
      return NextResponse.json({
        success: false,
        error: 'アップロードされたファイルが見つかりませんでした。もう一度お試しください。',
      }, { status: 404 });
    }

    if (!driveUrl) {
      driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`;
    }

    const finalDocId = docId || `dd_upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    // Phase 50: taskIdパラメータ対応（タスクからのファイルアップロード）
    const taskId = body.taskId || null;

    // drive_documents にレコード登録
    await sb.from('drive_documents').insert({
      id: finalDocId,
      user_id: userId,
      organization_id: orgId || null,
      project_id: projectId,
      task_id: taskId,
      drive_file_id: driveFileId,
      file_name: renamedFileName || originalFileName,
      original_file_name: originalFileName,
      mime_type: mimeType || 'application/octet-stream',
      file_size: fileSize || 0,
      direction: direction || 'submitted',
      document_type: documentType || 'その他',
      year_month: yearMonth || now.toISOString().slice(0, 7),
      drive_url: driveUrl,
      memo: memo || null,
    });

    // ビジネスイベントに記録
    const eventType = direction === 'received' ? 'document_received' : 'document_submitted';
    await sb.from('business_events').insert({
      user_id: userId,
      project_id: projectId,
      title: `${documentType || 'その他'}をアップロード: ${originalFileName}`,
      content: memo || null,
      event_type: eventType,
      ai_generated: false,
      event_date: now.toISOString(),
      source_document_id: finalDocId,
    });

    return NextResponse.json({
      success: true,
      data: {
        docId: finalDocId,
        driveFileId,
        fileName: renamedFileName || originalFileName,
        driveUrl,
        projectName: projectName || '',
        documentType: documentType || 'その他',
      },
    });
  } catch (error) {
    console.error('[Drive Upload Complete] エラー:', error);
    return NextResponse.json({ success: false, error: 'DB登録に失敗しました' }, { status: 500 });
  }
}
