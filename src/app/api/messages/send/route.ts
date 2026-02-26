// src/app/api/messages/send/route.ts
// BugFix③: メール送信時のアドレス形式バリデーション追加
// BugFix④: 全サービスの引数形式・戻り値型修正

import { NextRequest, NextResponse } from 'next/server';
import type { ChannelType, UnifiedMessage } from '@/lib/types';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';
import { getServerUserId } from '@/lib/serverAuth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();
    const { channel, body: messageBody, to, cc, subject, slackChannel, chatworkRoomId } = body;

    if (!channel || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'channel と body は必須です' },
        { status: 400 }
      );
    }

    let toAddresses: string[] = [];

    switch (channel as ChannelType) {
      case 'email': {
        toAddresses = Array.isArray(to)
          ? to.filter((addr: string) => addr && addr.trim() !== '')
          : [];

        if (toAddresses.length === 0) {
          return NextResponse.json(
            { success: false, error: '送信先メールアドレスが指定されていません' },
            { status: 400 }
          );
        }

        const invalidEmails = toAddresses.filter((addr: string) => !isValidEmail(addr));
        if (invalidEmails.length > 0) {
          return NextResponse.json(
            { success: false, error: `無効なメールアドレスが含まれています: ${invalidEmails.join(', ')}` },
            { status: 400 }
          );
        }

        const ccAddresses = Array.isArray(cc)
          ? cc.filter((addr: string) => addr && addr.trim() !== '')
          : [];
        const invalidCc = ccAddresses.filter((addr: string) => !isValidEmail(addr));
        if (invalidCc.length > 0) {
          return NextResponse.json(
            { success: false, error: `無効なCCメールアドレスが含まれています: ${invalidCc.join(', ')}` },
            { status: 400 }
          );
        }

        // sendEmail(to, subject, body, inReplyTo?, cc?) => boolean
        const emailSuccess = await sendEmail(
          toAddresses,
          subject || '(件名なし)',
          messageBody,
          undefined,
          ccAddresses
        );
        if (!emailSuccess) {
          return NextResponse.json(
            { success: false, error: 'メール送信に失敗しました' },
            { status: 500 }
          );
        }
        break;
      }

      case 'slack': {
        if (!slackChannel) {
          return NextResponse.json(
            { success: false, error: 'Slackチャンネルが指定されていません' },
            { status: 400 }
          );
        }
        const cleanChannel = slackChannel.replace(/^#/, '');
        // sendSlackMessage(channelId, text, threadTs?) => boolean
        const slackSuccess = await sendSlackMessage(
          cleanChannel,
          messageBody
        );
        if (!slackSuccess) {
          return NextResponse.json(
            { success: false, error: 'Slack送信に失敗しました' },
            { status: 500 }
          );
        }
        break;
      }

      case 'chatwork': {
        if (!chatworkRoomId) {
          return NextResponse.json(
            { success: false, error: 'ChatworkルームIDが指定されていません' },
            { status: 400 }
          );
        }
        // sendChatworkMessage(roomId, body) => boolean
        const cwSuccess = await sendChatworkMessage(
          chatworkRoomId,
          messageBody
        );
        if (!cwSuccess) {
          return NextResponse.json(
            { success: false, error: 'Chatwork送信に失敗しました' },
            { status: 500 }
          );
        }
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `未対応のチャネル: ${channel}` },
          { status: 400 }
        );
    }

    const now = new Date().toISOString();
    const sentMessage: UnifiedMessage = {
      id: `sent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channel: channel as ChannelType,
      channelIcon: '',
      from: { name: 'あなた', address: userId || 'me' },
      to: toAddresses.map((addr: string) => ({ name: '', address: addr })),
      subject: subject || undefined,
      body: messageBody,
      timestamp: now,
      isRead: true,
      status: 'read',
      direction: 'sent', // Phase 38: 送信メッセージとして記録
      metadata: {
        slackChannel: slackChannel || undefined,
        chatworkRoomId: chatworkRoomId || undefined,
      },
    };

    try {
      await saveMessages([sentMessage]);
    } catch (saveErr) {
      console.error('Failed to save sent message:', saveErr);
    }

    return NextResponse.json({
      success: true,
      data: { message: 'メッセージを送信しました' },
    });
  } catch (error) {
    console.error('Send API error:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの送信に失敗しました' },
      { status: 500 }
    );
  }
}
