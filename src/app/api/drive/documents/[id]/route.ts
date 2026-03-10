// Google Drive ドキュメント詳細API
// GET: ドキュメント詳細取得 / PUT: 更新 / DELETE: 削除
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
    console.error('[Drive Document Detail API] GET エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメント詳細の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: ドキュメント更新（タイトル・格納先・タグ）
export async function PUT(
  request: NextRequest,
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

    const body = await request.json();
    const { file_name, milestone_id, task_id, job_id, tags, document_type } = body;

    // 更新対象のフィールドを構築
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (file_name !== undefined) updates.file_name = file_name;
    if (milestone_id !== undefined) updates.milestone_id = milestone_id || null;
    if (task_id !== undefined) updates.task_id = task_id || null;
    if (job_id !== undefined) updates.job_id = job_id || null;
    if (tags !== undefined) updates.tags = tags;
    if (document_type !== undefined) updates.document_type = document_type || null;

    const { data: doc, error: updateErr } = await sb
      .from('drive_documents')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (updateErr || !doc) {
      console.error('[Drive Document Detail API] PUT エラー:', updateErr);
      return NextResponse.json(
        { success: false, error: '更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    console.error('[Drive Document Detail API] PUT エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメントの更新に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: ドキュメント削除
export async function DELETE(
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
      .select('drive_file_id, link_type')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'ドキュメントが見つかりません' },
        { status: 404 }
      );
    }

    // 外部URLでない場合はDriveから削除を試みる
    if (doc.link_type !== 'external_url' && doc.drive_file_id && !doc.drive_file_id.startsWith('url_')) {
      try {
        await DriveService.deleteFile(userId, doc.drive_file_id);
      } catch {
        // Drive削除失敗はDB削除を妨げない
      }
    }

    // DBから削除
    await sb
      .from('drive_documents')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Drive Document Detail API] DELETE エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ドキュメントの削除に失敗しました' },
      { status: 500 }
    );
  }
}
