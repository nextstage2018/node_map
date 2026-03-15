// 一時的な診断エンドポイント: task_conversationsの保存テスト
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
    const testInsert = searchParams.get('testInsert') === 'true';

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'DB接続エラー', supabaseNull: true }, { status: 500 });
    }

    const results: any = {
      userId,
      supabaseType: getServerSupabase() ? 'server(service_role)' : 'anon',
    };

    // テーブルのカラム情報を取得（1件selectで確認）
    const { data: cols, error: colsErr } = await supabase
      .from('task_conversations')
      .select('*')
      .limit(1);
    results.selectAllResult = {
      data: cols,
      error: colsErr?.message || null,
      columns: cols && cols.length > 0 ? Object.keys(cols[0]) : '(0件のためカラム取得不可)',
    };

    // 全件数
    const { count, error: countErr } = await supabase
      .from('task_conversations')
      .select('*', { count: 'exact', head: true });
    results.totalCount = count;
    results.countError = countErr?.message || null;

    // 特定タスクの会話
    if (taskId) {
      const { data: convs, error: convErr } = await supabase
        .from('task_conversations')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      results.taskConversations = {
        count: convs?.length || 0,
        error: convErr?.message || null,
        data: convs?.map(c => ({
          id: c.id,
          role: c.role,
          phase: c.phase,
          user_id: c.user_id,
          content_preview: c.content?.substring(0, 80),
          created_at: c.created_at,
        })),
      };
    }

    // テスト挿入
    if (testInsert && taskId) {
      const testData = {
        task_id: taskId,
        user_id: userId,
        role: 'user',
        content: 'テスト会話（診断用）',
        phase: 'ideation',
        created_at: new Date().toISOString(),
      };
      results.testInsertPayload = testData;

      const { data: insertResult, error: insertErr } = await supabase
        .from('task_conversations')
        .insert(testData)
        .select()
        .single();

      results.testInsertResult = {
        success: !insertErr,
        data: insertResult,
        error: insertErr ? {
          message: insertErr.message,
          code: insertErr.code,
          details: insertErr.details,
          hint: insertErr.hint,
        } : null,
      };

      // 挿入成功した場合は削除（テストデータのクリーンアップ）
      if (insertResult) {
        await supabase
          .from('task_conversations')
          .delete()
          .eq('id', insertResult.id);
        results.testInsertResult.cleanedUp = true;
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
