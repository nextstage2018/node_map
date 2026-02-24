import { UnifiedMessage, Attachment } from '@/lib/types';
import { createServerClient } from '@/lib/supabase';

/**
 * Slack連携サービス
 * Slack Web APIを使用してメッセージの取得・送信を行う
 *
 * Phase 15: 実API対応改修
 * Phase 25: DBからトークン取得に変更 + userId対応
 */

function getToken(): string {
  return process.env.SLACK_BOT_TOKEN || '';
}

/**
 * Phase 25: DBからSlackトークンを取得（ユーザーのOAuth接続トークン）
 * userId を渡すことで正確にトークンを特定する
 */
async function getTokenFromDB(userId?: string): Promise<string> {
  const supabase = createServerClient();
  if (!supabase) {
    console.log('[Slack] createServerClient() が null — 環境変数フォールバック');
    return getToken();
  }

  try {
    let query = supabase
      .from('user_service_tokens')
      .select('token_data')
      .eq('service_name', 'slack')
      .eq('is_active', true);

    // userId がある場合はフィルタ（available APIと同じパターン）
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.limit(1).single();

    if (error) {
      console.error('[Slack] トークンDB取得エラー:', error.message);
      return getToken();
    }

    // access_token または bot_token を取得（available APIと同じ）
    const token = data?.token_data?.access_token || data?.token_data?.bot_token;
    if (token) {
      console.log(`[Slack] DBからトークン取得成功 (${token.substring(0, 10)}...)`);
      return token;
    }

    console.warn('[Slack] token_data にaccess_tokenが見つかりません:', Object.keys(data?.token_data || {}));
  } catch (e) {
    console.error('[Slack] トークンDB取得例外:', e);
  }
  return getToken();
}

// ユーザー情報キャッシュ（サーバーサイド、プロセス内メモリ）
const userCache: Map<string, { name: string; realName: string }> = new Map();

/**
 * Slackユーザー情報を取得（キャッシュ付き）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getUserInfo(
  client: any,
  userId: string
): Promise<{ name: string; realName: string }> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const result = await client.users.info({ user: userId });
    const info = {
      name: result.user?.name || 'Unknown',
      realName: result.user?.real_name || result.user?.name || 'Unknown',
    };
    userCache.set(userId, info);
    return info;
  } catch (err) {
    console.warn(`[Slack] ユーザー情報取得失敗 (${userId}):`, err);
    const fallback = { name: userId, realName: userId };
    userCache.set(userId, fallback);
    return fallback;
  }
}

/**
 * Slack書式をプレーンテキストに変換
 * <@U12345> → @ユーザー名
 * <#C12345|channel-name> → #channel-name
 * <https://...|表示テキスト> → 表示テキスト (URL)
 * <https://...> → URL
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function formatSlackText(text: string, client: any): Promise<string> {
  if (!text) return '';

  let formatted = text;

  // <@U12345> → @ユーザー名
  const userMentions = formatted.match(/<@(U[A-Z0-9]+)>/g);
  if (userMentions) {
    for (const mention of userMentions) {
      const userId = mention.replace(/<@|>/g, '');
      const userInfo = await getUserInfo(client, userId);
      formatted = formatted.replace(mention, `@${userInfo.realName}`);
    }
  }

  // <#C12345|channel-name> → #channel-name
  formatted = formatted.replace(/<#C[A-Z0-9]+\|([^>]+)>/g, '#$1');
  // <#C12345> (名前なし) → #チャンネル
  formatted = formatted.replace(/<#C[A-Z0-9]+>/g, '#チャンネル');

  // <https://...|表示テキスト> → 表示テキスト
  formatted = formatted.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2');
  // <https://...> → URL
  formatted = formatted.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // <!channel>, <!here>, <!everyone> → @channel, @here, @everyone
  formatted = formatted.replace(/<!channel>/g, '@channel');
  formatted = formatted.replace(/<!here>/g, '@here');
  formatted = formatted.replace(/<!everyone>/g, '@everyone');

  // &amp; &lt; &gt; をデコード
  formatted = formatted.replace(/&amp;/g, '&');
  formatted = formatted.replace(/&lt;/g, '<');
  formatted = formatted.replace(/&gt;/g, '>');

  return formatted;
}

/**
 * Slackファイルを添付ファイル型に変換
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertSlackFile(file: any): Attachment {
  const mimeType = (file.mimetype as string) || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const fileId = file.id || Math.random().toString(36);

  // Slackファイルはトークン認証が必要なため、プロキシ経由でアクセス
  const proxyBase = `/api/attachments/slack?fileId=${fileId}`;

  return {
    id: `slack-file-${fileId}`,
    filename: file.name || file.title || 'file',
    mimeType,
    size: file.size || 0,
    isInline: isImage,
    // プロキシ経由で画像プレビュー取得
    previewUrl: isImage && (file.thumb_360 || file.thumb_160 || file.thumb_80)
      ? `${proxyBase}&type=thumb`
      : undefined,
    downloadUrl: (file.url_private_download || file.url_private)
      ? `${proxyBase}&type=download`
      : undefined,
  } as Attachment;
}

/**
 * Slackメッセージを取得し、UnifiedMessage形式に変換
 * @param limit 取得件数上限
 * @param userId 認証ユーザーID（DBトークン取得に使用）
 */
export async function fetchSlackMessages(limit: number = 50, userId?: string): Promise<UnifiedMessage[]> {
  // Phase 25: まずDBからトークン取得、なければ環境変数
  const token = await getTokenFromDB(userId);

  if (!token) {
    console.log('[Slack] トークン無し → デモデータ返却');
    return getDemoSlackMessages();
  }

  try {
    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    // チャンネル一覧取得（public/private/DM/グループDM）
    const channelsResult = await client.conversations.list({
      types: 'public_channel,private_channel,mpim,im',
      limit: 100,
      exclude_archived: true,
    });

    const messages: UnifiedMessage[] = [];
    const channels = channelsResult.channels || [];
    const perChannelLimit = Math.max(5, Math.ceil(limit / Math.max(channels.length, 1)));

    console.log(`[Slack] ${channels.length}チャンネル検出、各${perChannelLimit}件取得`);

    if (channels.length === 0) {
      console.warn('[Slack] チャンネルが0件です。Botがチャンネルに参加しているか確認してください。');
      return [];
    }

    // Bot自身のIDを取得（自分のメッセージ判定用）
    let botUserId = '';
    try {
      const authResult = await client.auth.test();
      botUserId = (authResult.user_id as string) || '';
      console.log(`[Slack] auth.test成功: user_id=${botUserId}`);
    } catch (authErr) {
      console.warn('[Slack] auth.test失敗:', authErr);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const channel of channels.slice(0, 20)) {
      try {
        const historyResult = await client.conversations.history({
          channel: channel.id!,
          limit: perChannelLimit,
        });

        // Phase 25: チャンネルの最終既読タイムスタンプを取得
        let lastRead = '0';
        try {
          const channelInfo = await client.conversations.info({ channel: channel.id! });
          lastRead = (channelInfo.channel as any)?.last_read || '0';
        } catch {
          // last_read取得失敗時は全て未読扱い
        }

        // DMの場合、相手の名前をチャンネル名として使用
        let channelDisplayName = channel.name || '';
        if (channel.is_im) {
          const dmUserId = channel.user;
          if (dmUserId) {
            const dmUser = await getUserInfo(client, dmUserId);
            channelDisplayName = `DM: ${dmUser.realName}`;
          } else {
            channelDisplayName = 'DM';
          }
        } else if (channel.is_mpim) {
          channelDisplayName = channel.name?.replace('mpdm-', '').replace(/--/g, ', ') || 'グループDM';
        }

        for (const msg of historyResult.messages || []) {
          // bot_message, channel_join等のサブタイプはスキップ（file_shareは残す）
          if (msg.subtype && msg.subtype !== 'file_share') continue;

          // ユーザー情報取得
          const msgUserId = msg.user || '';
          const userInfo = msgUserId ? await getUserInfo(client, msgUserId) : { name: 'Unknown', realName: 'Unknown' };

          // 本文のSlack書式を整形
          const body = await formatSlackText(msg.text || '', client);

          // 添付ファイル
          const attachments: Attachment[] = [];
          if (msg.files && Array.isArray(msg.files)) {
            for (const file of msg.files) {
              attachments.push(convertSlackFile(file));
            }
          }

          // リアクション取得
          const reactions: { name: string; count: number }[] = [];
          if (msg.reactions && Array.isArray(msg.reactions)) {
            for (const r of msg.reactions) {
              reactions.push({
                name: (r as { name?: string }).name || '?',
                count: ((r as { count?: number }).count) || 1,
              });
            }
          }

          messages.push({
            id: `slack-${channel.id}-${msg.ts}`,
            channel: 'slack',
            channelIcon: '💬',
            from: {
              name: userInfo.realName,
              address: msgUserId,
            },
            body,
            attachments: attachments.length > 0 ? attachments : undefined,
            timestamp: new Date(Number(msg.ts) * 1000).toISOString(),
            isRead: msgUserId === botUserId || (msg.ts ? parseFloat(msg.ts) <= parseFloat(lastRead) : false),
            status: msgUserId === botUserId ? ('replied' as const) : ((msg.ts ? parseFloat(msg.ts) <= parseFloat(lastRead) : false) ? ('read' as const) : ('unread' as const)),
            threadId: msg.thread_ts || undefined,
            metadata: {
              slackChannel: channel.id,
              slackChannelName: channelDisplayName,
              slackTs: msg.ts,
              slackThreadTs: msg.thread_ts,
              reactions: reactions.length > 0 ? reactions : undefined,
            },
          });
        }

        successCount++;
      } catch (err: any) {
        errorCount++;
        const errMsg = err?.data?.error || err?.message || String(err);
        console.error(`[Slack] チャンネル ${channel.name || channel.id} エラー: ${errMsg}`);

        // not_in_channel の場合、Botをjoinさせる（publicチャンネルのみ）
        if (errMsg === 'not_in_channel' && !channel.is_im && !channel.is_mpim && !channel.is_private) {
          try {
            await client.conversations.join({ channel: channel.id! });
            console.log(`[Slack] チャンネル ${channel.name} にjoinしました。次回から取得可能です。`);
          } catch (joinErr) {
            console.warn(`[Slack] チャンネル ${channel.name} へのjoin失敗:`, joinErr);
          }
        }
      }
    }

    console.log(`[Slack] 完了: ${successCount}チャンネル成功, ${errorCount}チャンネルエラー, ${messages.length}メッセージ取得`);

    return messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error: any) {
    const errDetail = error?.data?.error || error?.message || String(error);
    console.error('[Slack] 接続エラー:', errDetail);
    return getDemoSlackMessages();
  }
}

/**
 * Slackメッセージを送信（返信）
 */
export async function sendSlackMessage(
  channelId: string,
  text: string,
  threadTs?: string,
  userId?: string
): Promise<boolean> {
  const token = await getTokenFromDB(userId);

  if (!token) {
    console.log('[デモモード] Slack送信:', { channelId, text, threadTs });
    return true;
  }

  try {
    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    await client.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
    });

    return true;
  } catch (error) {
    console.error('[Slack] 送信エラー:', error);
    return false;
  }
}

function getDemoSlackMessages(): UnifiedMessage[] {
  const now = new Date();
  return [
    {
      id: 'slack-demo-1',
      channel: 'slack',
      channelIcon: '💬',
      from: { name: '山田次郎', address: 'U001' },
      body: '#general で共有です。来週のスプリントレビューの日程を確定させたいのですが、木曜15時はいかがでしょうか？',
      timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { slackChannel: 'C001', slackChannelName: 'general', slackTs: '1700000001.000001' },
      threadMessages: [
        {
          id: 'slack-thread-1a',
          from: { name: '伊藤美咲', address: 'U003' },
          body: '木曜15時、OKです！',
          timestamp: new Date(now.getTime() - 10 * 60000).toISOString(),
          isOwn: false,
        },
        {
          id: 'slack-thread-1b',
          from: { name: 'あなた', address: 'U000' },
          body: '了解です。会議室はどこにしますか？',
          timestamp: new Date(now.getTime() - 8 * 60000).toISOString(),
          isOwn: true,
        },
        {
          id: 'slack-thread-1c',
          from: { name: '山田次郎', address: 'U001' },
          body: 'A会議室を押さえました :thumbsup:',
          timestamp: new Date(now.getTime() - 5 * 60000).toISOString(),
          isOwn: false,
        },
      ],
    },
    {
      id: 'slack-demo-2',
      channel: 'slack',
      channelIcon: '💬',
      from: { name: '高橋三郎', address: 'U002' },
      body: 'デザインレビューの件、Figmaのリンク共有します。特にヘッダー部分のフィードバックをお願いしたいです。',
      timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
      isRead: true,
      status: 'replied' as const,
      metadata: { slackChannel: 'C002', slackChannelName: 'design', slackTs: '1700000002.000001' },
    },
    {
      id: 'slack-demo-3',
      channel: 'slack',
      channelIcon: '💬',
      from: { name: '伊藤美咲', address: 'U003' },
      body: 'クライアントから追加要件が来ました。急ぎで対応方針を相談させてください。今日中にお時間ありますか？',
      timestamp: new Date(now.getTime() - 1.5 * 3600000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { slackChannel: 'C003', slackChannelName: 'project-x', slackTs: '1700000003.000001' },
      threadMessages: [
        {
          id: 'slack-thread-3a',
          from: { name: 'あなた', address: 'U000' },
          body: '了解しました。追加要件の詳細を共有してもらえますか？',
          timestamp: new Date(now.getTime() - 1 * 3600000).toISOString(),
          isOwn: true,
        },
      ],
    },
  ];
}
