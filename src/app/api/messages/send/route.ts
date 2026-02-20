import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';
import type { UnifiedMessage, ChannelType } from '@/lib/types';

/**
 * 新規メッセージ送信API
 * POST /api/messages/send
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel } = body;

    let success = false;

    switch (channel) {
      case 'email': {
        const { to, cc, subject, body: emailBody } = body;
        if (!to || to.length === 0) {
          return NextResponse.json(
            { success: false, error: '宛先（To）が指定されていません' },
            { status: 400 }
          );
        }
        success = await sendEmail(to, subject || '', emailBody, undefined, cc);
        break;
      }

      case 'slack': {
        const { slackChannel, body: slackBody } = body;
        if (!slackChannel) {
          return NextResponse.json(
            { success: false, error: 'Slackチャンネルが指定されていません' },
            { status: 400 }
          );
        }
        // チャンネル名から#を除去
        const channelName = slackChannel.replace(/^#/, '');
        success = await sendSlackMessage(channelName, slackBody);
        break;
      }

      case 'chatwork': {
        const { chatworkRoomId, body: cwBody } = body;
        if (!chatworkRoomId) {
          return NextResponse.json(
            { success: false, error: 'ChatworkルームIDが指定されていません' },
            { status: 400 }
          );
        }
        success = await sendChatworkMessage(chatworkRoomId, cwBody);
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: '不明なチャネルです' },
          { status: 400 }
        );
    }

    if (success) {
      // 送信メッセージをSupabaseに保存（永続化）
      try {
        const now = new Date().toISOString();
        const sentMessage: UnifiedMessage = {
          id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel: channel as ChannelType,
          channelIcon: channel === 'email' ? '📧' : channel === 'slack' ? '💬' : '🔵',
          from: { name: 'あなた', address: 'me' },
          to: channel === 'email' ? (body.to || []).map((addr: string) => ({ name: addr, address: addr })) : undefined,
          cc: channel === 'email' && body.cc ? body.cc.map((addr: string) => ({ name: addr, address: addr })) : undefined,
          subject: body.subject || undefined,
          body: channel === 'email' ? body.body : (body.slackBody || body.body || body.cwBody || ''),
          timestamp: now,
          isRead: true,
          status: 'replied',
          metadata: {
            slackChannel: body.slackChannel || undefined,
            slackChannelName: body.slackChannel ? body.slackChannel.replace(/^#/, '') : undefined,
            chatworkRoomId: body.chatworkRoomId || undefined,
          },
        };
        await saveMessages([sentMessage]);
      } catch (saveErr) {
        console.error('送信メッセージ保存エラー（送信自体は成功）:', saveErr);
      }

      return NextResponse.json({ success: true, data: { sent: true } });
    } else {
      return NextResponse.json(
        { success: false, error: '送信に失敗しました' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('新規メッセージ送信エラー:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの送信に失敗しました' },
      { status: 500 }
    );
  }
}
