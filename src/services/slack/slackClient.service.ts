import { UnifiedMessage, Attachment } from '@/lib/types';

/**
 * Slack連携サービス
 * Slack Web APIを使用してメッセージの取得・送信を行う
 *
 * Phase 15: 実API対応改修
 * - ユーザー情報キャッシュ（N+1問題解消）
 * - 添付ファイル・画像プレビュー対応
 * - Slack書式（<@U123>, <#C123|name>, リンク等）の整形
 * - DM・グループDM対応
 * - エラーハンドリング改善
 */

function getToken(): string {
  return process.env.SLACK_BOT_TOKEN || '';
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

  return {
    id: `slack-file-${file.id || Math.random().toString(36)}`,
    filename: file.name || file.title || 'file',
    mimeType,
    size: file.size || 0,
    isInline: isImage,
    // Slack画像のサムネイル（公開URL優先）
    previewUrl: isImage
      ? (file.thumb_360 || file.thumb_160 || file.thumb_80 || undefined)
      : undefined,
    downloadUrl: file.url_private_download || file.url_private || undefined,
  };
}

/**
 * Slackメッセージを取得し、UnifiedMessage形式に変換
 */
export async function fetchSlackMessages(limit: number = 50): Promise<UnifiedMessage[]> {
  const token = getToken();

  if (!token) {
    return getDemoSlackMessages();
  }

  try {
    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    // チャンネル一覧取得（public/private/DM）
    const channelsResult = await client.conversations.list({
      types: 'public_channel,private_channel,im',
      limit: 20,
      exclude_archived: true,
    });

    const messages: UnifiedMessage[] = [];
    const channels = channelsResult.channels || [];
    const perChannelLimit = Math.max(5, Math.ceil(limit / Math.max(channels.length, 1)));

    console.log(`[Slack] ${channels.length}チャンネル検出、各${perChannelLimit}件取得`);

    // Bot自身のIDを取得（自分のメッセージ判定用）
    let botUserId = '';
    try {
      const authResult = await client.auth.test();
      botUserId = (authResult.user_id as string) || '';
    } catch {
      // 取得失敗しても続行
    }

    for (const channel of channels.slice(0, 15)) {
      try {
        const historyResult = await client.conversations.history({
          channel: channel.id!,
          limit: perChannelLimit,
        });

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
          const userId = msg.user || '';
          const userInfo = userId ? await getUserInfo(client, userId) : { name: 'Unknown', realName: 'Unknown' };

          // 本文のSlack書式を整形
          const body = await formatSlackText(msg.text || '', client);

          // 添付ファイル
          const attachments: Attachment[] = [];
          if (msg.files && Array.isArray(msg.files)) {
            for (const file of msg.files) {
              attachments.push(convertSlackFile(file));
            }
          }

          messages.push({
            id: `slack-${channel.id}-${msg.ts}`,
            channel: 'slack',
            channelIcon: '💬',
            from: {
              name: userInfo.realName,
              address: userId,
            },
            body,
            attachments: attachments.length > 0 ? attachments : undefined,
            timestamp: new Date(Number(msg.ts) * 1000).toISOString(),
            isRead: userId === botUserId,
            status: userId === botUserId ? ('replied' as const) : ('unread' as const),
            threadId: msg.thread_ts || undefined,
            metadata: {
              slackChannel: channel.id,
              slackChannelName: channelDisplayName,
              slackTs: msg.ts,
              slackThreadTs: msg.thread_ts,
            },
          });
        }
      } catch (err) {
        console.error(`[Slack] チャンネル ${channel.name || channel.id} メッセージ取得エラー:`, err);
      }
    }

    console.log(`[Slack] 合計 ${messages.length} メッセージ取得`);

    return messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[Slack] 接続エラー:', error);
    return getDemoSlackMessages();
  }
}

/**
 * Slackメッセージを送信（返信）
 */
export async function sendSlackMessage(
  channelId: string,
  text: string,
  threadTs?: string
): Promise<boolean> {
  const token = getToken();

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
