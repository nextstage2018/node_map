// Phase 48: 秘書チャットからのファイルアップロードAPI
// 2段階方式: (1) サーバーでフォルダ準備+アップロードURL生成 → (2) クライアントが直接Driveにアップロード
// これによりVercelのボディサイズ制限（4.5MB）を回避
import { NextResponse, NextRequest } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import {
  isDriveConnected,
  getOrCreateOrgFolder,
  getOrCreateProjectFolder,
  ensureFinalFolder,
} from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 書類種別の定義
const DOCUMENT_TYPES = [
  '提案書', '見積書', '契約書', '請求書', '発注書',
  '納品書', '仕様書', '議事録', '報告書', '企画書', 'その他',
];

// Google OAuth トークン取得ヘルパー（driveClient.serviceの内部関数を再利用）
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

  // トークンが期限切れかチェック → リフレッシュ
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
        // DB更新
        await sb
          .from('user_service_tokens')
          .update({
            token_data: {
              ...token,
              access_token: newToken.access_token,
              expiry: newToken.expires_in
                ? new Date(Date.now() + newToken.expires_in * 1000).toISOString()
                : token.expiry,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('service_name', 'gmail');

        return newToken.access_token;
      }
    } catch {
      // リフレッシュ失敗 → 現在のトークンを返す
    }
  }

  return token.access_token;
}

// ========================================
// POST: アップロード準備（フォルダ確保 + resumable upload session URL生成）
// ファイル本体は送らない → Vercelのサイズ制限を回避
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const connected = await isDriveConnected(userId);
    if (!connected) {
      return NextResponse.json({
        success: false,
        error: 'Google Driveが接続されていません。設定画面からGmail連携を再設定してください。',
      }, { status: 400 });
    }

    const body = await request.json();
    const { projectId, documentType = 'その他', direction = 'submitted', memo = '', fileName, mimeType, fileSize } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'プロジェクトを選択してください' }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ success: false, error: 'ファイル名が必要です' }, { status: 400 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // プロジェクト情報取得
    const { data: project } = await sb
      .from('projects')
      .select('id, name, organization_id, organizations(id, name)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    const org = project.organizations as { id: string; name: string } | null;
    const orgId = project.organization_id || '';
    const orgName = org?.name || '未分類';

    // 命名規則: YYYY-MM-DD_種別_元ファイル名
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const yearMonth = now.toISOString().slice(0, 7);
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
    const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
    const renamedFileName = `${dateStr}_${documentType}_${baseName}${ext}`;

    // フォルダ準備（4階層）
    let targetFolderId: string | null = null;

    if (orgId) {
      targetFolderId = await ensureFinalFolder(
        userId, orgId, orgName, projectId, project.name,
        direction as 'received' | 'submitted', yearMonth
      );
    }
    if (!targetFolderId && orgId) {
      targetFolderId = await getOrCreateProjectFolder(userId, orgId, projectId, project.name);
    }
    if (!targetFolderId && orgId) {
      targetFolderId = await getOrCreateOrgFolder(userId, orgId, orgName);
    }

    if (!targetFolderId) {
      return NextResponse.json({
        success: false,
        error: 'Driveフォルダの作成に失敗しました。組織がプロジェクトに紐づいているか確認してください。',
      }, { status: 500 });
    }

    // Google Drive Resumable Upload Session を開始
    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Googleトークンの取得に失敗しました' }, { status: 500 });
    }

    const metadata = {
      name: renamedFileName,
      parents: [targetFolderId],
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType || 'application/octet-stream',
          ...(fileSize ? { 'X-Upload-Content-Length': String(fileSize) } : {}),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      console.error('[Drive Upload] Resumable session作成失敗:', initRes.status, errText);
      return NextResponse.json({ success: false, error: 'Driveアップロードセッションの作成に失敗しました' }, { status: 500 });
    }

    // resumable upload URL を取得
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      return NextResponse.json({ success: false, error: 'アップロードURLの取得に失敗しました' }, { status: 500 });
    }

    // DB登録用の情報をセッションとして返す
    const docId = `dd_upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,        // クライアントがここにPUTでファイルを送る
        accessToken,      // クライアントがDrive APIに直接アクセスするためのトークン
        renamedFileName,
        docId,
        // complete API用のメタデータ
        metadata: {
          docId,
          userId,
          orgId,
          projectId,
          projectName: project.name,
          targetFolderId,
          renamedFileName,
          originalFileName: fileName,
          mimeType: mimeType || 'application/octet-stream',
          fileSize: fileSize || 0,
          direction,
          documentType,
          yearMonth,
          memo,
        },
      },
    });
  } catch (error) {
    console.error('[Drive Upload] エラー:', error);
    return NextResponse.json({ success: false, error: 'アップロード準備に失敗しました' }, { status: 500 });
  }
}

// ========================================
// GET: プロジェクト一覧取得（アップロードフォーム用）
// ========================================
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: true, data: { projects: [], documentTypes: DOCUMENT_TYPES } });
    }

    const { data: projects } = await sb
      .from('projects')
      .select('id, name, organization_id, organizations(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('name');

    return NextResponse.json({
      success: true,
      data: {
        projects: (projects || []).map(p => ({
          id: p.id,
          name: p.name,
          organizationId: p.organization_id,
          organizationName: (p.organizations as { name: string } | null)?.name || null,
        })),
        documentTypes: DOCUMENT_TYPES,
      },
    });
  } catch (error) {
    console.error('[Drive Upload] GET エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
