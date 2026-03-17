// チャネル一覧取得API
// GET ?service=slack → Slack チャネル一覧
// GET ?service=chatwork → Chatwork ルーム一覧

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface AvailableChannel {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  member_count?: number;
  is_subscribed: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');

    if (!service || !['slack', 'chatwork'].includes(service)) {
      return NextResponse.json(
        { success: false, error: 'service パラメータが必要です（slack / chatwork）' },
        { status: 400 }
      );
    }

    let channels: AvailableChannel[] = [];

    if (service === 'slack') {
      channels = await getSlackChannels();
    } else if (service === 'chatwork') {
      channels = await getChatworkRooms();
    }

    return NextResponse.json({ success: true, data: channels });
  } catch (error) {
    console.error('[Channels Available] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'チャネル一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

async function getSlackChannels(): Promise<AvailableChannel[]> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.log('[Channels Available] SLACK_BOT_TOKEN 未設定');
    return [];
  }

  try {
    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200,
      exclude_archived: true,
    });

    const channels = result.channels || [];
    return channels.map((ch: any) => ({
      channel_id: ch.id || '',
      channel_name: ch.name || ch.id || '',
      channel_type: ch.is_private ? 'private' : 'public',
      member_count: ch.num_members || 0,
      is_subscribed: ch.is_member || false,
    }));
  } catch (error) {
    console.error('[Channels Available] Slack API エラー:', error);
    return [];
  }
}

async function getChatworkRooms(): Promise<AvailableChannel[]> {
  const token = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!token) {
    console.log('[Channels Available] CHATWORK_API_TOKEN 未設定');
    return [];
  }

  try {
    const res = await fetch('https://api.chatwork.com/v2/rooms', {
      headers: {
        'X-ChatWorkToken': token,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error('[Channels Available] Chatwork API エラー:', res.status);
      return [];
    }

    const rooms = await res.json();
    if (!Array.isArray(rooms)) return [];

    // グループチャットのみ（1:1 DM は除外）
    return rooms
      .filter((room: any) => room.type === 'group')
      .map((room: any) => ({
        channel_id: String(room.room_id),
        channel_name: room.name || `Room ${room.room_id}`,
        channel_type: 'group',
        member_count: room.member_count || 0,
        is_subscribed: true,
      }));
  } catch (error) {
    console.error('[Channels Available] Chatwork API エラー:', error);
    return [];
  }
}
