// Phase 45c: ビジネスイベント自動蓄積 Cron Job
// inbox_messages（送受信）からビジネスイベントを自動生成
// 重複防止: source_message_id で既存チェック
// 日次実行（vercel.json で設定）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/BusinessEvents] ビジネスイベント自動蓄積開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' });
  }

  const stats = {
    processed: 0,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // 過去24時間のメッセージを取得（source_message_idで重複チェック）
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: messages, error } = await supabase
      .from('inbox_messages')
      .select('id, channel, from_name, from_address, to_address, subject, body, direction, created_at, metadata')
      .gte('created_at', since)
      .in('channel', ['email', 'slack', 'chatwork'])
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[Cron/BusinessEvents] メッセージ取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      console.log('[Cron/BusinessEvents] 対象メッセージなし');
      return NextResponse.json({ success: true, stats });
    }

    console.log(`[Cron/BusinessEvents] ${messages.length}件のメッセージを処理`);

    // 既に登録済みのsource_message_idを取得（重複防止）
    const msgIds = messages.map(m => m.id);
    const { data: existingEvents } = await supabase
      .from('business_events')
      .select('source_message_id')
      .in('source_message_id', msgIds);

    const existingMsgIds = new Set(
      (existingEvents || []).map((e: { source_message_id: string }) => e.source_message_id)
    );

    // ユーザーIDを取得（user_service_tokensから全ユーザー）
    const { data: tokenUsers } = await supabase
      .from('user_service_tokens')
      .select('user_id')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    const defaultUserId = tokenUsers?.[0]?.user_id;
    if (!defaultUserId) {
      console.log('[Cron/BusinessEvents] アクティブユーザーなし');
      return NextResponse.json({ success: true, stats });
    }

    for (const msg of messages) {
      stats.processed++;

      // 重複スキップ
      if (existingMsgIds.has(msg.id)) {
        stats.skipped++;
        continue;
      }

      try {
        const metadata = msg.metadata || {};
        const isSent = msg.direction === 'sent';

        // イベントタイプ決定
        const eventType = isSent ? 'message_sent' : 'message_received';

        // タイトル生成
        const contactName = isSent
          ? (msg.to_address || '宛先不明')
          : (msg.from_name || msg.from_address || '不明');

        const channelLabel = msg.channel === 'email' ? 'メール' : msg.channel === 'slack' ? 'Slack' : 'Chatwork';
        const dirLabel = isSent ? '送信' : '受信';

        const title = msg.subject
          ? `[${channelLabel}${dirLabel}] ${contactName}: ${(msg.subject as string).slice(0, 60)}`
          : `[${channelLabel}${dirLabel}] ${contactName}`;

        // 本文プレビュー（200文字まで）
        const bodyPreview = msg.body ? String(msg.body).replace(/\n/g, ' ').slice(0, 200) : '';
        const content = bodyPreview || '（本文なし）';

        // プロジェクト推定（チャネルベース）
        let projectId: string | null = null;
        const channelId = msg.channel === 'slack'
          ? (metadata.slackChannel || metadata.channel_id || '') as string
          : msg.channel === 'chatwork'
            ? (metadata.chatworkRoomId || metadata.room_id || '') as string
            : '';

        if (channelId) {
          const serviceName = msg.channel === 'slack' ? 'slack' : 'chatwork';
          const { data: projChannel } = await supabase
            .from('project_channels')
            .select('project_id')
            .eq('service_name', serviceName)
            .eq('channel_identifier', channelId)
            .limit(1);

          if (projChannel && projChannel.length > 0) {
            projectId = projChannel[0].project_id;
          }
        }

        // Emailの場合はfrom_addressからコンタクト→組織→プロジェクト推定
        if (!projectId && msg.channel === 'email') {
          const addr = isSent ? msg.to_address : msg.from_address;
          if (addr) {
            const { data: channels } = await supabase
              .from('contact_channels')
              .select('contact_id')
              .eq('address', addr)
              .limit(1);

            if (channels && channels.length > 0) {
              const { data: contact } = await supabase
                .from('contact_persons')
                .select('company_name')
                .eq('id', channels[0].contact_id)
                .single();

              if (contact?.company_name) {
                const { data: org } = await supabase
                  .from('organizations')
                  .select('id')
                  .ilike('name', `%${contact.company_name}%`)
                  .limit(1)
                  .single();

                if (org) {
                  const { data: proj } = await supabase
                    .from('projects')
                    .select('id')
                    .eq('organization_id', org.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                  if (proj) {
                    projectId = proj.id;
                  }
                }
              }
            }
          }
        }

        // コンタクトID検出
        let contactId: string | null = null;
        const contactAddr = isSent ? msg.to_address : msg.from_address;
        if (contactAddr) {
          const { data: ch } = await supabase
            .from('contact_channels')
            .select('contact_id')
            .eq('address', contactAddr)
            .limit(1);
          if (ch && ch.length > 0) {
            contactId = ch[0].contact_id;
          }
        }

        // ビジネスイベント登録
        const { error: insertError } = await supabase
          .from('business_events')
          .insert({
            title,
            content,
            event_type: eventType,
            project_id: projectId,
            contact_id: contactId,
            user_id: defaultUserId,
            source_message_id: msg.id,
            source_channel: msg.channel,
            event_date: msg.created_at,
          });

        if (insertError) {
          console.error('[Cron/BusinessEvents] 登録エラー:', insertError);
          stats.errors++;
        } else {
          stats.created++;
        }
      } catch (msgError) {
        console.error('[Cron/BusinessEvents] メッセージ処理エラー:', msg.id, msgError);
        stats.errors++;
      }
    }

    console.log('[Cron/BusinessEvents] 完了:', JSON.stringify(stats));
    return NextResponse.json({ success: true, stats });

  } catch (error) {
    console.error('[Cron/BusinessEvents] 全体エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネスイベント同期に失敗しました', stats },
      { status: 500 }
    );
  }
}
