// Phase 25: 利用可能チャネル一覧取得 API
// Gmail: ラベル一覧、Slack: チャンネル一覧、Chatwork: ルーム一覧
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ========================================
// ユーザーのサービストークンを取得
// ========================================
async function getUserToken(userId: string, serviceName: string): Promise<any | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', serviceName)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data.token_data;
}

// ========================================
// Gmail: ラベル一覧を取得
// ========================================
async function fetchGmailLabels(tokenData: any): Promise<any[]> {
  try {
    const accessToken = tokenData?.access_token;
    if (!accessToken) return getDefaultGmailLabels();

    // Google Gmail API でラベル一覧を取得
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.error('Gmail labels API error:', res.status);
      // トークン期限切れの場合はリフレッシュを試みる
      if (res.status === 401 && tokenData?.refresh_token) {
        const refreshed = await refreshGmailToken(tokenData.refresh_token);
        if (refreshed) {
          const retryRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { Authorization: `Bearer ${refreshed}` },
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            return formatGmailLabels(retryData.labels || []);
          }
        }
      }
      return getDefaultGmailLabels();
    }

    const data = await res.json();
    return formatGmailLabels(data.labels || []);
  } catch (error) {
    console.error('Gmail labels fetch error:', error);
    return getDefaultGmailLabels();
  }
}

function formatGmailLabels(labels: any[]): any[] {
  // システムラベルとユーザーラベルを分けて整理
  const systemLabels = ['INBOX', 'IMPORTANT', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'UNREAD'];
  const labelNameMap: Record<string, string> = {
    INBOX: '受信トレイ',
    IMPORTANT: '重要',
    STARRED: 'スター付き',
    SENT: '送信済み',
    DRAFT: '下書き',
    SPAM: '迷惑メール',
    TRASH: 'ゴミ箱',
    UNREAD: '未読',
  };

  return labels
    .filter((l: any) => {
      // CATEGORY_* ラベルは除外
      if (l.id.startsWith('CATEGORY_')) return false;
      // CHAT, DRAFT ラベルは除外
      if (['CHAT', 'DRAFT'].includes(l.id)) return false;
      return true;
    })
    .map((l: any) => ({
      channel_id: l.id,
      channel_name: labelNameMap[l.id] || l.name || l.id,
      channel_type: systemLabels.includes(l.id) ? 'system_label' : 'user_label',
    }))
    .sort((a: any, b: any) => {
      // システムラベルを先に、その後ユーザーラベル
      if (a.channel_type === 'system_label' && b.channel_type !== 'system_label') return -1;
      if (a.channel_type !== 'system_label' && b.channel_type === 'system_label') return 1;
      return a.channel_name.localeCompare(b.channel_name, 'ja');
    });
}

function getDefaultGmailLabels(): any[] {
  return [
    { channel_id: 'INBOX', channel_name: '受信トレイ', channel_type: 'system_label' },
    { channel_id: 'IMPORTANT', channel_name: '重要', channel_type: 'system_label' },
    { channel_id: 'STARRED', channel_name: 'スター付き', channel_type: 'system_label' },
    { channel_id: 'SENT', channel_name: '送信済み', channel_type: 'system_label' },
  ];
}

async function refreshGmailToken(refreshToken: string): Promise<string | null> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// ========================================
// Slack: チャンネル一覧を取得
// ========================================
async function fetchSlackChannels(tokenData: any): Promise<any[]> {
  try {
    const accessToken = tokenData?.access_token || tokenData?.bot_token;
    if (!accessToken) return getDefaultSlackChannels();

    // Slack Web API でチャンネル一覧を取得
    const res = await fetch('https://slack.com/api/conversations.list?' + new URLSearchParams({
      types: 'public_channel,private_channel,mpim,im',
      limit: '200',
      exclude_archived: 'true',
    }), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.error('Slack conversations.list error:', res.status);
      return getDefaultSlackChannels();
    }

    const data = await res.json();
    if (!data.ok) {
      console.error('Slack API error:', data.error);
      return getDefaultSlackChannels();
    }

    return (data.channels || []).map((ch: any) => {
      let channelType = 'public';
      if (ch.is_im) channelType = 'dm';
      else if (ch.is_mpim) channelType = 'group';
      else if (ch.is_private) channelType = 'private';

      return {
        channel_id: ch.id,
        channel_name: ch.name || ch.user || `DM (${ch.id})`,
        channel_type: channelType,
        member_count: ch.num_members || 0,
        purpose: ch.purpose?.value || '',
      };
    }).sort((a: any, b: any) => {
      // チャンネルタイプ順: public → private → group → dm
      const typeOrder: Record<string, number> = { public: 0, private: 1, group: 2, dm: 3 };
      const orderDiff = (typeOrder[a.channel_type] || 99) - (typeOrder[b.channel_type] || 99);
      if (orderDiff !== 0) return orderDiff;
      return a.channel_name.localeCompare(b.channel_name, 'ja');
    });
  } catch (error) {
    console.error('Slack channels fetch error:', error);
    return getDefaultSlackChannels();
  }
}

function getDefaultSlackChannels(): any[] {
  return [
    { channel_id: 'demo-general', channel_name: 'general', channel_type: 'public' },
    { channel_id: 'demo-random', channel_name: 'random', channel_type: 'public' },
  ];
}

// ========================================
// Chatwork: ルーム一覧を取得
// ========================================
async function fetchChatworkRooms(tokenData: any): Promise<any[]> {
  try {
    const apiToken = tokenData?.api_token;
    if (!apiToken) return getDefaultChatworkRooms();

    const res = await fetch('https://api.chatwork.com/v2/rooms', {
      headers: { 'X-ChatWorkToken': apiToken },
    });

    if (!res.ok) {
      console.error('Chatwork rooms API error:', res.status);
      return getDefaultChatworkRooms();
    }

    const rooms = await res.json();
    return (rooms || []).map((room: any) => {
      let channelType = 'group';
      if (room.type === 'my') channelType = 'my';
      else if (room.type === 'direct') channelType = 'dm';

      return {
        channel_id: String(room.room_id),
        channel_name: room.name || `ルーム ${room.room_id}`,
        channel_type: channelType,
        member_count: room.member_count || 0,
        icon_path: room.icon_path || '',
      };
    }).sort((a: any, b: any) => {
      // タイプ順: group → dm → my
      const typeOrder: Record<string, number> = { group: 0, dm: 1, my: 2 };
      const orderDiff = (typeOrder[a.channel_type] || 99) - (typeOrder[b.channel_type] || 99);
      if (orderDiff !== 0) return orderDiff;
      return a.channel_name.localeCompare(b.channel_name, 'ja');
    });
  } catch (error) {
    console.error('Chatwork rooms fetch error:', error);
    return getDefaultChatworkRooms();
  }
}

function getDefaultChatworkRooms(): any[] {
  return [
    { channel_id: 'demo-room-1', channel_name: 'プロジェクトA', channel_type: 'group' },
    { channel_id: 'demo-room-2', channel_name: '全体連絡', channel_type: 'group' },
  ];
}

// ========================================
// GET: 利用可能チャネル一覧
// ========================================
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const searchParams = request.nextUrl.searchParams;
    const serviceName = searchParams.get('service');

    if (!serviceName) {
      return NextResponse.json(
        { success: false, error: 'service パラメータが必要です' },
        { status: 400 }
      );
    }

    const validServices = ['gmail', 'slack', 'chatwork'];
    if (!validServices.includes(serviceName)) {
      return NextResponse.json(
        { success: false, error: `無効なサービス名: ${serviceName}` },
        { status: 400 }
      );
    }

    // ユーザーのトークンを取得
    const tokenData = await getUserToken(userId, serviceName);

    let channels: any[] = [];

    switch (serviceName) {
      case 'gmail':
        channels = await fetchGmailLabels(tokenData);
        break;
      case 'slack':
        channels = await fetchSlackChannels(tokenData);
        break;
      case 'chatwork':
        channels = await fetchChatworkRooms(tokenData);
        break;
    }

    // ユーザーの既存購読を取得して、選択状態をマージ
    const supabase = createServerClient();
    let subscribed: Set<string> = new Set();

    if (supabase) {
      const { data: subs } = await supabase
        .from('user_channel_subscriptions')
        .select('channel_id')
        .eq('user_id', userId)
        .eq('service_name', serviceName)
        .eq('is_active', true);

      if (subs) {
        subscribed = new Set(subs.map((s: any) => s.channel_id));
      }
    }

    const channelsWithStatus = channels.map((ch: any) => ({
      ...ch,
      is_subscribed: subscribed.has(ch.channel_id),
    }));

    return NextResponse.json({
      success: true,
      data: channelsWithStatus,
      service: serviceName,
    });
  } catch (error) {
    console.error('利用可能チャネル取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'チャネル一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}
