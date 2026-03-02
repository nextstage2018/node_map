// Google Drive ドキュメント管理API
// GET: ドキュメント一覧 / POST: 手動アップロード / DELETE: 削除
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

// GET: ドキュメント一覧
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const documents = await DriveService.getDocuments({
      userId,
      organizationId,
      projectId,
      limit,
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error('[Drive Documents API] GET エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメント一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: ファイルアップロード（Base64形式で受け取り）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, organizationName, projectId, projectName, fileName, mimeType, fileData } = body;

    if (!fileName || !fileData) {
      return NextResponse.json(
        { success: false, error: 'fileName と fileData は必須です' },
        { status: 400 }
      );
    }

    // Drive接続チェック
    const connected = await DriveService.isDriveConnected(userId);
    if (!connected) {
      return NextResponse.json(
        { success: false, error: 'Google Drive未連携です。設定画面から再認証してください' },
        { status: 400 }
      );
    }

    // フォルダ取得 or 作成
    let folderId: string | null = null;

    if (organizationId && organizationName) {
      const orgFolderId = await DriveService.getOrCreateOrgFolder(userId, organizationId, organizationName);
      if (!orgFolderId) {
        return NextResponse.json(
          { success: false, error: '組織フォルダの作成に失敗しました' },
          { status: 500 }
        );
      }

      if (projectId && projectName) {
        folderId = await DriveService.getOrCreateProjectFolder(
          userId, organizationId, projectId, projectName
        );
      } else {
        folderId = orgFolderId;
      }
    }

    if (!folderId) {
      return NextResponse.json(
        { success: false, error: 'アップロード先フォルダが特定できません' },
        { status: 400 }
      );
    }

    // Base64 → Buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Driveにアップロード
    const driveFile = await DriveService.uploadFile(
      userId,
      buffer,
      fileName,
      mimeType || 'application/octet-stream',
      folderId
    );

    if (!driveFile) {
      return NextResponse.json(
        { success: false, error: 'Google Driveへのアップロードに失敗しました' },
        { status: 500 }
      );
    }

    // DBに記録
    const docId = await DriveService.recordDocument({
      userId,
      organizationId: organizationId || undefined,
      projectId: projectId || undefined,
      driveFileId: driveFile.id,
      driveFolderId: folderId,
      fileName: driveFile.name,
      fileSizeBytes: driveFile.size,
      mimeType: driveFile.mimeType,
      driveUrl: driveFile.webViewLink,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: docId,
        driveFileId: driveFile.id,
        fileName: driveFile.name,
        driveUrl: driveFile.webViewLink,
      },
    });
  } catch (error) {
    console.error('[Drive Documents API] POST エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ファイルのアップロードに失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: ドキュメント削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'documentId は必須です' },
        { status: 400 }
      );
    }

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json(
        { success: false, error: 'DB未設定です' },
        { status: 500 }
      );
    }

    // DBからドキュメント情報取得
    const { data: doc } = await sb
      .from('drive_documents')
      .select('drive_file_id')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'ドキュメントが見つかりません' },
        { status: 404 }
      );
    }

    // Driveから削除
    await DriveService.deleteFile(userId, doc.drive_file_id);

    // DBから削除
    await sb
      .from('drive_documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Drive Documents API] DELETE エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメントの削除に失敗しました' },
      { status: 500 }
    );
  }
}
