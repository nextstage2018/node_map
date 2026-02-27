// Phase 42b: Cron Job — 送受信メッセージからキーワード自動抽出
// inbox_messages の keywords_extracted = false のメッセージを処理し、
// ナレッジマスタ（knowledge_master_entries）に登録 → thought_task_nodes で紐づけ
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/extract-message-nodes
 * Vercel Cron Jobsから毎日呼び出される
 * keywords_extracted = false のメッセージを最大50件処理
 */
export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Cron/MessageNodes] 認証失敗: 不正なCRON_SECRET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/MessageNodes] メッセージノード抽出開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
  }

  try {
    // ユーザーIDを取得（Cronではデフォルトユーザーを使用）
    let userId: string;
    try {
      userId = await getServerUserId();
    } catch {
      userId = 'demo-user-001';
    }

    // 未処理メッセージを取得（最新50件）
    const { data: messages, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('id, subject, body, channel, from_name, from_address, direction, timestamp')
      .or('keywords_extracted.is.null,keywords_extracted.eq.false')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (fetchError) {
      console.error('[Cron/MessageNodes] メッセージ取得エラー:', fetchError);
      return NextResponse.json({
        success: false,
        error: 'メッセージ取得に失敗',
      }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      console.log('[Cron/MessageNodes] 未処理メッセージなし');
      return NextResponse.json({
        success: true,
        data: { processed: 0, totalExtracted: 0, totalLinked: 0 },
      });
    }

    console.log(`[Cron/MessageNodes] ${messages.length}件のメッセージを処理開始`);

    let totalExtracted = 0;
    let totalLinked = 0;
    let processed = 0;
    let errors = 0;

    for (const msg of messages) {
      try {
        // キーワード抽出 + ナレッジマスタ登録 + 紐づけ
        const result = await ThoughtNodeService.extractAndLinkFromMessage({
          messageId: msg.id,
          subject: msg.subject || '',
          body: msg.body || '',
          userId,
          channel: msg.channel || 'unknown',
        });

        totalExtracted += result.extractedCount;
        totalLinked += result.linkedCount;

        // 処理済みフラグを更新
        await supabase
          .from('inbox_messages')
          .update({ keywords_extracted: true })
          .eq('id', msg.id);

        processed++;

        if (result.linkedCount > 0) {
          console.log(`[Cron/MessageNodes] ${msg.id}: ${result.linkedCount}件のキーワードを紐づけ (${msg.channel})`);
        }
      } catch (e) {
        errors++;
        console.error(`[Cron/MessageNodes] メッセージ ${msg.id} 処理エラー:`, e);

        // エラーでも処理済みにする（無限リトライ防止）
        await supabase
          .from('inbox_messages')
          .update({ keywords_extracted: true })
          .eq('id', msg.id);
      }
    }

    const summary = {
      processed,
      totalExtracted,
      totalLinked,
      errors,
      timestamp: new Date().toISOString(),
    };

    console.log('[Cron/MessageNodes] 処理完了:', JSON.stringify(summary));

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[Cron/MessageNodes] 全体エラー:', error);
    return NextResponse.json({
      success: false,
      error: 'メッセージノード抽出に失敗しました',
    }, { status: 500 });
  }
}
