// Phase 28: メッセージ返信API — ナレッジパイプライン統合
// 送信時にパイプラインを呼び出して自分の発信内容からキーワード抽出→ナレッジ登録

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();

    const { messageId, channel, to, subject, body: replyBody, threadId } = body;

    if (!replyBody || !channel) {
      return NextResponse.json(
        { success: false, error: '本文とチャネルは必須です' },
        { status: 400 }
      );
    }

    let sendResult: { success: boolean; messageId?: string } = { success: false };

    // チャネル別送信
    switch (channel) {
      case 'email':
        if (!to) {
          return NextResponse.json(
            { success: false, error: '宛先は必須です' },
            { status: 400 }
          );
        }
        sendResult = await sendEmail({
          to,
          subject: subject || 'Re:',
          body: replyBody,
          inReplyTo: messageId,
          userId,
        });
        break;

      case 'slack':
        sendResult = await sendSlackMessage({
          channelId: threadId || messageId,
          text: replyBody,
          threadTs: messageId,
          userId,
        });
        break;

      case 'chatwork':
        sendResult = await sendChatworkMessage({
          roomId: threadId || '',
          body: replyBody,
          userId,
        });
        break;

      default:
        return NextResponse.json(
          { success: false, error: `未対応のチャネル: ${channel}` },
          { status: 400 }
        );
    }

    if (!sendResult.success) {
      return NextResponse.json(
        { success: false, error: '送信に失敗しました' },
        { status: 500 }
      );
    }

    // DB上のステータスを更新（replied）
    const supabase = createServerClient();
    if (supabase && messageId) {
      try {
        await supabase
          .from('inbox_messages')
          .update({ status: 'replied', updated_at: new Date().toISOString() })
          .eq('id', messageId);
      } catch {
        // ステータス更新失敗は送信成功に影響させない
      }
    }

    // Phase 28: ナレッジパイプライン実行（送信内容からキーワード抽出）
    let knowledgeResult = null;
    try {
      const text = `${subject || ''} ${replyBody}`;
      knowledgeResult = await triggerKnowledgePipeline({
        text,
        trigger: 'message_send',
        sourceId: messageId || `reply-${Date.now()}`,
        sourceType: 'message',
        direction: 'sent',
        userId,
      });
    } catch (e) {
      console.error('[Reply API] ナレッジパイプラインエラー（送信は成功）:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        messageId: sendResult.messageId,
        channel,
      },
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
      } : null,
    });
  } catch (error) {
    console.error('返信エラー:', error);
    return NextResponse.json(
      { success: false, error: '返信の送信に失敗しました' },
      { status: 500 }
    );
  }
}
