// Google Drive フォルダ管理API
// GET: フォルダ一覧 / POST: フォルダ作成
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

// GET: ユーザーのDriveフォルダ一覧
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const folders = await DriveService.getFolders(userId);

    return NextResponse.json({ success: true, data: folders });
  } catch (error) {
    console.error('[Drive Folders API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'フォルダ一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 組織/プロジェクトのDriveフォルダ作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, organizationName, projectId, projectName } = body;

    if (!organizationId || !organizationName) {
      return NextResponse.json(
        { success: false, error: 'organizationId と organizationName は必須です' },
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

    // 組織フォルダ作成
    const orgFolderId = await DriveService.getOrCreateOrgFolder(userId, organizationId, organizationName);
    if (!orgFolderId) {
      return NextResponse.json(
        { success: false, error: '組織フォルダの作成に失敗しました' },
        { status: 500 }
      );
    }

    let projectFolderId: string | null = null;

    // プロジェクトフォルダも作成
    if (projectId && projectName) {
      projectFolderId = await DriveService.getOrCreateProjectFolder(
        userId, organizationId, projectId, projectName
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orgFolderId,
        orgFolderUrl: `https://drive.google.com/drive/folders/${orgFolderId}`,
        projectFolderId,
        projectFolderUrl: projectFolderId
          ? `https://drive.google.com/drive/folders/${projectFolderId}`
          : null,
      },
    });
  } catch (error) {
    console.error('[Drive Folders API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'フォルダの作成に失敗しました' },
      { status: 500 }
    );
  }
}
