import { NextResponse, NextRequest } from 'next/server';
import { fetchEmails } from '@/services/email/emailClient.service';
import { fetchSlackMessages } from '@/services/slack/slackClient.service';
import { fetchChatworkMessages } from '@/services/chatwork/chatworkClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { UnifiedMessage } from '@/lib/types';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { generateThreadSummary } from '@/services/ai/aiClient.service';
import { saveMessages, getBlocklist } from '@/services/inbox/inboxStorage.service';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';
// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを取得
    const userId = await getServerUserId();

    // ページネーションパラメータ
    const searchParams = request.nextUrl.searchParams;
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;
    const forceRefresh = searchParams.get('refresh') === 'true';

    // キャッシュチェック（強制更新でなければ）
    if (!forceRefresh) {
      const cached = cache.get<{
        messages: UnifiedMessage[];
        pagination: { page: number; limit: number; hasMore: boolean };
      }>(CACHE_KEYS.messages(page));

      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached.messages,
          pagination: cached.pagination,
          cached: true,
        });
      }
    }

    // 全チャネルからメッセージを並列取得
    const [emails, slackMessages, chatworkMessages] = await Promise.all([
      fetchEmails(limit, page),
      fetchSlackMessages(limit),
      fetchChatworkMessages(limit),
    ]);

    // 全メッセージを統合して時系列ソート
    let allMessages: UnifiedMessage[] = [
      ...emails,
      ...slackMessages,
      ...chatworkMessages,
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 【Supabase】メッセージを保存（バックグラウンド）
    if (isSupabaseConfigured()) {
      saveMessages(allMessages).catch((err) => {
        console.error('[Messages API] Supabase保存エラー:', err);
      });
    }

    // 【ブロックリスト】メールをフィルタリング
    try {
      const blocklist = await getBlocklist();
      if (blocklist.length > 0) {
        allMessages = allMessages.filter((msg) => {
          if (msg.channel !== 'email') return true;
          const addr = msg.from.address.toLowerCase();
          const domain = addr.split('@')[1] || '';
          for (const entry of blocklist) {
            if (entry.match_type === 'exact' && addr === entry.address.toLowerCase()) return false;
            if (entry.match_type === 'domain' && domain === entry.address.toLowerCase()) return false;
          }
          return true;
        });
      }
    } catch {
      // ブロックリスト取得失敗時はフィルタなしで続行
    }

    const pagination = {
      page,
      limit,
      hasMore: emails.length >= limit,
    };

    // キャッシュに保存
    cache.set(CACHE_KEYS.messages(page), { messages: allMessages, pagination }, CACHE_TTL.messages);

    // 【バックグラウンド】スレッド付きメールの要約を事前生成
    const threadsToSummarize = allMessages.filter(
      (m) => m.threadMessages && m.threadMessages.length >= 2
    );
    if (threadsToSummarize.length > 0) {
      Promise.allSettled(
        threadsToSummarize.map(async (msg) => {
          const cacheKey = CACHE_KEYS.threadSummary(msg.id);
          // 既にキャッシュにあればスキップ
          if (cache.get<string>(cacheKey)) return;
          try {
            const summary = await generateThreadSummary(
              msg.subject || '',
              msg.threadMessages!
            );
            cache.set(cacheKey, summary, CACHE_TTL.threadSummary);
          } catch {
            // 要約失敗はメッセージ取得に影響させない
          }
        })
      ).catch(() => {});
    }

    // 【Phase 4】メッセージからキーワードを抽出してノードに蓄積（非同期・エラー無視）
    // Phase 22: 認証ユーザーIDを使用
    Promise.allSettled(
      allMessages.map((msg) =>
        NodeService.processText({
          text: `${msg.subject || ''} ${msg.body}`,
          sourceType: 'message',
          sourceId: msg.id,
          direction: msg.from.name === 'あなた' ? 'sent' : 'received',
          userId: userId,
        })
      )
    ).catch(() => {
      // キーワード抽出エラーはメッセージ取得に影響させない
    });

    return NextResponse.json({
      success: true,
      data: allMessages,
      pagination,
      cached: false,
    });
  } catch (error) {
    console.error('メッセージ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの取得に失敗しました' },
      { status: 500 }
    );
  }
}
