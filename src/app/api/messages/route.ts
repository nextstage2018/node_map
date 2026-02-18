import { NextResponse } from 'next/server';
import { fetchEmails } from '@/services/email/emailClient.service';
import { fetchSlackMessages } from '@/services/slack/slackClient.service';
import { fetchChatworkMessages } from '@/services/chatwork/chatworkClient.service';
import { UnifiedMessage } from '@/lib/types';

export async function GET() {
  try {
    // 全チャネルからメッセージを並列取得
    const [emails, slackMessages, chatworkMessages] = await Promise.all([
      fetchEmails(),
      fetchSlackMessages(),
      fetchChatworkMessages(),
    ]);

    // 全メッセージを統合して時系列ソート
    const allMessages: UnifiedMessage[] = [
      ...emails,
      ...slackMessages,
      ...chatworkMessages,
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({
      success: true,
      data: allMessages,
    });
  } catch (error) {
    console.error('メッセージ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの取得に失敗しました' },
      { status: 500 }
    );
  }
}
