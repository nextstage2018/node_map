// Google Drive ドキュメント共有API
// POST: 共有リンク生成 or メールで共有
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, emails, permission } = body;
    // action: 'create_link' | 'share_email'
    // permission: 'reader' | 'commenter' | 'writer'

    const sb = createServerClient();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB未設定です' }, { status: 500 });
    }

    // DBからドキュメント情報取得
    const { data: doc } = await sb
      .from('drive_documents')
      .select('drive_file_id, file_name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'ドキュメントが見つかりません' },
        { status: 404 }
      );
    }

    const role = permission || 'reader';

    if (action === 'create_link') {
      // 共有リンク作成
      const shareLink = await DriveService.createShareLink(userId, doc.drive_file_id, role);
      if (!shareLink) {
        return NextResponse.json(
          { success: false, error: '共有リンクの作成に失敗しました' },
          { status: 500 }
        );
      }

      // DB更新
      await sb
        .from('drive_documents')
        .update({
          is_shared: true,
          share_link: shareLink.webViewLink,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        data: {
          shareLink: shareLink.webViewLink,
          fileName: doc.file_name,
        },
      });
    } else if (action === 'share_email') {
      // メールで共有
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return NextResponse.json(
          { success: false, error: 'emails は必須です' },
          { status: 400 }
        );
      }

      const results: { email: string; success: boolean }[] = [];

      for (const email of emails) {
        const ok = await DriveService.shareWithEmail(userId, doc.drive_file_id, email, role);
        results.push({ email, success: ok });
      }

      // DB更新
      await sb
        .from('drive_documents')
        .update({
          is_shared: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({
        success: true,
        data: {
          fileName: doc.file_name,
          results,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'action は create_link または share_email を指定してください' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Drive Share API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '共有処理に失敗しました' },
      { status: 500 }
    );
  }
}
