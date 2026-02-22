// src/app/api/messages/send/route.ts
// BugFix③: メール送信時のアドレス形式バリデーション追加

import { NextRequest, NextResponse } from 'next/server';
import type { ChannelType, UnifiedMessage } from '@/lib/types';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';

// BugFix③: メールアドレス簡易バリデーション
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channel, body: messageBody, to, cc, subject, slackChannel, chatworkRoomId } = body;

    if (!channel || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'channel と body は必須です' },
        { status: 400 }
      );
    }

    let result: { messageId?: string } = {};
    let toAddresses: string[] = [];

    switch (channel as ChannelType) {
      case 'email': {
        toAddresses = Array.isArray(to) ? to.filter((addr: string) => addr && addr.trim() !== '') : [];

        // 宛先必須チェック
        if (toAddresses.length === 0) {
          return NextResponse.json(
            { success: false, error: '送信先メールアドレスが指定されていません' },
            { status: 400 }
          );
        }

        // BugFix③: メールアドレスバリデーション
        const invalidEmails = toAddresses.filter((addr: string) => !isValidEmail(addr));
        if (invalidEmails.length > 0) {
          return NextResponse.json(
            { success: false, error: `無効なメールアドレスが含まれています: ${invalidEmails.join(', ')}` },
            { status: 400 }
          );
        }

        // CCもバリデーション
        const ccAddresses = Array.isArray(cc) ? cc.filter((addr: string) => addr && addr.trim() !== '') : [];
        const invalidCc = ccAddresses.filter((addr: string) => !isValidEmail(addr));
        if (invalidCc.length > 0) {
          return NextResponse.json(
            { success: false, error: `無効なCCメールアドレスが含まれています: ${invalidCc.join(', ')}` },
            { status: 400 }
          );
        }

        result = await sendEmail({
          to: toAddresses,
          cc: ccAddresses,
          subject: subject || '(件名なし)',
          body: messageBody,
        });
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
        result = await sendSlackMessage({
          channel: cleanChannel,
          text: messageBody,
        });
        break;
      }

      case 'chatwork': {
        if (!chatworkRoomId) {
          return NextResponse.json(
            { success: false, error: 'ChatworkルームIDが指定されていません' },
            { status: 400 }
          );
        }
        result = await sendChatworkMessage({
          roomId: chatworkRoomId,
          body: messageBody,
        });
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `未対応のチャネル: ${channel}` },
          { status: 400 }
        );
    }

    // 送信済みメッセージをDBに保存
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
      data: { message: 'メッセージを送信しました', messageId: result.messageId },
    });
  } catch (error) {
    console.error('Send API error:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの送信に失敗しました' },
      { status: 500 }
    );
  }
}
