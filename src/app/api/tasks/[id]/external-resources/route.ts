import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Phase E: タスク外部資料API
 * GET: タスクの外部資料一覧取得
 * POST: 外部資料の追加（テキスト/ファイル/URL）
 * DELETE: 外部資料の削除
 */

// 外部資料一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id: taskId } = await params;

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('task_external_resources')
      .select('id, task_id, resource_type, title, content_length, source_url, file_name, file_mime_type, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[External Resources] 取得エラー:', error);
      return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[External Resources] エラー:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラー' }, { status: 500 });
  }
}

// 外部資料追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id: taskId } = await params;

    const body = await request.json();
    const { resourceType, title, content, sourceUrl, fileName, fileMimeType } = body;

    if (!resourceType || !title) {
      return NextResponse.json(
        { success: false, error: 'resourceType と title は必須です' },
        { status: 400 }
      );
    }

    if (!['text', 'file', 'url'].includes(resourceType)) {
      return NextResponse.json(
        { success: false, error: 'resourceType は text, file, url のいずれかです' },
        { status: 400 }
      );
    }

    // テキスト内容の文字数制限（50,000文字 ≒ AI会話コンテキストに収まる範囲）
    const MAX_CONTENT_LENGTH = 50000;
    let processedContent = content || '';
    if (processedContent.length > MAX_CONTENT_LENGTH) {
      processedContent = processedContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n（※ 文字数制限により以降省略）';
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // タスクの存在確認
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .select('id')
      .eq('id', taskId)
      .single();

    if (taskErr || !task) {
      return NextResponse.json({ success: false, error: 'タスクが見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('task_external_resources')
      .insert({
        task_id: taskId,
        user_id: userId,
        resource_type: resourceType,
        title,
        content: processedContent,
        source_url: sourceUrl || null,
        file_name: fileName || null,
        file_mime_type: fileMimeType || null,
        content_length: processedContent.length,
      })
      .select('id, task_id, resource_type, title, content_length, source_url, file_name, file_mime_type, created_at')
      .single();

    if (error) {
      console.error('[External Resources] 追加エラー:', error);
      return NextResponse.json({ success: false, error: '追加に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[External Resources] エラー:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラー' }, { status: 500 });
  }
}

// 外部資料削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id: taskId } = await params;

    const { searchParams } = new URL(request.url);
    const resourceId = searchParams.get('resourceId');
    if (!resourceId) {
      return NextResponse.json({ success: false, error: 'resourceId は必須です' }, { status: 400 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    const { error } = await supabase
      .from('task_external_resources')
      .delete()
      .eq('id', resourceId)
      .eq('task_id', taskId);

    if (error) {
      console.error('[External Resources] 削除エラー:', error);
      return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[External Resources] エラー:', error);
    return NextResponse.json({ success: false, error: 'サーバーエラー' }, { status: 500 });
  }
}
