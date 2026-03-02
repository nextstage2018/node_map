// Google Drive サービス
// フォルダ管理・ファイルアップロード・共有リンク生成
// Gmailと同じOAuthトークンを再利用（user_service_tokens service_name='gmail'）

import { createServerClient } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Google Drive 親フォルダID（全NodeMapフォルダをこの配下に作成）
const DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';

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
  const scope = token.scope || '';
  if (!scope.includes('drive.file')) {
    console.log('[Drive] Driveスコープなし。Gmail再連携が必要です。scope:', scope);
    return false;
  }
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

  // Driveにフォルダ作成（親フォルダが設定されていればその配下に）
  const folder = await createFolder(userId, `[NodeMap] ${orgName}`, DRIVE_ROOT_FOLDER_ID || undefined);
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
  // Phase 44a 拡張
  direction?: string;
  documentType?: string;
  yearMonth?: string;
  originalFileName?: string;
}): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
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
  };

  // Phase 44a 拡張カラム
  if (params.direction) insertData.direction = params.direction;
  if (params.documentType) insertData.document_type = params.documentType;
  if (params.yearMonth) insertData.year_month = params.yearMonth;
  if (params.originalFileName) insertData.original_file_name = params.originalFileName;

  const { data, error } = await sb
    .from('drive_documents')
    .insert(insertData)
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
    const dir = d.direction === 'submitted' ? '[提出]' : '[受領]';
    const docType = d.document_type ? `(${d.document_type})` : '';
    return `- ${dir}${docType} ${name}（${sizeStr}）${channel} ${date}`;
  }).join('\n');
}

// ========================================
// Phase 44a: 4階層フォルダ管理（組織/プロジェクト/方向/年月）
// ========================================

const DIRECTION_LABELS: Record<string, string> = {
  received: '受領',
  submitted: '提出',
};

// 方向フォルダ（受領/提出）取得 or 作成
export async function getOrCreateDirectionFolder(
  userId: string,
  orgId: string,
  projectId: string,
  direction: 'received' | 'submitted'
): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // DBから既存マッピング検索
  const { data: existing } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('direction', direction)
    .eq('hierarchy_level', 3)
    .single();

  if (existing?.drive_folder_id) {
    return existing.drive_folder_id;
  }

  // 親のプロジェクトフォルダを取得
  const { data: projFolder } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('hierarchy_level', 2)
    .single();

  const parentFolderId = projFolder?.drive_folder_id || undefined;
  if (!parentFolderId) {
    console.error('[Drive] プロジェクトフォルダが見つかりません:', projectId);
    return null;
  }

  // Driveにフォルダ作成
  const folderName = DIRECTION_LABELS[direction] || direction;
  const folder = await createFolder(userId, folderName, parentFolderId);
  if (!folder) return null;

  // DBに記録
  await sb.from('drive_folders').insert({
    user_id: userId,
    organization_id: orgId,
    project_id: projectId,
    drive_folder_id: folder.id,
    folder_name: folder.name,
    parent_drive_folder_id: parentFolderId,
    hierarchy_level: 3,
    direction,
  });

  return folder.id;
}

// 年月フォルダ取得 or 作成
export async function getOrCreateMonthFolder(
  userId: string,
  orgId: string,
  projectId: string,
  direction: 'received' | 'submitted',
  yearMonth: string // 'YYYY-MM'
): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // DBから既存マッピング検索
  const { data: existing } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('direction', direction)
    .eq('year_month', yearMonth)
    .eq('hierarchy_level', 4)
    .single();

  if (existing?.drive_folder_id) {
    return existing.drive_folder_id;
  }

  // 親の方向フォルダを取得 or 作成
  const dirFolderId = await getOrCreateDirectionFolder(userId, orgId, projectId, direction);
  if (!dirFolderId) return null;

  // Driveにフォルダ作成
  const folder = await createFolder(userId, yearMonth, dirFolderId);
  if (!folder) return null;

  // DBに記録
  await sb.from('drive_folders').insert({
    user_id: userId,
    organization_id: orgId,
    project_id: projectId,
    drive_folder_id: folder.id,
    folder_name: folder.name,
    parent_drive_folder_id: dirFolderId,
    hierarchy_level: 4,
    direction,
    year_month: yearMonth,
  });

  return folder.id;
}

// 最終フォルダまで一括作成（4階層すべて）
export async function ensureFinalFolder(
  userId: string,
  orgId: string,
  orgName: string,
  projectId: string,
  projectName: string,
  direction: 'received' | 'submitted',
  yearMonth: string
): Promise<string | null> {
  // Level 1: 組織
  const orgFolderId = await getOrCreateOrgFolder(userId, orgId, orgName);
  if (!orgFolderId) return null;

  // Level 2: プロジェクト
  const projFolderId = await getOrCreateProjectFolder(userId, orgId, projectId, projectName);
  if (!projFolderId) return null;

  // Level 3+4: 方向 + 年月
  const monthFolderId = await getOrCreateMonthFolder(userId, orgId, projectId, direction, yearMonth);
  return monthFolderId;
}

// ファイル移動（一時フォルダ → 最終フォルダ）+ リネーム
export async function moveAndRenameFile(
  userId: string,
  fileId: string,
  newParentFolderId: string,
  newFileName: string
): Promise<DriveFile | null> {
  try {
    // 1. 現在の親フォルダを取得
    const currentFile = await getFile(userId, fileId);
    if (!currentFile) return null;

    const oldParent = currentFile.parents?.[0] || '';

    // 2. 移動 + リネーム（PATCH）
    const res = await driveFetch(
      userId,
      `/files/${fileId}?addParents=${newParentFolderId}&removeParents=${oldParent}&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name: newFileName }),
      }
    );

    if (!res || !res.ok) {
      console.error('[Drive] ファイル移動失敗:', res?.status);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: parseInt(data.size || '0', 10),
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
      createdTime: data.createdTime,
      modifiedTime: data.modifiedTime,
      parents: data.parents,
    };
  } catch (error) {
    console.error('[Drive] ファイル移動エラー:', error);
    return null;
  }
}

// 一時保管フォルダ取得 or 作成
export async function getOrCreateTempFolder(userId: string): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  // 特殊なキー: organization_id=NULL, hierarchy_level=1, folder_name='[NodeMap] 一時保管'
  const { data: existing } = await sb
    .from('drive_folders')
    .select('drive_folder_id')
    .eq('user_id', userId)
    .eq('folder_name', '[NodeMap] 一時保管')
    .single();

  if (existing?.drive_folder_id) {
    return existing.drive_folder_id;
  }

  // Driveにフォルダ作成（親フォルダが設定されていればその配下に）
  const folder = await createFolder(userId, '[NodeMap] 一時保管', DRIVE_ROOT_FOLDER_ID || undefined);
  if (!folder) return null;

  // DBに記録（hierarchy_level=1だがorganization_idはNULL → CHECK制約回避のためlevel=0を使わない）
  // 一時保管フォルダはdrive_foldersには記録せず、IDをユーザー設定で管理するか
  // 実装の簡略化: drive_foldersに入れず、ID直接管理
  // → ここではDBに入れずキャッシュのみ
  return folder.id;
}

// ========================================
// Phase 44a: ステージングCRUD
// ========================================

// ステージングファイル登録
export async function saveStagingFile(params: {
  userId: string;
  sourceMessageId?: string;
  sourceType: string;
  sourceFromName?: string;
  sourceFromAddress?: string;
  sourceSubject?: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
  tempDriveFileId?: string;
  organizationId?: string;
  organizationName?: string;
  projectId?: string;
  projectName?: string;
  aiDocumentType?: string;
  aiDirection?: string;
  aiYearMonth?: string;
  aiSuggestedName?: string;
  aiConfidence?: number;
  aiReasoning?: string;
  sourceChannel?: string;
}): Promise<string | null> {
  const sb = createServerClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from('drive_file_staging')
    .insert({
      user_id: params.userId,
      source_message_id: params.sourceMessageId || null,
      source_type: params.sourceType,
      source_from_name: params.sourceFromName || null,
      source_from_address: params.sourceFromAddress || null,
      source_subject: params.sourceSubject || null,
      file_name: params.fileName,
      mime_type: params.mimeType || null,
      file_size_bytes: params.fileSizeBytes || null,
      temp_drive_file_id: params.tempDriveFileId || null,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      project_id: params.projectId || null,
      project_name: params.projectName || null,
      ai_document_type: params.aiDocumentType || null,
      ai_direction: params.aiDirection || 'received',
      ai_year_month: params.aiYearMonth || null,
      ai_suggested_name: params.aiSuggestedName || null,
      ai_confidence: params.aiConfidence || 0,
      ai_reasoning: params.aiReasoning || null,
      source_channel: params.sourceChannel || 'email',
      status: 'pending_review',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Drive] ステージング登録エラー:', error);
    return null;
  }

  return data?.id || null;
}

// 未確認ステージングファイル一覧取得
export async function getPendingStagingFiles(userId: string): Promise<Record<string, unknown>[]> {
  const sb = createServerClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from('drive_file_staging')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Drive] ステージング一覧取得エラー:', error);
    return [];
  }

  return data || [];
}

// ステージングファイル承認 → 最終フォルダにアップロード
export async function approveStagingFile(params: {
  stagingId: string;
  userId: string;
  documentType: string;
  direction: 'received' | 'submitted';
  yearMonth: string;
  fileName?: string; // ユーザーが編集したファイル名
}): Promise<{ success: boolean; driveUrl?: string; error?: string }> {
  const sb = createServerClient();
  if (!sb) return { success: false, error: 'DB未設定' };

  // 1. ステージングレコード取得
  const { data: staging } = await sb
    .from('drive_file_staging')
    .select('*')
    .eq('id', params.stagingId)
    .eq('user_id', params.userId)
    .single();

  if (!staging) {
    return { success: false, error: 'ステージングファイルが見つかりません' };
  }

  if (!staging.organization_id || !staging.project_id) {
    return { success: false, error: '組織/プロジェクトが未設定です' };
  }

  if (!staging.temp_drive_file_id) {
    return { success: false, error: '一時ファイルが見つかりません' };
  }

  // 2. 最終フォルダ作成（4階層）
  const finalFolderId = await ensureFinalFolder(
    params.userId,
    staging.organization_id,
    staging.organization_name || '不明',
    staging.project_id,
    staging.project_name || '不明',
    params.direction,
    params.yearMonth
  );

  if (!finalFolderId) {
    return { success: false, error: '最終フォルダの作成に失敗しました' };
  }

  // 3. リネーム候補（ユーザー指定 or AI推奨 or デフォルト）
  const ext = staging.file_name.includes('.')
    ? '.' + staging.file_name.split('.').pop()
    : '';
  const baseName = staging.file_name.replace(/\.[^.]+$/, '');
  const finalFileName = params.fileName
    || staging.ai_suggested_name
    || `${params.yearMonth.replace('-', '')}_${params.documentType}_${baseName}${ext}`;

  // 4. ファイル移動 + リネーム
  const movedFile = await moveAndRenameFile(
    params.userId,
    staging.temp_drive_file_id,
    finalFolderId,
    finalFileName
  );

  if (!movedFile) {
    return { success: false, error: 'ファイルの移動に失敗しました' };
  }

  // 5. drive_documents にレコード追加
  await recordDocument({
    userId: params.userId,
    organizationId: staging.organization_id,
    projectId: staging.project_id,
    driveFileId: movedFile.id,
    driveFolderId: finalFolderId,
    fileName: movedFile.name,
    fileSizeBytes: movedFile.size,
    mimeType: movedFile.mimeType,
    driveUrl: movedFile.webViewLink,
    sourceChannel: staging.source_type.replace('received_', '').replace('submitted_', '') as 'email' | 'slack' | 'chatwork' | undefined,
    sourceMessageId: staging.source_message_id || undefined,
    direction: params.direction,
    documentType: params.documentType,
    yearMonth: params.yearMonth,
    originalFileName: staging.file_name,
  });

  // 6. ステージングレコード更新
  await sb
    .from('drive_file_staging')
    .update({
      status: 'uploaded',
      confirmed_document_type: params.documentType,
      confirmed_direction: params.direction,
      confirmed_year_month: params.yearMonth,
      confirmed_file_name: movedFile.name,
      final_drive_file_id: movedFile.id,
      final_drive_folder_id: finalFolderId,
      final_drive_url: movedFile.webViewLink,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.stagingId);

  return { success: true, driveUrl: movedFile.webViewLink };
}

// ステージングファイル却下
export async function rejectStagingFile(
  stagingId: string,
  userId: string
): Promise<boolean> {
  const sb = createServerClient();
  if (!sb) return false;

  // ステージングレコード取得
  const { data: staging } = await sb
    .from('drive_file_staging')
    .select('temp_drive_file_id')
    .eq('id', stagingId)
    .eq('user_id', userId)
    .single();

  // 一時Driveファイル削除
  if (staging?.temp_drive_file_id) {
    await deleteFile(userId, staging.temp_drive_file_id);
  }

  // ステータス更新
  const { error } = await sb
    .from('drive_file_staging')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagingId)
    .eq('user_id', userId);

  return !error;
}

// ステージングの要約（秘書AI用）
export function formatStagingForContext(
  files: Record<string, unknown>[],
  maxFiles = 10
): string {
  if (files.length === 0) return '確認待ちファイルなし';

  return files.slice(0, maxFiles).map((f) => {
    const name = f.file_name as string;
    const docType = f.ai_document_type ? `(${f.ai_document_type})` : '';
    const dir = f.ai_direction === 'submitted' ? '[提出]' : '[受領]';
    const from = f.source_from_name ? `← ${f.source_from_name}` : '';
    const conf = f.ai_confidence ? ` 確度${Math.round((f.ai_confidence as number) * 100)}%` : '';
    return `- ${dir}${docType} ${name} ${from}${conf}`;
  }).join('\n');
}

// ========================================
// Phase 45a: URL抽出 + マルチチャネル対応
// ========================================

export interface ExtractedUrl {
  url: string;
  documentId: string;
  linkType: 'sheet' | 'doc' | 'drive';
  title?: string;
}

/**
 * テキストからGoogle Docs/Sheets/Drive URLを抽出
 */
export function extractUrlsFromText(text: string): ExtractedUrl[] {
  if (!text) return [];
  const results: ExtractedUrl[] = [];
  const seen = new Set<string>();

  // Google Sheets
  const sheetRegex = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)[^\s)>]*/g;
  let match;
  while ((match = sheetRegex.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ url: match[0], documentId: match[1], linkType: 'sheet' });
    }
  }

  // Google Docs
  const docRegex = /https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)[^\s)>]*/g;
  while ((match = docRegex.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ url: match[0], documentId: match[1], linkType: 'doc' });
    }
  }

  // Google Drive file
  const driveRegex = /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s)>]*/g;
  while ((match = driveRegex.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ url: match[0], documentId: match[1], linkType: 'drive' });
    }
  }

  // Google Drive open
  const driveOpenRegex = /https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/g;
  while ((match = driveOpenRegex.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ url: match[0], documentId: match[1], linkType: 'drive' });
    }
  }

  return results;
}

/**
 * URLリンクをdrive_documentsに記録
 */
export async function recordDocumentLink(params: {
  userId: string;
  url: string;
  linkType: 'sheet' | 'doc' | 'drive';
  documentId: string;
  title?: string;
  organizationId?: string;
  projectId?: string;
  sourceMessageId?: string;
  sourceChannel?: string;
  fromName?: string;
  direction?: string;
  documentType?: string;
  yearMonth?: string;
}): Promise<string | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  // 重複チェック（同じlink_urlが既に登録されていないか）
  const { data: existing } = await supabase
    .from('drive_documents')
    .select('id')
    .eq('link_url', params.url)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('[DriveService] URL既に記録済み:', params.url);
    return existing[0];
  }

  // ファイル名をURLから推定（titleがあれば使用）
  const linkTypeNames = { sheet: 'スプレッドシート', doc: 'ドキュメント', drive: 'ファイル' };
  const fileName = params.title || `[${linkTypeNames[params.linkType]}] ${params.documentId.slice(0, 12)}...`;

  const { data, error } = await supabase
    .from('drive_documents')
    .insert({
      user_id: params.userId,
      file_name: fileName,
      drive_file_id: params.documentId,
      drive_url: params.url,
      mime_type: params.linkType === 'sheet' ? 'application/vnd.google-apps.spreadsheet'
        : params.linkType === 'doc' ? 'application/vnd.google-apps.document'
        : 'application/octet-stream',
      link_type: params.linkType,
      link_url: params.url,
      organization_id: params.organizationId || null,
      project_id: params.projectId || null,
      source_message_id: params.sourceMessageId || null,
      source_channel: params.sourceChannel || null,
      direction: params.direction === 'sent' ? 'submitted'
        : params.direction === 'submitted' ? 'submitted'
        : params.direction === 'received' ? 'received'
        : 'received',
      document_type: params.documentType || null,
      year_month: params.yearMonth || new Date().toISOString().slice(0, 7),
      uploaded_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[DriveService] URLリンク記録エラー:', error);
    return null;
  }

  console.log('[DriveService] URLリンク記録完了:', params.url, '→', data?.id);
  return data?.id || null;
}

/**
 * project_channelsテーブルからSlack/Chatworkのチャネル情報で組織/プロジェクトを推定
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function detectOrgProjectFromChannel(supabase: any, channel: string, channelId: string): Promise<{
  orgId: string | null;
  orgName: string | null;
  projectId: string | null;
  projectName: string | null;
}> {
  const result = {
    orgId: null as string | null,
    orgName: null as string | null,
    projectId: null as string | null,
    projectName: null as string | null,
  };
  if (!channelId) return result;

  try {
    const { data: channels } = await supabase
      .from('project_channels')
      .select('project_id, projects(id, name, organization_id, organizations(id, name))')
      .eq('service_name', channel)
      .eq('channel_identifier', channelId)
      .limit(1);

    if (channels && channels.length > 0) {
      result.projectId = channels[0].project_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const project = channels[0].projects as any;
      if (project) {
        result.projectName = project.name || null;
        if (project.organization_id) {
          result.orgId = project.organization_id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const org = project.organizations as any;
          if (org) {
            result.orgName = org.name || null;
          }
        }
      }
    }
  } catch (err) {
    console.error('[DriveService] チャネル→プロジェクト推定エラー:', err);
  }

  return result;
}

/**
 * Slackファイルをダウンロード（内部APIプロキシ経由）
 */
export async function downloadSlackFile(
  userId: string,
  fileId: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  try {
    // user_service_tokens からSlackトークン取得
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return null;

    const { data: tokenRow } = await supabase
      .from('user_service_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('service_name', 'slack')
      .single();

    if (!tokenRow?.access_token) {
      console.log('[DriveService] Slackトークン未設定:', userId);
      return null;
    }

    // Slack files.info APIでファイル情報取得
    const infoRes = await fetch(`https://slack.com/api/files.info?file=${fileId}`, {
      headers: { 'Authorization': `Bearer ${tokenRow.access_token}` },
    });
    const infoData = await infoRes.json();
    if (!infoData.ok || !infoData.file) {
      console.error('[DriveService] Slack file info取得失敗:', infoData.error);
      return null;
    }

    const fileInfo = infoData.file;
    const downloadUrl = fileInfo.url_private_download || fileInfo.url_private;
    if (!downloadUrl) return null;

    // ファイルダウンロード
    const dlRes = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${tokenRow.access_token}` },
    });
    if (!dlRes.ok) return null;

    const arrayBuffer = await dlRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      fileName: fileInfo.name || `slack_file_${fileId}`,
      mimeType: fileInfo.mimetype || 'application/octet-stream',
    };
  } catch (err) {
    console.error('[DriveService] Slackファイルダウンロードエラー:', err);
    return null;
  }
}

/**
 * Chatworkファイルをダウンロード
 */
export async function downloadChatworkFile(
  userId: string,
  roomId: string,
  fileId: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return null;

    const { data: tokenRow } = await supabase
      .from('user_service_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('service_name', 'chatwork')
      .single();

    if (!tokenRow?.access_token) {
      console.log('[DriveService] Chatworkトークン未設定:', userId);
      return null;
    }

    // Chatwork files API でダウンロードURL取得
    const apiRes = await fetch(
      `https://api.chatwork.com/v2/rooms/${roomId}/files/${fileId}?create_download_url=1`,
      { headers: { 'X-ChatWorkToken': tokenRow.access_token } }
    );
    const fileData = await apiRes.json();
    if (!fileData.download_url) return null;

    // ファイルダウンロード
    const dlRes = await fetch(fileData.download_url);
    if (!dlRes.ok) return null;

    const arrayBuffer = await dlRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      fileName: fileData.filename || `chatwork_file_${fileId}`,
      mimeType: 'application/octet-stream', // Chatwork APIはMIME type返さない
    };
  } catch (err) {
    console.error('[DriveService] Chatworkファイルダウンロードエラー:', err);
    return null;
  }
}
