// Phase 38b: 宛先候補API — コンタクト・Slackチャネル・Chatworkルームを検索
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const channel = searchParams.get('channel') || 'all'; // email / slack / chatwork / all

    const results: {
      type: 'contact' | 'slack_channel' | 'chatwork_room';
      id: string;
      name: string;
      subLabel?: string;
      address?: string;  // email address, slack channel id, chatwork room id
      channel: string;
    }[] = [];

    // ============================
    // 1. コンタクト（個人）検索
    // ============================
    if (channel === 'all' || channel === 'email' || channel === 'chatwork') {
      // contact_persons + contact_channels からメールアドレス・アカウントIDを取得
      let contactQuery = supabase
        .from('contact_persons')
        .select('id, name, company_name, relationship_type')
        .order('name');

      if (query) {
        contactQuery = contactQuery.or(`name.ilike.%${query}%,company_name.ilike.%${query}%`);
      }

      const { data: contacts } = await contactQuery.limit(30);

      if (contacts && contacts.length > 0) {
        const contactIds = contacts.map((c) => c.id);

        // contact_channels から各コンタクトのチャネル情報を取得
        const { data: channels } = await supabase
          .from('contact_channels')
          .select('contact_id, channel, address')
          .in('contact_id', contactIds);

        const channelMap = new Map<string, { channel: string; address: string }[]>();
        if (channels) {
          for (const ch of channels) {
            if (!channelMap.has(ch.contact_id)) {
              channelMap.set(ch.contact_id, []);
            }
            channelMap.get(ch.contact_id)!.push({ channel: ch.channel, address: ch.address });
          }
        }

        for (const contact of contacts) {
          const contactChannels = channelMap.get(contact.id) || [];

          if (channel === 'email') {
            // メール宛先: email チャンネルのアドレスのみ
            const emailChannels = contactChannels.filter((ch) => ch.channel === 'email');
            for (const ec of emailChannels) {
              results.push({
                type: 'contact',
                id: contact.id,
                name: contact.name,
                subLabel: `${contact.company_name || ''} ${ec.address}`.trim(),
                address: ec.address,
                channel: 'email',
              });
            }
            // emailチャネルがなくても、inbox_messagesからメールアドレスがある可能性
            if (emailChannels.length === 0) {
              // from_addressからメールアドレスを探す
              const { data: msgs } = await supabase
                .from('inbox_messages')
                .select('from_address')
                .eq('from_name', contact.name)
                .eq('channel', 'email')
                .limit(1);
              if (msgs && msgs.length > 0 && msgs[0].from_address?.includes('@')) {
                results.push({
                  type: 'contact',
                  id: contact.id,
                  name: contact.name,
                  subLabel: `${contact.company_name || ''} ${msgs[0].from_address}`.trim(),
                  address: msgs[0].from_address,
                  channel: 'email',
                });
              }
            }
          } else if (channel === 'chatwork') {
            // Chatwork宛先: chatwork チャンネルのアドレス（account_id）
            const cwChannels = contactChannels.filter((ch) => ch.channel === 'chatwork');
            for (const cw of cwChannels) {
              results.push({
                type: 'contact',
                id: contact.id,
                name: contact.name,
                subLabel: contact.company_name || undefined,
                address: cw.address,
                channel: 'chatwork',
              });
            }
          } else {
            // all: チャネルがあるものを全て返す
            for (const ch of contactChannels) {
              results.push({
                type: 'contact',
                id: contact.id,
                name: contact.name,
                subLabel: `${contact.company_name || ''} ${ch.address}`.trim(),
                address: ch.address,
                channel: ch.channel,
              });
            }
          }
        }
      }
    }

    // ============================
    // 2. Slackチャネル一覧（DBキャッシュから）
    // ============================
    if (channel === 'all' || channel === 'slack') {
      // organization_channels からSlackチャネルを取得
      let slackQuery = supabase
        .from('organization_channels')
        .select('id, channel_id, channel_name, channel_type')
        .eq('service_name', 'slack')
        .eq('is_active', true);

      if (query) {
        slackQuery = slackQuery.ilike('channel_name', `%${query}%`);
      }

      const { data: slackChannels } = await slackQuery.limit(20);

      if (slackChannels) {
        for (const sc of slackChannels) {
          results.push({
            type: 'slack_channel',
            id: sc.id,
            name: sc.channel_name || sc.channel_id,
            subLabel: sc.channel_type === 'im' ? 'DM' : sc.channel_type || 'チャンネル',
            address: sc.channel_id,
            channel: 'slack',
          });
        }
      }

      // organization_channels にない場合、inbox_messagesのmetadataから一意のチャネル情報を取得
      if (!slackChannels || slackChannels.length === 0) {
        const { data: slackMsgs } = await supabase
          .from('inbox_messages')
          .select('metadata')
          .eq('channel', 'slack')
          .order('timestamp', { ascending: false })
          .limit(200);

        if (slackMsgs) {
          const channelSet = new Map<string, string>();
          for (const msg of slackMsgs) {
            const meta = msg.metadata || {};
            if (meta.slackChannel && meta.slackChannelName) {
              if (!channelSet.has(meta.slackChannel)) {
                channelSet.set(meta.slackChannel, meta.slackChannelName);
              }
            }
          }
          for (const [channelId, channelName] of channelSet) {
            if (query && !channelName.toLowerCase().includes(query.toLowerCase())) continue;
            results.push({
              type: 'slack_channel',
              id: `slack-${channelId}`,
              name: channelName,
              subLabel: 'チャンネル',
              address: channelId,
              channel: 'slack',
            });
          }
        }
      }
    }

    // ============================
    // 3. Chatworkルーム一覧（inbox_messagesのmetadataから）
    // ============================
    if (channel === 'all' || channel === 'chatwork') {
      const { data: cwMsgs } = await supabase
        .from('inbox_messages')
        .select('metadata')
        .eq('channel', 'chatwork')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (cwMsgs) {
        const roomSet = new Map<string, string>();
        for (const msg of cwMsgs) {
          const meta = msg.metadata || {};
          if (meta.chatworkRoomId && meta.chatworkRoomName) {
            if (!roomSet.has(meta.chatworkRoomId)) {
              roomSet.set(meta.chatworkRoomId, meta.chatworkRoomName);
            }
          }
        }
        for (const [roomId, roomName] of roomSet) {
          if (query && !roomName.toLowerCase().includes(query.toLowerCase())) continue;
          results.push({
            type: 'chatwork_room',
            id: `cw-room-${roomId}`,
            name: roomName,
            subLabel: `ルームID: ${roomId}`,
            address: roomId,
            channel: 'chatwork',
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('[Recipients API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '宛先候補の取得に失敗しました' },
      { status: 500 }
    );
  }
}
