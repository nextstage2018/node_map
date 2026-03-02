// Phase 44c: ファイル取り込み却下API
// ステージングファイルを却下 → 一時Driveファイル削除
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id: stagingId } = await params;

    const success = await DriveService.rejectStagingFile(stagingId, userId);

    if (!success) {
      return NextResponse.json(
        { success: false, error: '却下処理に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: 'ファイルを却下しました' },
    });
  } catch (error) {
    console.error('[Drive Intake Reject] エラー:', error);
    return NextResponse.json(
      { success: false, error: '却下処理に失敗しました' },
      { status: 500 }
    );
  }
}
