// Phase 25: メッセージ取得API — チャネル購読フィルタリング + 取得範囲制御
import { NextResponse, NextRequest } from 'next/server';
import { fetchEmails } from '@/services/email/emailClient.service';
import { fetchSlackMessages } from '@/services/slack/slackClient.service';
import { fetchChatworkMessages } from '@/services/chatwork/chatworkClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { UnifiedMessage } from '@/lib/types';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { generateThreadSummary } from '@/services/ai/aiClient.service';
import { saveMessages, getBlocklist } from '@/services/inbox/inboxStorage.service';
import { isSupabaseConfigured, createServerClient } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';

// ========================================
// Phase 25: ユーザーの購読チャネルを取得
// ========================================
async function getUserSubscriptions(userId: string): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {
    gmail: [],
    slack: [],
    chatwork: [],
  };

  const supabase = createServerClient();
  if (!supabase) return result; // デモモードでは全取得

  try {
    const { data, error } = await supabase
      .from('user_channel_subscriptions')
      .select('service_name, channel_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error || !data) return result;

    for (const sub of data) {
      if (result[sub.service_name]) {
        result[sub.service_name].push(sub.channel_id);
      }
    }
  } catch (e) {
    console.error('[Messages API] 購読チャネル取得エラー:', e);
  }

  return result;
}

// ========================================
// Phase 25: 同期状態管理 — 初回30日/差分更新
// ========================================
async function getSyncTimestamp(userId: string, channel: string, channelId: string): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from('inbox_sync_state')
      .select('last_sync_at, initial_sync_done')
      .eq('channel', channel)
      .eq('channel_id', channelId || '')
      .single();

    if (data?.last_sync_at) {
      return data.last_sync_at;
    }

    // 初回同期: 過去30日分
    if (!data?.initial_sync_done) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo.toISOString();
    }

    return null;
  } catch {
    // レコードが無い場合 → 初回同期
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo.toISOString();
  }
}

async function updateSyncTimestamp(channel: string, channelId: string): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) return;

  try {
    await supabase
      .from('inbox_sync_state')
      .upsert({
        channel,
        channel_id: channelId || '',
        last_sync_at: new Date().toISOString(),
        initial_sync_done: true,
        status: 'idle',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'channel',
      });
  } catch (e) {
    console.error(`[Messages API] sync_state更新エラー (${channel}/${channelId}):`, e);
  }
}

// ========================================
// GET: メッセージ一覧
// ========================================
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

    // Phase 25: ユーザーの購読チャネルを取得
    const subscriptions = await getUserSubscriptions(userId);
    const hasGmailSubs = subscriptions.gmail.length > 0;
    const hasSlackSubs = subscriptions.slack.length > 0;
    const hasChatworkSubs = subscriptions.chatwork.length > 0;

    // 購読チャネルがあるサービスのみメッセージ取得
    // 購読が0件のサービスはスキップ（ただしデモモードは全取得）
    const isDemo = !isSupabaseConfigured();

    const fetchPromises: Promise<UnifiedMessage[]>[] = [];

    if (isDemo || hasGmailSubs) {
      fetchPromises.push(fetchEmails(limit, page));
    } else {
      fetchPromises.push(Promise.resolve([]));
    }

    if (isDemo || hasSlackSubs) {
      fetchPromises.push(fetchSlackMessages(limit, userId));
    } else {
      fetchPromises.push(Promise.resolve([]));
    }

    if (isDemo || hasChatworkSubs) {
      fetchPromises.push(fetchChatworkMessages(limit));
    } else {
      fetchPromises.push(Promise.resolve([]));
    }

    const [emails, slackMessages, chatworkMessages] = await Promise.all(fetchPromises);

    // 全メッセージを統合
    let allMessages: UnifiedMessage[] = [
      ...emails,
      ...slackMessages,
      ...chatworkMessages,
    ];

    // Phase 25: 購読チャネルでフィルタリング（サービスレベルの大枠は上で制御済み）
    // msg.channel（email/slack/chatwork）→ subscriptionsキー（gmail/slack/chatwork）のマッピング
    if (!isDemo) {
      const channelToServiceMap: Record<string, string> = {
        email: 'gmail',
        slack: 'slack',
        chatwork: 'chatwork',
      };
      allMessages = allMessages.filter((msg) => {
        const serviceName = channelToServiceMap[msg.channel] || msg.channel;
        const subs = subscriptions[serviceName];
        if (!subs || subs.length === 0) return false;
        return true;
      });
    }

    // 時系列ソート
    allMessages.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 【Supabase】メッセージを保存（バックグラウンド）
    if (isSupabaseConfigured()) {
      saveMessages(allMessages).catch((err) => {
        console.error('[Messages API] Supabase保存エラー:', err);
      });

      // Phase 25: 同期タイムスタンプを更新
      if (hasGmailSubs) updateSyncTimestamp('email', '').catch(() => {});
      if (hasSlackSubs) updateSyncTimestamp('slack', '').catch(() => {});
      if (hasChatworkSubs) updateSyncTimestamp('chatwork', '').catch(() => {});
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
