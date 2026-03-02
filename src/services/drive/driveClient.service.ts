// Google Drive サービス
// フォルダ管理・ファイルアップロード・共有リンク生成
// Gmailと同じOAuthトークンを再利用（user_service_tokens service_name='gmail'）

import { createServerClient } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// ========================================
// 型定義
// ========================================
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
}

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink: string;
}

export interface ShareLink {
  fileId: string;
  webViewLink: string;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry: string | null;
  email?: string;
  scope?: string;
}

// ========================================
// トークン管理（calendarClient.service.ts と同じパターン）
// ========================================
async function getGoogleToken(userId: string): Promise<TokenData | null> {
  const sb = createServerClient();
  if (!sb) return null;

  const { data } = await sb
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .single();

  if (!data?.token_data) return null;
  return data.token_data as TokenData;
}

async function refreshTokenIfNeeded(userId: string, token: TokenData): Promise<string> {
  if (token.expiry) {
    const expiry = new Date(token.expiry);
    const now = new Date();
    if (expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
      return token.access_token;
    }
  }

  if (!token.refresh_token || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return token.access_token;
  }

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

    if (!res.ok) {
      console.error('[Drive] トークンリフレッシュ失敗');
      return token.access_token;
    }

    const newToken = await res.json();

    const sb = createServerClient();
    if (sb) {
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
    }

    return newToken.access_token;
  } catch (error) {
    console.error('[Drive] トークンリフレッシュエラー:', error);
    return token.access_token;
  }
}

// ========================================
// API呼び出しヘルパー
// ========================================
async function driveFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const token = await getGoogleToken(userId);
  if (!token) {
    console.warn('[Drive] Google トークン未設定（userId:', userId, '）');
    return null;
  }

  const accessToken = await refreshTokenIfNeeded(userId, token);

  return fetch(`${DRIVE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// ========================================
// Drive接続チェック
// ========================================
export async function isDriveConnected(userId: string): Promise<boolean> {
  const token = await getGoogleToken(userId);
  if (!token) return false;
  // scopeにdrive.fileが含まれるかチェック
  if (token.scope && !token.scope.includes('drive')) return false;
  return true;
}

// ========================================
// フォルダ操作
// ========================================

// フォルダ作成
export async function createFolder(
  userId: string,
  folderName: string,
  parentFolderId?: string
): Promise<DriveFolder | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      body.parents = [parentFolderId];
    }

    const res = await driveFetch(userId, '/files', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res || !res.ok) {
      console.error('[Drive] フォルダ作成失敗:', res?.status);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name || folderName,
      webViewLink: `https://drive.google.com/drive/folders/${data.id}`,
    };
  } catch (error) {
    console.error('[Drive] フォルダ作成エラー:', error);
    return null;
  }
}

// 組織フォルダ取得 or 作成
export async function getOrCreateOrgFolder(
  userId: string,
  orgId: string,
  orgName: string
): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // DBから既存マッピング検索
  const { data: existing } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('hierarchy_level', 1)
    .single();

  if (existing?.drive_folder_id) {
    return existing.drive_folder_id;
  }

  // Driveにフォルダ作成
  const folder = await createFolder(userId, `[NodeMap] ${orgName}`);
  if (!folder) return null;

  // DBに記録
  await sb.from('drive_folders').insert({
    user_id: userId,
    organization_id: orgId,
    drive_folder_id: folder.id,
    folder_name: folder.name,
    hierarchy_level: 1,
  });

  return folder.id;
}

// プロジェクトフォルダ取得 or 作成
export async function getOrCreateProjectFolder(
  userId: string,
  orgId: string,
  projectId: string,
  projectName: string
): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // DBから既存マッピング検索
  const { data: existing } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('hierarchy_level', 2)
    .single();

  if (existing?.drive_folder_id) {
    return existing.drive_folder_id;
  }

  // 親の組織フォルダを取得
  const { data: orgFolder } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('hierarchy_level', 1)
    .single();

  const parentFolderId = orgFolder?.drive_folder_id || undefined;

  // Driveにフォルダ作成
  const folder = await createFolder(userId, projectName, parentFolderId);
  if (!folder) return null;

  // DBに記録
  await sb.from('drive_folders').insert({
    user_id: userId,
    organization_id: orgId,
    project_id: projectId,
    drive_folder_id: folder.id,
    folder_name: folder.name,
    parent_drive_folder_id: parentFolderId || null,
    hierarchy_level: 2,
  });

  return folder.id;
}

// ========================================
// ファイル操作
// ========================================

// ファイルアップロード（multipart）
export async function uploadFile(
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  parentFolderId: string
): Promise<DriveFile | null> {
  try {
    const token = await getGoogleToken(userId);
    if (!token) return null;
    const accessToken = await refreshTokenIfNeeded(userId, token);

    const metadata = JSON.stringify({
      name: fileName,
      parents: [parentFolderId],
    });

    const boundary = 'nodemap_boundary_' + Date.now();
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        metadata + '\r\n' +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Drive] ファイルアップロード失敗:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name || fileName,
      mimeType: data.mimeType || mimeType,
      size: parseInt(data.size || '0', 10),
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
      createdTime: data.createdTime || new Date().toISOString(),
      modifiedTime: data.modifiedTime || new Date().toISOString(),
      parents: [parentFolderId],
    };
  } catch (error) {
    console.error('[Drive] ファイルアップロードエラー:', error);
    return null;
  }
}

// ファイル一覧取得
export async function listFiles(
  userId: string,
  folderId: string,
  limit = 50
): Promise<DriveFile[]> {
  try {
    const query = `'${folderId}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime)',
      pageSize: String(limit),
      orderBy: 'createdTime desc',
    });

    const res = await driveFetch(userId, `/files?${params}`);
    if (!res || !res.ok) {
      console.error('[Drive] ファイル一覧取得失敗:', res?.status);
      return [];
    }

    const data = await res.json();
    return (data.files || []).map((f: Record<string, unknown>) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType as string,
      size: parseInt((f.size as string) || '0', 10),
      webViewLink: (f.webViewLink as string) || `https://drive.google.com/file/d/${f.id}/view`,
      createdTime: f.createdTime as string,
      modifiedTime: f.modifiedTime as string,
    }));
  } catch (error) {
    console.error('[Drive] ファイル一覧エラー:', error);
    return [];
  }
}

// ファイル検索
export async function searchFiles(
  userId: string,
  searchQuery: string,
  limit = 20
): Promise<DriveFile[]> {
  try {
    const query = `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime)',
      pageSize: String(limit),
      orderBy: 'modifiedTime desc',
    });

    const res = await driveFetch(userId, `/files?${params}`);
    if (!res || !res.ok) {
      console.error('[Drive] ファイル検索失敗:', res?.status);
      return [];
    }

    const data = await res.json();
    return (data.files || []).map((f: Record<string, unknown>) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType as string,
      size: parseInt((f.size as string) || '0', 10),
      webViewLink: (f.webViewLink as string) || `https://drive.google.com/file/d/${f.id}/view`,
      createdTime: f.createdTime as string,
      modifiedTime: f.modifiedTime as string,
    }));
  } catch (error) {
    console.error('[Drive] ファイル検索エラー:', error);
    return [];
  }
}

// ファイル詳細取得
export async function getFile(
  userId: string,
  fileId: string
): Promise<DriveFile | null> {
  try {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents',
    });

    const res = await driveFetch(userId, `/files/${fileId}?${params}`);
    if (!res || !res.ok) {
      console.error('[Drive] ファイル詳細取得失敗:', res?.status);
      return null;
    }

    const f = await res.json();
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: parseInt(f.size || '0', 10),
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      parents: f.parents,
    };
  } catch (error) {
    console.error('[Drive] ファイル詳細エラー:', error);
    return null;
  }
}

// ファイル削除
export async function deleteFile(
  userId: string,
  fileId: string
): Promise<boolean> {
  try {
    const res = await driveFetch(userId, `/files/${fileId}`, {
      method: 'DELETE',
    });
    if (!res || !res.ok) {
      console.error('[Drive] ファイル削除失敗:', res?.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Drive] ファイル削除エラー:', error);
    return false;
  }
}

// ========================================
// 共有操作
// ========================================

// 共有リンク生成（anyone with link）
export async function createShareLink(
  userId: string,
  fileId: string,
  role: 'reader' | 'commenter' | 'writer' = 'reader'
): Promise<ShareLink | null> {
  try {
    // パーミッション追加
    const permRes = await driveFetch(userId, `/files/${fileId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'anyone',
        role,
      }),
    });

    if (!permRes || !permRes.ok) {
      console.error('[Drive] 共有リンク作成失敗:', permRes?.status);
      return null;
    }

    // ファイル情報を再取得してwebViewLinkを得る
    const file = await getFile(userId, fileId);
    if (!file) return null;

    return {
      fileId,
      webViewLink: file.webViewLink,
    };
  } catch (error) {
    console.error('[Drive] 共有リンクエラー:', error);
    return null;
  }
}

// メールアドレスで共有
export async function shareWithEmail(
  userId: string,
  fileId: string,
  email: string,
  role: 'reader' | 'commenter' | 'writer' = 'reader'
): Promise<boolean> {
  try {
    const res = await driveFetch(userId, `/files/${fileId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'user',
        role,
        emailAddress: email,
      }),
    });

    if (!res || !res.ok) {
      console.error('[Drive] メール共有失敗:', res?.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Drive] メール共有エラー:', error);
    return false;
  }
}

// ========================================
// ファイルダウンロード（添付取込用）
// ========================================

// Gmail添付ファイルダウンロード
export async function downloadGmailAttachment(
  userId: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: Buffer; mimeType: string; fileName: string } | null> {
  try {
    const token = await getGoogleToken(userId);
    if (!token) return null;
    const accessToken = await refreshTokenIfNeeded(userId, token);

    const res = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      console.error('[Drive] Gmail添付取得失敗:', res.status);
      return null;
    }

    const json = await res.json();
    // Gmail APIはBase64url形式でデータを返す
    const base64Data = json.data.replace(/-/g, '+').replace(/_/g, '/');
    const buffer = Buffer.from(base64Data, 'base64');

    return {
      data: buffer,
      mimeType: '', // 呼び出し元で設定
      fileName: '', // 呼び出し元で設定
    };
  } catch (error) {
    console.error('[Drive] Gmail添付ダウンロードエラー:', error);
    return null;
  }
}

// Gmailメッセージから添付一覧取得
export async function getGmailAttachments(
  userId: string,
  messageId: string
): Promise<{ attachmentId: string; fileName: string; mimeType: string; size: number }[]> {
  try {
    const token = await getGoogleToken(userId);
    if (!token) return [];
    const accessToken = await refreshTokenIfNeeded(userId, token);

    const res = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) return [];

    const msg = await res.json();
    const attachments: { attachmentId: string; fileName: string; mimeType: string; size: number }[] = [];

    // パートを再帰的に検索
    function findAttachments(parts: Record<string, unknown>[] | undefined) {
      if (!parts) return;
      for (const part of parts) {
        const body = part.body as Record<string, unknown> | undefined;
        if (body?.attachmentId && part.filename) {
          attachments.push({
            attachmentId: body.attachmentId as string,
            fileName: part.filename as string,
            mimeType: (part.mimeType as string) || 'application/octet-stream',
            size: (body.size as number) || 0,
          });
        }
        if (part.parts) {
          findAttachments(part.parts as Record<string, unknown>[]);
        }
      }
    }

    const payload = msg.payload;
    if (payload?.parts) {
      findAttachments(payload.parts);
    } else if (payload?.body?.attachmentId && payload?.filename) {
      attachments.push({
        attachmentId: payload.body.attachmentId,
        fileName: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
      });
    }

    return attachments;
  } catch (error) {
    console.error('[Drive] Gmail添付一覧エラー:', error);
    return [];
  }
}

// ========================================
// DB操作ヘルパー
// ========================================

// ドキュメントをDBに記録
export async function recordDocument(params: {
  userId: string;
  organizationId?: string;
  projectId?: string;
  driveFileId: string;
  driveFolderId?: string;
  fileName: string;
  fileSizeBytes?: number;
  mimeType?: string;
  driveUrl?: string;
  sourceChannel?: string;
  sourceMessageId?: string;
}): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from('drive_documents')
    .insert({
      user_id: params.userId,
      organization_id: params.organizationId || null,
      project_id: params.projectId || null,
      drive_file_id: params.driveFileId,
      drive_folder_id: params.driveFolderId || null,
      file_name: params.fileName,
      file_size_bytes: params.fileSizeBytes || null,
      mime_type: params.mimeType || null,
      drive_url: params.driveUrl || `https://drive.google.com/file/d/${params.driveFileId}/view`,
      source_channel: params.sourceChannel || null,
      source_message_id: params.sourceMessageId || null,
      synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Drive] ドキュメント記録エラー:', error);
    return null;
  }

  return data?.id || null;
}

// ドキュメント一覧取得（DB）
export async function getDocuments(params: {
  userId: string;
  organizationId?: string;
  projectId?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const sb = createServerClient();
  if (!sb) return [];

  let query = sb
    .from('drive_documents')
    .select('*')
    .eq('user_id', params.userId)
    .order('uploaded_at', { ascending: false })
    .limit(params.limit || 50);

  if (params.organizationId) {
    query = query.eq('organization_id', params.organizationId);
  }
  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[Drive] ドキュメント一覧取得エラー:', error);
    return [];
  }

  return data || [];
}

// フォルダ一覧取得（DB）
export async function getFolders(userId: string): Promise<Record<string, unknown>[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from('drive_folders')
    .select('*, organizations(name), projects(name)')
    .eq('user_id', userId)
    .order('hierarchy_level')
    .order('folder_name');

  if (error) {
    console.error('[Drive] フォルダ一覧取得エラー:', error);
    return [];
  }

  return data || [];
}

// ドキュメントのコンテキスト要約（秘書AI用）
export function formatDocumentsForContext(
  docs: Record<string, unknown>[],
  maxDocs = 10
): string {
  if (docs.length === 0) return 'ドキュメントなし';

  return docs.slice(0, maxDocs).map((d) => {
    const name = d.file_name as string;
    const size = d.file_size_bytes as number;
    const sizeStr = size ? `${(size / 1024).toFixed(0)}KB` : '不明';
    const date = d.uploaded_at ? new Date(d.uploaded_at as string).toLocaleDateString('ja-JP') : '';
    const channel = d.source_channel ? `[${d.source_channel}]` : '';
    return `- ${name}（${sizeStr}）${channel} ${date}`;
  }).join('\n');
}
