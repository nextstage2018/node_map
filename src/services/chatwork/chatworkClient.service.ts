import { UnifiedMessage } from '@/lib/types';

/**
 * Chatwork連携サービス
 * Chatwork APIを使用してメッセージの取得・送信を行う
 */

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

function getToken(): string {
  return process.env.CHATWORK_API_TOKEN || '';
}

async function chatworkFetch(endpoint: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${CHATWORK_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'X-ChatWorkToken': token,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'unknown');
    console.error(`[Chatwork API] ${res.status} ${res.statusText} - ${endpoint}: ${errorBody}`);
  }

  return res;
}

/**
 * Chatworkメッセージを取得し、UnifiedMessage形式に変換
 */
export async function fetchChatworkMessages(limit: number = 50): Promise<UnifiedMessage[]> {
  const token = getToken();

  if (!token) {
    console.log('[Chatwork] トークン未設定のためデモデータを返却');
    return getDemoChatworkMessages();
  }

  try {
    // ルーム一覧を取得
    const roomsRes = await chatworkFetch('/rooms');
    if (!roomsRes.ok) {
      console.error('[Chatwork] ルーム一覧取得失敗:', roomsRes.status, roomsRes.statusText);
      return getDemoChatworkMessages();
    }

    const rooms = await roomsRes.json();
    console.log(`[Chatwork] ${rooms.length}個のルームを取得`);

    if (!Array.isArray(rooms) || rooms.length === 0) {
      console.log('[Chatwork] ルームが存在しません');
      return [];
    }

    const messages: UnifiedMessage[] = [];
    const perRoom = Math.max(5, Math.ceil(limit / Math.min(rooms.length, 10)));

    // 直近のメッセージがありそうなルームを優先（last_update_timeでソート）
    const sortedRooms = [...rooms].sort(
      (a: { last_update_time?: number }, b: { last_update_time?: number }) =>
        (b.last_update_time || 0) - (a.last_update_time || 0)
    );

    for (const room of sortedRooms.slice(0, 15)) {
      try {
        // force=1: 最新100件取得。force=0だと未読のみ
        const msgRes = await chatworkFetch(`/rooms/${room.room_id}/messages?force=1`);

        if (msgRes.status === 204) {
          // 204: メッセージなし（正常）
          console.log(`[Chatwork] ルーム ${room.name}(${room.room_id}): メッセージなし`);
          continue;
        }

        if (!msgRes.ok) {
          console.error(`[Chatwork] ルーム ${room.name}(${room.room_id}): メッセージ取得失敗 ${msgRes.status}`);
          continue;
        }

        const roomMessages = await msgRes.json();

        if (!Array.isArray(roomMessages)) {
          console.log(`[Chatwork] ルーム ${room.name}: レスポンスが配列ではありません`, typeof roomMessages);
          continue;
        }

        console.log(`[Chatwork] ルーム ${room.name}: ${roomMessages.length}件取得`);

        // 最新のメッセージを取得
        for (const msg of roomMessages.slice(-perRoom)) {
          messages.push({
            id: `chatwork-${room.room_id}-${msg.message_id}`,
            channel: 'chatwork',
            channelIcon: '🔵',
            from: {
              name: msg.account?.name || '不明',
              address: String(msg.account?.account_id || ''),
            },
            body: msg.body || '',
            timestamp: new Date(msg.send_time * 1000).toISOString(),
            isRead: false,
            status: 'unread' as const,
            metadata: {
              chatworkRoomId: String(room.room_id),
              chatworkRoomName: room.name || '',
              chatworkMessageId: String(msg.message_id),
            },
          });
        }
      } catch (err) {
        console.error(`[Chatwork] ルーム ${room.name}(${room.room_id}) エラー:`, err);
      }
    }

    console.log(`[Chatwork] 合計 ${messages.length}件のメッセージを取得`);

    return messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[Chatwork] 全体エラー:', error);
    return getDemoChatworkMessages();
  }
}

/**
 * Chatworkメッセージを送信（返信）
 */
export async function sendChatworkMessage(
  roomId: string,
  body: string
): Promise<boolean> {
  const token = getToken();

  if (!token) {
    console.log('[デモモード] Chatwork送信:', { roomId, body });
    return true;
  }

  try {
    const res = await chatworkFetch(`/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `body=${encodeURIComponent(body)}`,
    });

    return res.ok;
  } catch (error) {
    console.error('Chatwork送信エラー:', error);
    return false;
  }
}

function getDemoChatworkMessages(): UnifiedMessage[] {
  const now = new Date();
  return [
    {
      id: 'chatwork-demo-1',
      channel: 'chatwork',
      channelIcon: '🔵',
      from: { name: '中村四郎', address: '4001' },
      body: '[info][title]週次報告[/title]今週の進捗を共有します。タスクAは完了、タスクBは80%、タスクCは来週着手予定です。[/info]',
      timestamp: new Date(now.getTime() - 20 * 60000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { chatworkRoomId: 'R001', chatworkRoomName: '週次定例', chatworkMessageId: 'M001' },
    },
    {
      id: 'chatwork-demo-2',
      channel: 'chatwork',
      channelIcon: '🔵',
      from: { name: '小林五郎', address: '4002' },
      body: '納品物の最終チェックお願いします。修正点があれば今日中にフィードバックいただけると助かります。',
      timestamp: new Date(now.getTime() - 3 * 3600000).toISOString(),
      isRead: true,
      status: 'replied' as const,
      metadata: { chatworkRoomId: 'R002', chatworkRoomName: 'プロジェクトY', chatworkMessageId: 'M002' },
      threadMessages: [
        {
          id: 'cw-thread-2a',
          from: { name: 'あなた', address: '4000' },
          body: '小林さん、納品物を確認しました。\n2点修正をお願いしたい箇所があります。',
          timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
          isOwn: true,
        },
        {
          id: 'cw-thread-2b',
          from: { name: '小林五郎', address: '4002' },
          body: '承知しました。修正箇所を教えていただけますか？',
          timestamp: new Date(now.getTime() - 1.5 * 3600000).toISOString(),
          isOwn: false,
        },
      ],
    },
    {
      id: 'chatwork-demo-3',
      channel: 'chatwork',
      channelIcon: '🔵',
      from: { name: '渡辺六子', address: '4003' },
      body: '請求書の件でご相談です。先月分の処理がまだ完了していないようです。経理から確認の連絡が来ています。',
      timestamp: new Date(now.getTime() - 6 * 3600000).toISOString(),
      isRead: false,
      status: 'unread' as const,
      metadata: { chatworkRoomId: 'R003', chatworkRoomName: '総務・経理', chatworkMessageId: 'M003' },
    },
  ];
}
