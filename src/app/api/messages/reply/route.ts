// src/app/api/messages/reply/route.ts
// BugFix②: 宛先が空の場合はエラーレスポンスを返す
// BugFix③: メールアドレスバリデーション追加
// BugFix④: 全サービスの引数形式・戻り値型修正

import { NextRequest, NextResponse } from 'next/server';
import type { ChannelType, UnifiedMessage } from '@/lib/types';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, body: messageBody, to, cc, subject, metadata } = body;

    if (!channel || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'channel と body は必須です' },
        { status: 400 }
      );
    }

    const toAddresses: string[] = Array.isArray(to)
      ? to.filter((addr: string) => addr && addr.trim() !== '')
      : [];

    switch (channel as ChannelType) {
      case 'email': {
        if (toAddresses.length === 0) {
          return NextResponse.json(
            { success: false, error: '返信先メールアドレスが指定されていません' },
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

        // sendEmail(to, subject, body, inReplyTo?, cc?) => boolean
        const emailSuccess = await sendEmail(
          toAddresses,
          subject || 'Re:',
          messageBody,
          metadata?.messageId,
          cc || []
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
        const slackChannel = metadata?.slackChannel;
        if (!slackChannel) {
          return NextResponse.json(
            { success: false, error: 'Slackチャンネルが指定されていません' },
            { status: 400 }
          );
        }
        // sendSlackMessage(channelId, text, threadTs?) => boolean
        const slackSuccess = await sendSlackMessage(
          slackChannel,
          messageBody,
          metadata?.slackThreadTs
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
        const roomId = metadata?.chatworkRoomId;
        if (!roomId) {
          return NextResponse.json(
            { success: false, error: 'ChatworkルームIDが指定されていません' },
            { status: 400 }
          );
        }
        // sendChatworkMessage(roomId, body) => boolean
        const cwSuccess = await sendChatworkMessage(
          roomId,
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
      from: { name: 'Me', address: '' },
      to: toAddresses.map((addr: string) => ({ name: '', address: addr })),
      subject: subject || undefined,
      body: messageBody,
      timestamp: now,
      isRead: true,
      status: 'replied',
      metadata: metadata || {},
    };

    try {
      await saveMessages([sentMessage]);
    } catch (saveErr) {
      console.error('Failed to save sent message:', saveErr);
    }

    return NextResponse.json({
      success: true,
      data: {},
    });
  } catch (error) {
    console.error('Reply API error:', error);
    return NextResponse.json(
      { success: false, error: '返信の送信に失敗しました' },
      { status: 500 }
    );
  }
}
