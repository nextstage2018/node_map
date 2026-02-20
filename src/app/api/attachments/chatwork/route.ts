import { NextResponse } from 'next/server';
import { getChatworkFileDownloadUrl } from '@/services/chatwork/chatworkClient.service';

/**
 * Chatworkファイルのダウンロードリダイレクト
 * GET /api/attachments/chatwork?roomId=xxx&fileId=xxx
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const fileId = searchParams.get('fileId');

  if (!roomId || !fileId) {
    return NextResponse.json(
      { success: false, error: 'roomId と fileId が必要です' },
      { status: 400 }
    );
  }

  try {
    const downloadUrl = await getChatworkFileDownloadUrl(roomId, fileId);

    if (!downloadUrl) {
      return NextResponse.json(
        { success: false, error: 'ダウンロードURLの取得に失敗しました' },
        { status: 404 }
      );
    }

    // ダウンロードURLにリダイレクト
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error('[Chatwork] ファイルダウンロードエラー:', error);
    return NextResponse.json(
      { success: false, error: 'ファイルダウンロードに失敗しました' },
      { status: 500 }
    );
  }
}
