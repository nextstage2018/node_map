// Phase 26+: メッセージ取得API — 全チャネル受信→DB保存→購読フィルタ表示
// 修正: トークン設定済みなら購読チャネル未登録でも全取得（DBには全保存、表示時に絞り込み）
// 修正: 差分取得をawaitして新着を即レスポンスに含める
import { NextResponse, NextRequest } from 'next/server';
import { fetchEmails } from '@/services/email/emailClient.service';
import { fetchSlackMessages } from '@/services/slack/slackClient.service';
import { fetchChatworkMessages } from '@/services/chatwork/chatworkClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { UnifiedMessage } from '@/lib/types';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { generateThreadSummary } from '@/services/ai/aiClient.service';
import { saveMessages, loadMessages, getBlocklist } from '@/services/inbox/inboxStorage.service';
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
// トークン設定チェック: 各チャネルのトークンがあるか（取得可能か）
// 購読チャネルが未登録でもトークンがあれば全取得する
// ========================================
async function hasChannelToken(serviceName: string, userId: string): Promise<boolean> {
  // 環境変数チェック
  if (serviceName === 'gmail' && process.env.EMAIL_USER) return true;
  if (serviceName === 'slack' && process.env.SLACK_BOT_TOKEN) return true;
  if (serviceName === 'chatwork' && process.env.CHATWORK_API_TOKEN) return true;

  // DBトークンチェック
  const supabase = createServerClient();
  if (!supabase) return false;

  try {
    const svcName = serviceName === 'gmail' ? 'gmail' : serviceName;
    const { data } = await supabase
      .from('user_service_tokens')
      .select('id')
      .eq('service_name', svcName)
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);
    return !!(data && data.length > 0);
  } catch {
    return false;
  }
}

// ========================================
// Phase 26: 同期状態管理 — 初回全量/差分更新
// ========================================
interface SyncState {
  last_sync_at: string | null;
  initial_sync_done: boolean;
}

async function getSyncState(channel: string): Promise<SyncState> {
  const supabase = createServerClient();
  if (!supabase) return { last_sync_at: null, initial_sync_done: false };

  try {
    const { data } = await supabase
      .from('inbox_sync_state')
      .select('last_sync_at, initial_sync_done')
      .eq('channel', channel)
      .single();

    return {
      last_sync_at: data?.last_sync_at || null,
      initial_sync_done: data?.initial_sync_done || false,
    };
  } catch {
    return { last_sync_at: null, initial_sync_done: false };
  }
}

async function updateSyncTimestamp(channel: string): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) return;

  try {
    await supabase
      .from('inbox_sync_state')
      .upsert({
        channel,
        channel_id: '',
        last_sync_at: new Date().toISOString(),
        initial_sync_done: true,
        status: 'idle',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'channel',
      });
  } catch (e) {
    console.error(`[Messages API] sync_state更新エラー (${channel}):`, e);
  }
}

// ========================================
// Phase 26: スパム判定（直接実行・バックグラウンド）
// ========================================
function ruleBasedSpamCheck(msg: {
  from_address: string;
  from_name: string;
  subject: string;
  body: string;
}): { isSpam: boolean; reason: string; confidence: number } {
  const addr = (msg.from_address || '').toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  const body = (msg.body || '').toLowerCase();

  // 1. no-reply送信者
  if (addr.includes('noreply') || addr.includes('no-reply') || addr.includes('do-not-reply')) {
    return { isSpam: true, reason: '自動送信アドレス（noreply）', confidence: 0.85 };
  }
  // 2. メルマガキーワード
  const nlKw = ['ニュースレター','newsletter','メルマガ','メールマガジン','配信停止','unsubscribe','購読解除','定期配信','weekly digest','daily digest'];
  for (const kw of nlKw) {
    if (subject.includes(kw) || body.slice(0, 500).includes(kw)) {
      return { isSpam: true, reason: `メルマガキーワード: "${kw}"`, confidence: 0.8 };
    }
  }
  // 3. 配信停止リンク
  const unsub = ['unsubscribe','配信停止','配信解除','opt-out','optout','メール配信を停止','購読を解除'];
  for (const pat of unsub) {
    if (body.includes(pat)) return { isSpam: true, reason: '配信停止リンクを検出', confidence: 0.75 };
  }
  // 4. 大量送信ドメイン
  const bulkDomains = ['sendgrid.net','mailchimp.com','constantcontact.com','hubspot.com'];
  for (const d of bulkDomains) {
    if (addr.includes(d)) return { isSpam: true, reason: `一括送信ドメイン: ${d}`, confidence: 0.7 };
  }
  // 5. プロモーション
  const promo = ['セール','sale','キャンペーン','campaign','クーポン','coupon','期間限定','今だけ','特別価格','割引','discount'];
  let cnt = 0;
  for (const kw of promo) { if (subject.includes(kw) || body.slice(0, 300).includes(kw)) cnt++; }
  if (cnt >= 2) return { isSpam: true, reason: `プロモーション系キーワード(${cnt}個)`, confidence: 0.7 };

  return { isSpam: false, reason: '', confidence: 0 };
}

async function runSpamCheck(messages: UnifiedMessage[]): Promise<void> {
  const emailMessages = messages.filter((m) => m.channel === 'email' && !m.metadata?.spam_flag);
  if (emailMessages.length === 0) return;

  const supabase = createServerClient();
  if (!supabase) return;

  for (const msg of emailMessages.slice(0, 20)) {
    const check = ruleBasedSpamCheck({
      from_address: msg.from.address || '',
      from_name: msg.from.name || '',
      subject: msg.subject || '',
      body: msg.body || '',
    });
    if (check.isSpam) {
      try {
        const { data: existing } = await supabase
          .from('inbox_messages')
          .select('metadata')
          .eq('id', msg.id)
          .single();
        const metadata = existing?.metadata || {};
        metadata.spam_flag = { isSpam: true, reason: check.reason, confidence: check.confidence, checkedAt: new Date().toISOString() };
        await supabase.from('inbox_messages').update({ metadata }).eq('id', msg.id);
      } catch { /* 個別失敗は無視 */ }
    }
  }
}

// ========================================
// GET: メッセージ一覧（Phase 26: 差分取得対応）
// ========================================
export async function GET(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // Phase 53: 単一メッセージ取得（id指定時はDBから直接返す）
    const searchParams = request.nextUrl.searchParams;
    const singleId = searchParams.get('id');
    if (singleId) {
      const supabase = createServerClient();
      if (supabase) {
        const { data: msgData, error: msgError } = await supabase
          .from('inbox_messages')
          .select('*')
          .eq('id', singleId)
          .single();
        if (msgError || !msgData) {
          return NextResponse.json({ success: false, error: 'メッセージが見つかりません' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: msgData });
      }
      return NextResponse.json({ success: false, error: 'DB未設定' }, { status: 500 });
    }

    // ページネーションパラメータ
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;
    const forceRefresh = searchParams.get('refresh') === 'true';
    // Phase 38: 方向フィルタ（all=全て, sent=送信のみ, received=受信のみ）
    const directionFilter = (searchParams.get('direction') || 'all') as 'all' | 'sent' | 'received';

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

    // Phase 25: ユーザーの購読チャネルを取得（表示フィルタ用）
    const subscriptions = await getUserSubscriptions(userId);
    const hasGmailSubs = subscriptions.gmail.length > 0;
    const hasSlackSubs = subscriptions.slack.length > 0;
    const hasChatworkSubs = subscriptions.chatwork.length > 0;

    // トークンチェック: 購読チャネル未登録でもトークンがあれば取得する
    const [hasGmailToken, hasSlackToken, hasChatworkToken] = await Promise.all([
      hasChannelToken('gmail', userId),
      hasChannelToken('slack', userId),
      hasChannelToken('chatwork', userId),
    ]);

    // 取得対象: トークンがあれば取得する（購読有無にかかわらずDBには全保存）
    const canFetchGmail = hasGmailSubs || hasGmailToken;
    const canFetchSlack = hasSlackSubs || hasSlackToken;
    const canFetchChatwork = hasChatworkSubs || hasChatworkToken;

    const isDemo = !isSupabaseConfigured();

    // ========================================
    // Phase 26: 差分取得ロジック
    // ========================================
    let allMessages: UnifiedMessage[] = [];

    if (!isDemo && !forceRefresh) {
      // === 差分取得モード ===
      // 1. 各チャネルの同期状態を確認（トークンベースで判定）
      const [emailSync, slackSync, chatworkSync] = await Promise.all([
        canFetchGmail ? getSyncState('email') : Promise.resolve({ last_sync_at: null, initial_sync_done: false }),
        canFetchSlack ? getSyncState('slack') : Promise.resolve({ last_sync_at: null, initial_sync_done: false }),
        canFetchChatwork ? getSyncState('chatwork') : Promise.resolve({ last_sync_at: null, initial_sync_done: false }),
      ]);

      const allSynced = (
        (!canFetchGmail || emailSync.initial_sync_done) &&
        (!canFetchSlack || slackSync.initial_sync_done) &&
        (!canFetchChatwork || chatworkSync.initial_sync_done)
      );

      if (allSynced) {
        // 2. DB からメッセージを読み出し（メイン）
        console.log('[Messages API] Phase 26: DBから読み出し（差分取得モード）');
        const now = new Date();
        const rangeStart = new Date(now);
        rangeStart.setDate(rangeStart.getDate() - page * 30);
        const rangeEnd = page === 1 ? now : new Date(now);
        if (page > 1) rangeEnd.setDate(rangeEnd.getDate() - (page - 1) * 30);

        const dbResult = await loadMessages({
          since: rangeStart.toISOString(),
          limit: 200,
          direction: directionFilter, // Phase 38: 方向フィルタ対応
        });
        allMessages = dbResult.messages;

        // 日付範囲フィルタ
        if (page > 1) {
          allMessages = allMessages.filter((msg) => {
            const msgDate = new Date(msg.timestamp);
            return msgDate >= rangeStart && msgDate < rangeEnd;
          });
        }

        // 3. 差分取得（新着メッセージをAPIから取得→DB保存→レスポンスに含める）
        try {
          const newMessages: UnifiedMessage[] = [];

          // 各チャネルで最新のlast_sync_at以降のみ取得（トークンベース）
          const fetchPromises: Promise<void>[] = [];

          if (canFetchGmail && emailSync.last_sync_at) {
            fetchPromises.push(
              fetchEmails(20, 1).then(emails => {
                const sinceDate = new Date(emailSync.last_sync_at!);
                newMessages.push(...emails.filter(e => new Date(e.timestamp) > sinceDate));
              }).catch(e => console.error('[Messages API] Gmail差分取得エラー:', e))
            );
          }
          if (canFetchSlack && slackSync.last_sync_at) {
            fetchPromises.push(
              fetchSlackMessages(20, userId).then(msgs => {
                const sinceDate = new Date(slackSync.last_sync_at!);
                newMessages.push(...msgs.filter(s => new Date(s.timestamp) > sinceDate));
              }).catch(e => console.error('[Messages API] Slack差分取得エラー:', e))
            );
          }
          if (canFetchChatwork && chatworkSync.last_sync_at) {
            fetchPromises.push(
              fetchChatworkMessages(20).then(msgs => {
                const sinceDate = new Date(chatworkSync.last_sync_at!);
                newMessages.push(...msgs.filter(c => new Date(c.timestamp) > sinceDate));
              }).catch(e => console.error('[Messages API] Chatwork差分取得エラー:', e))
            );
          }

          await Promise.all(fetchPromises);

          if (newMessages.length > 0) {
            console.log(`[Messages API] 差分取得 ${newMessages.length}件の新着`);
            await saveMessages(newMessages);
            // 新着をレスポンスに追加（DB読み込み分と重複排除）
            const existingIds = new Set(allMessages.map(m => m.id));
            const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
            allMessages = [...uniqueNew, ...allMessages];
            // スパム判定（バックグラウンド）
            runSpamCheck(newMessages).catch(() => {});
          }
        } catch (e) {
          console.error('[Messages API] 差分取得エラー:', e);
        }

        // 同期タイムスタンプ更新
        if (canFetchGmail) updateSyncTimestamp('email').catch(() => {});
        if (canFetchSlack) updateSyncTimestamp('slack').catch(() => {});
        if (canFetchChatwork) updateSyncTimestamp('chatwork').catch(() => {});

      } else {
        // === 初回同期モード ===
        console.log('[Messages API] 初回同期（全量取得）— トークンベース');
        allMessages = await fetchAllFromAPIs(isDemo, canFetchGmail, canFetchSlack, canFetchChatwork, limit, page, userId);

        // DBに保存（awaitして既読チェック前にDB反映を確実にする）
        if (allMessages.length > 0) {
          try {
            await saveMessages(allMessages);
          } catch (err) {
            console.error('[Messages API] Supabase保存エラー:', err);
          }
          // スパム判定（バックグラウンド）
          runSpamCheck(allMessages).catch(() => {});
        }

        // 同期タイムスタンプ更新
        if (canFetchGmail) updateSyncTimestamp('email').catch(() => {});
        if (canFetchSlack) updateSyncTimestamp('slack').catch(() => {});
        if (canFetchChatwork) updateSyncTimestamp('chatwork').catch(() => {});
      }
    } else {
      // === デモモード or 強制更新 ===
      allMessages = await fetchAllFromAPIs(isDemo, canFetchGmail, canFetchSlack, canFetchChatwork, limit, page, userId);

      // DB保存＆同期更新（awaitして既読チェック前にDB反映を確実にする）
      if (isSupabaseConfigured() && allMessages.length > 0) {
        try {
          await saveMessages(allMessages);
        } catch (err) {
          console.error('[Messages API] Supabase保存エラー:', err);
        }
        runSpamCheck(allMessages).catch(() => {});
        if (canFetchGmail) updateSyncTimestamp('email').catch(() => {});
        if (canFetchSlack) updateSyncTimestamp('slack').catch(() => {});
        if (canFetchChatwork) updateSyncTimestamp('chatwork').catch(() => {});
      }

      // Phase 38: DBに保存済みの送信メッセージを統合（外部APIには含まれないため）
      if (isSupabaseConfigured() && !isDemo) {
        try {
          const sentResult = await loadMessages({ direction: 'sent', limit: 100 });
          if (sentResult.messages.length > 0) {
            const existingIds = new Set(allMessages.map((m) => m.id));
            const newSentMessages = sentResult.messages.filter((m) => !existingIds.has(m.id));
            if (newSentMessages.length > 0) {
              allMessages = [...allMessages, ...newSentMessages];
              console.log(`[Messages API] Phase 38: 送信メッセージ ${newSentMessages.length}件を統合`);
            }
          }
        } catch (e) {
          console.error('[Messages API] 送信メッセージ読み込みエラー:', e);
        }
      }
    }

    // Phase 25: DB上の既読状態を反映
    if (isSupabaseConfigured() && allMessages.length > 0) {
      const supabaseRead = createServerClient();
      if (supabaseRead) {
        try {
          const messageIds = allMessages.map((m) => m.id);
          const readIdSet = new Set<string>();
          for (let i = 0; i < messageIds.length; i += 50) {
            const batch = messageIds.slice(i, i + 50);
            const { data: readRows } = await supabaseRead
              .from('inbox_messages')
              .select('id')
              .in('id', batch)
              .eq('is_read', true);
            if (readRows) {
              readRows.forEach((r) => readIdSet.add(r.id));
            }
          }
          if (readIdSet.size > 0) {
            allMessages = allMessages.map((m) =>
              readIdSet.has(m.id)
                ? { ...m, isRead: true, status: 'read' as const }
                : m
            );
          }
        } catch (e) {
          console.error('[Messages API] DB既読チェックエラー:', e);
        }
      }
    }

    // 購読チャネルでフィルタリング（登録あり→絞り込み、登録なし→全表示）
    if (!isDemo) {
      const channelToServiceMap: Record<string, string> = {
        email: 'gmail',
        slack: 'slack',
        chatwork: 'chatwork',
      };
      // 購読チャネルが1つでも登録されているサービスのみ絞り込む
      // 未登録のサービスはトークンがあれば全表示
      allMessages = allMessages.filter((msg) => {
        const serviceName = channelToServiceMap[msg.channel] || msg.channel;
        const subs = subscriptions[serviceName];
        // 購読チャネルが登録されていない場合 → 全表示（トークンで取得済みなので表示する）
        if (!subs || subs.length === 0) return true;
        // 購読チャネルが登録されている場合 → 登録チャネルのみ表示
        // ※ Slack/Chatworkは個別チャネルIDでフィルタ可能だが、
        //   現状はサービス単位の購読なので true を返す
        return true;
      });
    }

    // Phase 25: 日付範囲フィルタ（API全量取得モードの場合のみ）
    if (!isDemo && forceRefresh) {
      const now = new Date();
      const rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() - (page - 1) * 30);
      const rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - page * 30);

      allMessages = allMessages.filter((msg) => {
        const msgDate = new Date(msg.timestamp);
        if (page === 1) return msgDate >= rangeStart;
        return msgDate >= rangeStart && msgDate < rangeEnd;
      });
    }

    // 時系列ソート
    allMessages.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

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

    // Phase 26: spam_flagをmetadataに読み込み（DBから）
    if (isSupabaseConfigured() && allMessages.length > 0) {
      const supabase = createServerClient();
      if (supabase) {
        try {
          const emailIds = allMessages.filter((m) => m.channel === 'email').map((m) => m.id);
          if (emailIds.length > 0) {
            for (let i = 0; i < emailIds.length; i += 50) {
              const batch = emailIds.slice(i, i + 50);
              const { data: flagRows } = await supabase
                .from('inbox_messages')
                .select('id, metadata')
                .in('id', batch)
                .not('metadata->spam_flag', 'is', null);

              if (flagRows) {
                const flagMap = new Map(flagRows.map((r) => [r.id, r.metadata?.spam_flag]));
                allMessages = allMessages.map((m) => {
                  const flag = flagMap.get(m.id);
                  if (flag) {
                    return { ...m, metadata: { ...m.metadata, spam_flag: flag } };
                  }
                  return m;
                });
              }
            }
          }
        } catch {
          // spam_flag読み込み失敗は無視
        }
      }
    }

    const pagination = {
      page,
      limit,
      hasMore: allMessages.length >= limit,
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

// ========================================
// ヘルパー: 全APIからメッセージを取得
// ========================================
async function fetchAllFromAPIs(
  isDemo: boolean,
  hasGmailSubs: boolean,
  hasSlackSubs: boolean,
  hasChatworkSubs: boolean,
  limit: number,
  page: number,
  userId: string,
): Promise<UnifiedMessage[]> {
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

  return [...emails, ...slackMessages, ...chatworkMessages];
}
