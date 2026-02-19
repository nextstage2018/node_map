import { NextResponse, NextRequest } from 'next/server';
import { fetchEmails } from '@/services/email/emailClient.service';
import { fetchSlackMessages } from '@/services/slack/slackClient.service';
import { fetchChatworkMessages } from '@/services/chatwork/chatworkClient.service';
import { NodeService } from '@/services/nodemap/nodeClient.service';
import { UnifiedMessage } from '@/lib/types';
// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  try {
    // ページネーションパラメータ
    const searchParams = request.nextUrl.searchParams;
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    // 全チャネルからメッセージを並列取得
    const [emails, slackMessages, chatworkMessages] = await Promise.all([
      fetchEmails(limit, page),
      fetchSlackMessages(limit),
      fetchChatworkMessages(limit),
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

    // 【Phase 4】メッセージからキーワードを抽出してノードに蓄積（非同期・エラー無視）
    Promise.allSettled(
      allMessages.map((msg) =>
        NodeService.processText({
          text: `${msg.subject || ''} ${msg.body}`,
          sourceType: 'message',
          sourceId: msg.id,
          direction: msg.from.name === 'あなた' ? 'sent' : 'received',
          userId: 'demo-user',
        })
      )
    ).catch(() => {
      // キーワード抽出エラーはメッセージ取得に影響させない
    });

    return NextResponse.json({
      success: true,
      data: allMessages,
      pagination: {
        page,
        limit,
        hasMore: emails.length >= limit, // メールがlimit件あれば次ページがある可能性
      },
    });
  } catch (error) {
    console.error('メッセージ取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの取得に失敗しました' },
      { status: 500 }
    );
  }
}
