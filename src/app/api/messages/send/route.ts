import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';

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
