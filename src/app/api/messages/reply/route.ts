import { NextRequest, NextResponse } from 'next/server';
import { ReplyRequest } from '@/lib/types';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';

export async function POST(request: NextRequest) {
  try {
    const body: ReplyRequest = await request.json();
    const { channel, body: replyBody, metadata } = body;

    let success = false;

    switch (channel) {
      case 'email':
        success = await sendEmail(
          metadata.messageId ? '' : '', // TODO: extract reply-to from original
          `Re: `, // TODO: extract subject
          replyBody,
          metadata.messageId
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
