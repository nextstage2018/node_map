// Google Drive ドキュメント詳細API
// GET: ドキュメント詳細取得
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB未設定です' }, { status: 500 });
    }

    // DBからドキュメント情報取得
    const { data: doc } = await sb
      .from('drive_documents')
      .select('*, organizations(name), projects(name)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'ドキュメントが見つかりません' },
        { status: 404 }
      );
    }

    // Driveから最新情報取得（オプション）
    let driveInfo = null;
    try {
      driveInfo = await DriveService.getFile(userId, doc.drive_file_id);
    } catch {
      // Drive APIエラーは致命的ではない
    }

    return NextResponse.json({
      success: true,
      data: {
        ...doc,
        driveInfo,
      },
    });
  } catch (error) {
    console.error('[Drive Document Detail API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメント詳細の取得に失敗しました' },
      { status: 500 }
    );
  }
}
