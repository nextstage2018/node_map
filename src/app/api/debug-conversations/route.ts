// 一時的な診断エンドポイント: task_conversationsの内容を確認
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー' }, { status: 500 });
    }

    // task_conversationsテーブルのカラム構造を確認
    const { data: sampleRow, error: sampleError } = await supabase
      .from('task_conversations')
      .select('*')
      .limit(1);

    const columns = sampleRow && sampleRow.length > 0
      ? Object.keys(sampleRow[0])
      : [];

    // 特定タスクの会話を取得
    let taskConversations = null;
    let taskConvError = null;
    if (taskId) {
      const { data, error } = await supabase
        .from('task_conversations')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      taskConversations = data;
      taskConvError = error;
    }

    // 全会話の件数
    const { count, error: countError } = await supabase
      .from('task_conversations')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      data: {
        totalConversationCount: count,
        countError: countError?.message || null,
        tableColumns: columns,
        sampleError: sampleError?.message || null,
        taskId: taskId || '(指定なし)',
        taskConversationCount: taskConversations?.length || 0,
        taskConvError: taskConvError?.message || null,
        taskConversations: taskConversations?.map(c => ({
          id: c.id,
          role: c.role,
          content: c.content?.substring(0, 100) + (c.content?.length > 100 ? '...' : ''),
          phase: c.phase,
          created_at: c.created_at,
        })) || [],
      },
    });
  } catch (error) {
    console.error('[Debug] エラー:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
