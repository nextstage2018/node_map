// Phase 50: タスクに紐づくドキュメント一覧 / 切り離しAPI
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: タスクに紐づくファイル一覧
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    const { data, error } = await sb
      .from('drive_documents')
      .select('id, file_name, original_file_name, drive_url, drive_file_id, document_type, direction, year_month, mime_type, file_size, memo, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Task Files] 取得エラー:', error);
      return NextResponse.json({ error: 'ファイル取得に失敗' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Task Files] エラー:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

// PATCH: タスクからファイルを切り離す（task_id = NULLにする、ファイル自体はDriveに残る）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const body = await request.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'fileIdは必須です' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    const { error } = await sb
      .from('drive_documents')
      .update({ task_id: null })
      .eq('id', fileId)
      .eq('task_id', taskId);

    if (error) {
      console.error('[Task Files] 切り離しエラー:', error);
      return NextResponse.json({ error: '切り離しに失敗' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Task Files] エラー:', error);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
