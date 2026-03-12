// Phase 26+: メッセージ取得API — 全チャネル受信→DB保存→購読フィルタ表示
// 高速化: DB読み出し優先 + 差分取得バックグラウンド化 + クエリ並列化 + 重複DB問い合わせ削除
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
import { EMAIL_ENABLED } from '@/lib/constants';

// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';

// ========================================
// 購読チャネル + トークン + 同期状態を一括取得（DB問い合わせを最小化）
// ========================================
interface ChannelCapability {
  subscriptions: Record<string, string[]>;
  canFetch: { gmail: boolean; slack: boolean; chatwork: boolean };
  syncStates: { email: SyncState; slack: SyncState; chatwork: SyncState };
}

interface SyncState {
  last_sync_at: string | null;
  initial_sync_done: boolean;
}

async function getChannelCapabilities(userId: string): Promise<ChannelCapability> {
  const supabase = createServerClient();
  const defaultSyncState: SyncState = { last_sync_at: null, initial_sync_done: false };

  if (!supabase) {
    return {
      subscriptions: { gmail: [], slack: [], chatwork: [] },
      canFetch: { gmail: false, slack: false, chatwork: false },
      syncStates: { email: defaultSyncState, slack: defaultSyncState, chatwork: defaultSyncState },
    };
  }

  // 環境変数トークンはオーナーユーザー専用（他ユーザーはDBトークンのみ）
  const envTokenOwnerId = process.env.ENV_TOKEN_OWNER_ID || '';
  const isEnvTokenOwner = envTokenOwnerId ? (userId === envTokenOwnerId) : true;
  const envGmail = isEnvTokenOwner && !!process.env.EMAIL_USER;
  const envSlack = isEnvTokenOwner && !!process.env.SLACK_BOT_TOKEN;
  const envChatwork = isEnvTokenOwner && !!process.env.CHATWORK_API_TOKEN;

  // 全DBクエリを並列実行（1回のawaitで全部取得）
  const [subsResult, tokenResult, emailSyncResult, slackSyncResult, cwSyncResult] = await Promise.all([
    // 購読チャネル
    supabase
      .from('user_channel_subscriptions')
      .select('service_name, channel_id')
      .eq('user_id', userId)
      .eq('is_active', true),
    // トークン（環境変数で全チャネル揃っていなければDBチェック）
    (!envGmail || !envSlack || !envChatwork)
      ? supabase
          .from('user_service_tokens')
          .select('service_name')
          .eq('user_id', userId)
          .eq('is_active', true)
      : Promise.resolve({ data: [] as { service_name: string }[], error: null }),
    // 同期状態（3チャネル分）
    supabase.from('inbox_sync_state').select('last_sync_at, initial_sync_done').eq('channel', 'email').single(),
    supabase.from('inbox_sync_state').select('last_sync_at, initial_sync_done').eq('channel', 'slack').single(),
    supabase.from('inbox_sync_state').select('last_sync_at, initial_sync_done').eq('channel', 'chatwork').single(),
  ]);

  // 購読チャネル
  const subscriptions: Record<string, string[]> = { gmail: [], slack: [], chatwork: [] };
  if (subsResult.data) {
    for (const sub of subsResult.data) {
      if (subscriptions[sub.service_name]) {
        subscriptions[sub.service_name].push(sub.channel_id);
      }
    }
  }

  // トークン判定
  const dbTokenServices = new Set((tokenResult.data || []).map((t) => t.service_name));
  const canFetch = {
    // Phase B: EMAIL_ENABLED=false でメール取得を無効化
    gmail: EMAIL_ENABLED && (envGmail || dbTokenServices.has('gmail')),
    slack: envSlack || dbTokenServices.has('slack'),
    chatwork: envChatwork || dbTokenServices.has('chatwork'),
  };

  // 同期状態
  const syncStates = {
    email: {
      last_sync_at: emailSyncResult.data?.last_sync_at || null,
      initial_sync_done: emailSyncResult.data?.initial_sync_done || false,
    },
    slack: {
      last_sync_at: slackSyncResult.data?.last_sync_at || null,
      initial_sync_done: slackSyncResult.data?.initial_sync_done || false,
    },
    chatwork: {
      last_sync_at: cwSyncResult.data?.last_sync_at || null,
      initial_sync_done: cwSyncResult.data?.initial_sync_done || false,
    },
  };

  return { subscriptions, canFetch, syncStates };
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
// 差分取得（バックグラウンド）— タイムアウト付き
// ========================================
async function fetchDiffInBackground(
  canFetch: { gmail: boolean; slack: boolean; chatwork: boolean },
  syncStates: { email: SyncState; slack: SyncState; chatwork: SyncState },
  userId: string,
): Promise<void> {
  try {
    const newMessages: UnifiedMessage[] = [];
    const fetchPromises: Promise<void>[] = [];

    // Gmail差分取得: EMAIL_ENABLED=false で完全スキップ
    // canFetch.gmailは既にEMAIL_ENABLEDフラグ反映済みだが明示的にガード
    if (EMAIL_ENABLED && canFetch.gmail && syncStates.email.last_sync_at) {
      fetchPromises.push(
        fetchEmails(20, 1).then(emails => {
          const sinceDate = new Date(syncStates.email.last_sync_at!);
          newMessages.push(...emails.filter(e => new Date(e.timestamp) > sinceDate));
        }).catch(e => console.error('[Messages API] Gmail差分取得エラー:', e))
      );
    }
    if (canFetch.slack && syncStates.slack.last_sync_at) {
      fetchPromises.push(
        fetchSlackMessages(20, userId).then(msgs => {
          const sinceDate = new Date(syncStates.slack.last_sync_at!);
          newMessages.push(...msgs.filter(s => new Date(s.timestamp) > sinceDate));
        }).catch(e => console.error('[Messages API] Slack差分取得エラー:', e))
      );
    }
    if (canFetch.chatwork && syncStates.chatwork.last_sync_at) {
      fetchPromises.push(
        fetchChatworkMessages(20).then(msgs => {
          const sinceDate = new Date(syncStates.chatwork.last_sync_at!);
          newMessages.push(...msgs.filter(c => new Date(c.timestamp) > sinceDate));
        }).catch(e => console.error('[Messages API] Chatwork差分取得エラー:', e))
      );
    }

    if (fetchPromises.length === 0) return;

    await Promise.all(fetchPromises);

    if (newMessages.length > 0) {
      console.log(`[Messages API] バックグラウンド差分取得 ${newMessages.length}件の新着`);
      await saveMessages(newMessages);
      // キャッシュ無効化（次のリクエストでDB最新を返す）
      cache.invalidateByPrefix('messages:');
      runSpamCheck(newMessages).catch(() => {});
    }

    // 同期タイムスタンプ更新（Gmail除外: EMAIL_ENABLED=falseのとき不要）
    if (EMAIL_ENABLED && canFetch.gmail) updateSyncTimestamp('email').catch(() => {});
    if (canFetch.slack) updateSyncTimestamp('slack').catch(() => {});
    if (canFetch.chatwork) updateSyncTimestamp('chatwork').catch(() => {});
  } catch (e) {
    console.error('[Messages API] バックグラウンド差分取得エラー:', e);
  }
}

// ========================================
// GET: メッセージ一覧（高速化版）
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
          .eq('user_id', userId)
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

    const isDemo = !isSupabaseConfigured();

    // ========================================
    // 全チャネル情報を一括並列取得（購読+トークン+同期状態）
    // ========================================
    const { subscriptions, canFetch, syncStates } = isDemo
      ? {
          subscriptions: { gmail: [], slack: [], chatwork: [] } as Record<string, string[]>,
          canFetch: { gmail: true, slack: true, chatwork: true },
          syncStates: {
            email: { last_sync_at: null, initial_sync_done: false },
            slack: { last_sync_at: null, initial_sync_done: false },
            chatwork: { last_sync_at: null, initial_sync_done: false },
          },
        }
      : await getChannelCapabilities(userId);

    // ========================================
    // メッセージ取得ロジック
    // ========================================
    let allMessages: UnifiedMessage[] = [];

    if (!isDemo && !forceRefresh) {
      // === 差分取得モード ===
      const allSynced = (
        (!canFetch.gmail || syncStates.email.initial_sync_done) &&
        (!canFetch.slack || syncStates.slack.initial_sync_done) &&
        (!canFetch.chatwork || syncStates.chatwork.initial_sync_done)
      );

      if (allSynced) {
        // DB読み出し（メイン — これだけ待つ。高速）
        console.log('[Messages API] DBから読み出し（差分取得モード）');
        const now = new Date();
        const rangeStart = new Date(now);
        rangeStart.setDate(rangeStart.getDate() - page * 30);

        const dbResult = await loadMessages({
          since: rangeStart.toISOString(),
          limit: 200,
          direction: directionFilter,
          userId,
          excludeEmail: true, // Gmail排除: Slack/Chatworkのみ取得
        });
        allMessages = dbResult.messages;

        // 日付範囲フィルタ
        if (page > 1) {
          const rangeEnd = new Date(now);
          rangeEnd.setDate(rangeEnd.getDate() - (page - 1) * 30);
          allMessages = allMessages.filter((msg) => {
            const msgDate = new Date(msg.timestamp);
            return msgDate >= rangeStart && msgDate < rangeEnd;
          });
        }

        // 差分取得はバックグラウンド（レスポンスをブロックしない）
        // 新着は次回リクエスト時にDBから読める。キャッシュも無効化される
        fetchDiffInBackground(canFetch, syncStates, userId).catch(() => {});

      } else {
        // === 初回同期モード ===
        console.log('[Messages API] 初回同期（全量取得）— トークンベース');
        allMessages = await fetchAllFromAPIs(isDemo, canFetch.gmail, canFetch.slack, canFetch.chatwork, limit, page, userId);

        // DBに保存（awaitして既読状態をDBに確実に反映）
        if (allMessages.length > 0) {
          try {
            await saveMessages(allMessages, userId);
          } catch (err) {
            console.error('[Messages API] Supabase保存エラー:', err);
          }
          runSpamCheck(allMessages).catch(() => {});
        }

        // 同期タイムスタンプ更新（Gmail除外: EMAIL_ENABLED=falseのとき不要）
        if (EMAIL_ENABLED && canFetch.gmail) updateSyncTimestamp('email').catch(() => {});
        if (canFetch.slack) updateSyncTimestamp('slack').catch(() => {});
        if (canFetch.chatwork) updateSyncTimestamp('chatwork').catch(() => {});
      }
    } else {
      // === デモモード or 強制更新 ===
      allMessages = await fetchAllFromAPIs(isDemo, canFetch.gmail, canFetch.slack, canFetch.chatwork, limit, page, userId);

      // DB保存＆同期更新（awaitして既読チェック前にDB反映を確実にする）
      if (isSupabaseConfigured() && allMessages.length > 0) {
        try {
          await saveMessages(allMessages, userId);
        } catch (err) {
          console.error('[Messages API] Supabase保存エラー:', err);
        }
        runSpamCheck(allMessages).catch(() => {});
        if (EMAIL_ENABLED && canFetch.gmail) updateSyncTimestamp('email').catch(() => {});
        if (canFetch.slack) updateSyncTimestamp('slack').catch(() => {});
        if (canFetch.chatwork) updateSyncTimestamp('chatwork').catch(() => {});
      }

      // Phase 38: DBに保存済みの送信メッセージを統合（外部APIには含まれないため）
      if (isSupabaseConfigured() && !isDemo) {
        try {
          const sentResult = await loadMessages({ direction: 'sent', limit: 100, userId, excludeEmail: true });
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

    // DB既読状態の反映（初回同期 or 強制更新のときだけ必要）
    // ※差分取得モードではloadMessagesがDB値（正しいis_read）を返すので不要
    if (isSupabaseConfigured() && allMessages.length > 0 && (forceRefresh || isDemo)) {
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

  // Phase B: EMAIL_ENABLED=false でメール取得スキップ
  if (EMAIL_ENABLED && (isDemo || hasGmailSubs)) {
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
