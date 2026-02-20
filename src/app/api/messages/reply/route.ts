import { NextRequest, NextResponse } from 'next/server';
import { ReplyRequest, UnifiedMessage } from '@/lib/types';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';

export async function POST(request: NextRequest) {
  try {
    const body: ReplyRequest = await request.json();
    const { channel, body: replyBody, to, cc, subject, metadata } = body;

    let success = false;

    switch (channel) {
      case 'email':
        success = await sendEmail(
          to && to.length > 0 ? to : [''],
          subject || 'Re: ',
          replyBody,
          metadata.messageId,
          cc
        );
        break;

      case 'slack':
        if (metadata.slackChannel) {
          success = await sendSlackMessage(
            metadata.slackChannel,
            replyBody,
            metadata.slackThreadTs || metadata.slackTs
          );
        }
        break;

      case 'chatwork':
        if (metadata.chatworkRoomId) {
          success = await sendChatworkMessage(
            metadata.chatworkRoomId,
            replyBody
          );
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: '不明なチャネルです' },
          { status: 400 }
        );
    }

    if (success) {
      // 返信メッセージをSupabaseに保存（永続化）
      try {
        const now = new Date().toISOString();
        const sentMessage: UnifiedMessage = {
          id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel,
          channelIcon: channel === 'email' ? '📧' : channel === 'slack' ? '💬' : '🔵',
          from: { name: 'あなた', address: 'me' },
          to: to ? to.map((addr) => ({ name: addr, address: addr })) : undefined,
          cc: cc ? cc.map((addr) => ({ name: addr, address: addr })) : undefined,
          subject: subject || undefined,
          body: replyBody,
          timestamp: now,
          isRead: true,
          status: 'replied',
          threadId: metadata.messageId || undefined,
          metadata: {
            messageId: metadata.messageId,
            slackChannel: metadata.slackChannel,
            slackChannelName: metadata.slackChannelName,
            slackTs: metadata.slackTs,
            slackThreadTs: metadata.slackThreadTs,
            chatworkRoomId: metadata.chatworkRoomId,
            chatworkRoomName: metadata.chatworkRoomName,
          },
        };
        await saveMessages([sentMessage]);
      } catch (saveErr) {
        console.error('返信メッセージ保存エラー（送信自体は成功）:', saveErr);
      }

      return NextResponse.json({ success: true, data: { sent: true } });
    } else {
      return NextResponse.json(
        { success: false, error: '送信に失敗しました' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('返信送信エラー:', error);
    return NextResponse.json(
      { success: false, error: '返信の送信に失敗しました' },
      { status: 500 }
    );
  }
}
