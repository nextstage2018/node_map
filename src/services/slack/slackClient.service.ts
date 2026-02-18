import { UnifiedMessage } from '@/lib/types';

/**
 * Slack連携サービス
 * Slack APIを使用してメッセージの取得・送信を行う
 */

function getToken(): string {
  return process.env.SLACK_BOT_TOKEN || '';
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

    // 全チャンネルのメッセージを取得
    const channelsResult = await client.conversations.list({
      types: 'public_channel,private_channel,im',
      limit: 20,
    });

    const messages: UnifiedMessage[] = [];
    const channels = channelsResult.channels || [];

    for (const channel of channels.slice(0, 10)) {
      try {
        const historyResult = await client.conversations.history({
          channel: channel.id!,
          limit: Math.ceil(limit / channels.length),
        });

        for (const msg of historyResult.messages || []) {
          if (msg.subtype) continue; // bot messages etc.

          let userName = 'Unknown';
          try {
            const userInfo = await client.users.info({ user: msg.user! });
            userName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
          } catch {
            // user info fetch failed
          }

          messages.push({
            id: `slack-${channel.id}-${msg.ts}`,
            channel: 'slack',
            channelIcon: '💬',
            from: {
              name: userName,
              address: msg.user || '',
            },
            body: msg.text || '',
            timestamp: new Date(Number(msg.ts) * 1000).toISOString(),
            isRead: false,
            status: 'unread' as const,
            threadId: msg.thread_ts || undefined,
            metadata: {
              slackChannel: channel.id,
              slackChannelName: channel.name || 'DM',
              slackTs: msg.ts,
              slackThreadTs: msg.thread_ts,
            },
          });
        }
      } catch {
        // channel history fetch failed
      }
    }

    return messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Slack取得エラー:', error);
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
    console.error('Slack送信エラー:', error);
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
