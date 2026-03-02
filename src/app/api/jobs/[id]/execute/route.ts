// Phase B拡張: ジョブ実行API
// 承認済みジョブを実際に実行する（返信送信、日程調整メール送信など）
// POST /api/jobs/[id]/execute

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { sendEmail } from '@/services/email/emailClient.service';
import { sendSlackMessage } from '@/services/slack/slackClient.service';
import { sendChatworkMessage } from '@/services/chatwork/chatworkClient.service';
import { saveMessages } from '@/services/inbox/inboxStorage.service';
import type { UnifiedMessage, ChannelType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();

    // ジョブ取得
    const { data: job, error: fetchError } = await sb
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // ステータス確認（pending or approved のみ実行可能）
    if (!['pending', 'approved'].includes(job.status)) {
      return NextResponse.json(
        { error: `Job status '${job.status}' cannot be executed` },
        { status: 400 }
      );
    }

    // ステータスを executing に更新
    await sb
      .from('jobs')
      .update({ status: 'executing', approved_at: job.approved_at || new Date().toISOString() })
      .eq('id', jobId);

    // オプション: リクエストボディから修正内容を受け取る
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // bodyが空の場合もOK
    }

    // 実行する下書きテキスト（修正済みのものがあればそちらを使う）
    const draftText = (body.editedDraft as string) || job.ai_draft || '';
    const executionLogs: string[] = [];
    let sendSuccess = false;

    try {
      const channel = job.source_channel || '';
      const metadata = (job.execution_metadata || {}) as Record<string, unknown>;
      const targetAddress = job.target_address || '';

      switch (job.type) {
        case 'reply':
        case 'schedule':
        case 'check':
        case 'other':
        default: {
          // 送信チャネルに応じてメッセージ送信
          if (!draftText) {
            throw new Error('送信する下書きがありません');
          }

          switch (channel) {
            case 'email': {
              if (!targetAddress) throw new Error('送信先メールアドレスがありません');
              const subject = (metadata.subject as string) || `Re: ${job.title}`;
              sendSuccess = await sendEmail(
                [targetAddress],
                subject,
                draftText,
                job.reply_to_message_id || undefined
              );
              executionLogs.push(`Email送信: ${targetAddress} / 件名: ${subject}`);
              break;
            }
            case 'slack': {
              const slackChannelId = (metadata.slackChannel as string) || '';
              const slackThreadTs = (metadata.slackThreadTs as string) || (metadata.slackTs as string) || '';
              if (!slackChannelId) throw new Error('SlackチャネルIDがありません');
              sendSuccess = await sendSlackMessage(
                slackChannelId,
                draftText,
                slackThreadTs || undefined,
                userId || undefined
              );
              executionLogs.push(`Slack送信: ${slackChannelId}${slackThreadTs ? ' (スレッド内)' : ''}`);
              break;
            }
            case 'chatwork': {
              const chatworkRoomId = (metadata.chatworkRoomId as string) || '';
              if (!chatworkRoomId) throw new Error('ChatworkルームIDがありません');
              sendSuccess = await sendChatworkMessage(chatworkRoomId, draftText);
              executionLogs.push(`Chatwork送信: ルーム ${chatworkRoomId}`);
              break;
            }
            default: {
              // チャネル不明 → 送信はスキップ、ジョブを完了扱い
              sendSuccess = true;
              executionLogs.push(`チャネル未指定: 送信をスキップしジョブを完了`);
            }
          }
          break;
        }
      }

      if (!sendSuccess) {
        throw new Error('メッセージの送信に失敗しました');
      }

      // 送信メッセージをDBに保存
      if (channel && ['email', 'slack', 'chatwork'].includes(channel)) {
        const sentId = `job-sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const sentMessage: UnifiedMessage = {
          id: sentId,
          channel: channel as ChannelType,
          channelIcon: '',
          from: { name: 'あなた', address: userId || 'me' },
          to: targetAddress ? [{ name: job.target_name || '', address: targetAddress }] : undefined,
          subject: (metadata.subject as string) || undefined,
          body: draftText,
          timestamp: new Date().toISOString(),
          isRead: true,
          status: 'read',
          direction: 'sent',
          threadId: job.reply_to_message_id || undefined,
          metadata: {
            slackChannel: metadata.slackChannel as string | undefined,
            slackChannelName: metadata.slackChannelName as string | undefined,
            slackTs: metadata.slackTs as string | undefined,
            slackThreadTs: metadata.slackThreadTs as string | undefined,
            chatworkRoomId: metadata.chatworkRoomId as string | undefined,
            chatworkRoomName: metadata.chatworkRoomName as string | undefined,
            jobId: jobId,
          },
        };
        try {
          await saveMessages([sentMessage]);
          executionLogs.push(`送信メッセージをDB保存: ${sentId}`);
        } catch (saveErr) {
          console.error('[Job Execute] 送信メッセージ保存失敗:', saveErr);
          executionLogs.push(`送信メッセージ保存失敗（送信は成功）`);
        }
      }

      // 元メッセージのステータスを更新
      if (job.reply_to_message_id) {
        try {
          await sb
            .from('inbox_messages')
            .update({ status: 'replied', updated_at: new Date().toISOString() })
            .eq('id', job.reply_to_message_id);
          executionLogs.push(`元メッセージのステータスを replied に更新`);
        } catch {
          executionLogs.push(`元メッセージのステータス更新失敗（送信は成功）`);
        }
      }

      // ジョブを完了に更新
      const { data: updatedJob } = await sb
        .from('jobs')
        .update({
          status: 'done',
          executed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          execution_log: executionLogs.join('\n'),
        })
        .eq('id', jobId)
        .select()
        .single();

      return NextResponse.json({
        success: true,
        data: {
          job: updatedJob,
          executionLog: executionLogs,
          message: `ジョブ「${job.title}」を実行完了しました`,
        },
      });

    } catch (execError) {
      const errorMsg = execError instanceof Error ? execError.message : '不明なエラー';
      executionLogs.push(`実行エラー: ${errorMsg}`);

      // ジョブを失敗に更新
      await sb
        .from('jobs')
        .update({
          status: 'failed',
          executed_at: new Date().toISOString(),
          execution_log: executionLogs.join('\n'),
        })
        .eq('id', jobId);

      return NextResponse.json({
        success: false,
        error: errorMsg,
        data: { executionLog: executionLogs },
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Job Execute API] エラー:', error);
    return NextResponse.json(
      { error: 'ジョブ実行中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
