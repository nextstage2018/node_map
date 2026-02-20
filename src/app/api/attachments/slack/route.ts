import { NextResponse } from 'next/server';

// force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * Slackファイルのプロキシダウンロード
 * Slackのファイル（url_private等）はBotトークン認証が必要なため、
 * サーバーサイドでプロキシしてクライアントに返す
 *
 * GET /api/attachments/slack?fileId=xxx&type=download|thumb
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const type = searchParams.get('type') || 'download'; // 'download' or 'thumb'

  if (!fileId) {
    return NextResponse.json(
      { success: false, error: 'fileId が必要です' },
      { status: 400 }
    );
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Slack Bot Token が設定されていません' },
      { status: 500 }
    );
  }

  try {
    // Slack APIでファイル情報を取得
    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    const fileInfo = await client.files.info({ file: fileId });
    const file = fileInfo.file;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'ファイルが見つかりません' },
        { status: 404 }
      );
    }

    // 取得するURLを決定
    let targetUrl: string | undefined;
    if (type === 'thumb') {
      targetUrl = (file as Record<string, unknown>).thumb_360 as string
        || (file as Record<string, unknown>).thumb_160 as string
        || (file as Record<string, unknown>).thumb_80 as string
        || file.url_private as string;
    } else {
      targetUrl = (file.url_private_download as string) || (file.url_private as string);
    }

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: 'ファイルURLが取得できません' },
        { status: 404 }
      );
    }

    // Slack認証付きでファイルをフェッチ
    const fileResponse = await fetch(targetUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!fileResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Slackファイル取得失敗: ${fileResponse.status}` },
        { status: fileResponse.status }
      );
    }

    // レスポンスをそのままプロキシ
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const body = await fileResponse.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': type === 'download'
          ? `attachment; filename="${file.name || 'file'}"`
          : 'inline',
        'Cache-Control': 'private, max-age=3600', // 1時間キャッシュ
      },
    });
  } catch (error) {
    console.error('[Slack] ファイルプロキシエラー:', error);
    return NextResponse.json(
      { success: false, error: 'ファイルダウンロードに失敗しました' },
      { status: 500 }
    );
  }
}
