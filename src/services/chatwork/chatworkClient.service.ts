import { UnifiedMessage, Attachment } from '@/lib/types';
import { cleanChatworkBody } from '@/lib/utils';
import { createServerClient } from '@/lib/supabase';

/**
 * Chatwork連携サービス
 * Chatwork APIを使用してメッセージの取得・送信を行う
 * ユーザー個別トークン（user_service_tokens）を優先使用
 */

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

// Phase 29: レート制限対策
const RATE_LIMIT_DELAY_MS = 200; // リクエスト間のディレイ（ms）
const MAX_RETRIES = 2;

function getToken(): string {
  return process.env.CHATWORK_API_TOKEN || '';
}

/**
 * DBからユーザー個別のChatworkトークンを取得
 * 見つからない場合は環境変数にフォールバック
 */
async function getTokenFromDB(userId?: string): Promise<string> {
  if (!userId) return getToken();

  const supabase = createServerClient();
  if (!supabase) return getToken();

  try {
    const { data, error } = await supabase
      .from('user_service_tokens')
      .select('token_data')
      .eq('user_id', userId)
      .eq('service_name', 'chatwork')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Chatwork] トークンDB取得エラー:', error.message);
      return getToken();
    }

    const token = data?.token_data?.api_token;
    if (token) {
      console.log(`[Chatwork] DBからユーザー個別トークン取得成功 (userId: ${userId.slice(0, 8)}...)`);
      return token;
    }
  } catch (e) {
    console.error('[Chatwork] トークンDB取得例外:', e);
  }
  return getToken();
}

/** リクエスト間にディレイを入れる */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 現在のリクエストで使うトークン（chatworkFetchWithToken用） */
let _currentToken = '';

async function chatworkFetch(endpoint: string, options?: RequestInit) {
  const token = _currentToken || getToken();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${CHATWORK_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'X-ChatWorkToken': token,
        ...options?.headers,
      },
    });

    // Phase 29: レート制限エラー(429)時のリトライ
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || '5');
      console.warn(`[Chatwork API] レート制限 (429) - ${endpoint}: ${retryAfter}秒後にリトライ (試行${attempt + 1}/${MAX_RETRIES + 1})`);
      if (attempt < MAX_RETRIES) {
        await delay(retryAfter * 1000);
        continue;
      }
    }

    if (!res.ok && res.status !== 429) {
      const errorBody = await res.text().catch(() => 'unknown');
      console.error(`[Chatwork API] ${res.status} ${res.statusText} - ${endpoint}: ${errorBody}`);
    }

    // Phase 29: リクエスト間ディレイ
    await delay(RATE_LIMIT_DELAY_MS);
    return res;
  }

  // フォールバック（ここには通常到達しない）
  return fetch(`${CHATWORK_API_BASE}${endpoint}`, {
    ...options,
    headers: { 'X-ChatWorkToken': token, ...options?.headers },
  });
}

/**
 * Chatworkメッセージを取得し、UnifiedMessage形式に変換
 * @param limit 取得件数上限
 * @param userId 認証ユーザーID（DBトークン取得に使用）
 */
export async function fetchChatworkMessages(limit: number = 50, userId?: string): Promise<UnifiedMessage[]> {
  const token = await getTokenFromDB(userId);

  if (!token) {
    console.log('[Chatwork] トークン未設定のためスキップ');
    return [];
  }

  // chatworkFetch内で使うトークンを設定
  _currentToken = token;

  try {
    // ルーム一覧を取得
    const roomsRes = await chatworkFetch('/rooms');
    if (!roomsRes.ok) {
      console.error('[Chatwork] ルーム一覧取得失敗:', roomsRes.status, roomsRes.statusText);
      return [];
    }

    const rooms = await roomsRes.json();
    console.log(`[Chatwork] ${rooms.length}個のルームを取得`);

    if (!Array.isArray(rooms) || rooms.length === 0) {
      console.log('[Chatwork] ルームが存在しません');
      return [];
    }

    // Phase 39b: 自分のaccount_idを取得（送信メッセージ判定用）
    let myAccountId = '';
    try {
      const meRes = await chatworkFetch('/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        myAccountId = String(meData.account_id || '');
        console.log(`[Chatwork] 自分のaccount_id: ${myAccountId}`);
      }
    } catch (meErr) {
      console.warn('[Chatwork] /me API失敗:', meErr);
    }

    const messages: UnifiedMessage[] = [];
    const perRoom = Math.max(5, Math.ceil(limit / Math.min(rooms.length, 15)));

    // 直近のメッセージがありそうなルームを優先（last_update_timeでソート）
    const sortedRooms = [...rooms].sort(
      (a: { last_update_time?: number }, b: { last_update_time?: number }) =>
        (b.last_update_time || 0) - (a.last_update_time || 0)
    );

    // Phase 29: レート制限対策 — 同時取得ルーム数を15に制限
    for (const room of sortedRooms.slice(0, 15)) {
      try {
        // Phase 25: ルームの未読数を取得
        const unreadNum = room.unread_num || 0;

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

        console.log(`[Chatwork] ルーム ${room.name}: ${roomMessages.length}件取得 (未読: ${unreadNum}件)`);

        // ルームのファイル一覧を取得（エラーは無視）
        let roomFiles: Attachment[] = [];
        try {
          roomFiles = await fetchRoomFiles(String(room.room_id));
        } catch { /* ignore */ }

        // Phase 25: 最新メッセージから未読数分が未読
        const latestMessages = roomMessages.slice(-perRoom);
        for (let i = 0; i < latestMessages.length; i++) {
          const msg = latestMessages[i];
          // 未読判定: 配列末尾からunreadNum件分が未読
          const posFromEnd = latestMessages.length - 1 - i;
          const msgIsRead = posFromEnd >= unreadNum;

          // メッセージ本文にファイル参照があるかチェック（[dw aid=XXX]等）
          const msgBody = msg.body || '';
          const fileRefs = msgBody.match(/\[dw aid=(\d+)\]/g) || [];
          const msgAttachments: Attachment[] = [];

          for (const ref of fileRefs) {
            const aidMatch = ref.match(/\[dw aid=(\d+)\]/);
            if (aidMatch) {
              // ルームファイルから該当IDを探す
              const file = roomFiles.find(f => f.id === `cw-file-${aidMatch[1]}`);
              if (file) {
                msgAttachments.push(file);
              }
            }
          }

          // Phase 39b: 自分のメッセージかどうかを判定
          const msgAccountId = String(msg.account?.account_id || '');
          const isSentByMe = myAccountId !== '' && msgAccountId === myAccountId;

          messages.push({
            id: `chatwork-${room.room_id}-${msg.message_id}`,
            channel: 'chatwork',
            channelIcon: '🔵',
            from: isSentByMe
              ? { name: 'あなた', address: msgAccountId }
              : { name: msg.account?.name || '不明', address: msgAccountId },
            body: cleanChatworkBody(msgBody),
            attachments: msgAttachments.length > 0 ? msgAttachments : undefined,
            timestamp: new Date(msg.send_time * 1000).toISOString(),
            isRead: isSentByMe || msgIsRead,
            status: isSentByMe ? ('read' as const) : (msgIsRead ? ('read' as const) : ('unread' as const)),
            // Phase 39b: 送受信方向を設定
            direction: isSentByMe ? ('sent' as const) : ('received' as const),
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

    _currentToken = ''; // リセット
    return messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[Chatwork] 全体エラー:', error);
    _currentToken = ''; // リセット
    return [];
  }
}

/**
 * Chatworkルームのファイル一覧を取得
 */
async function fetchRoomFiles(roomId: string): Promise<Attachment[]> {
  try {
    const res = await chatworkFetch(`/rooms/${roomId}/files`);
    if (!res.ok || res.status === 204) return [];

    const files = await res.json();
    if (!Array.isArray(files)) return [];

    return files.map((f: {
      file_id: number;
      message_id?: string;
      filename: string;
      filesize: number;
      upload_time?: number;
    }) => {
      const mimeType = guessMimeType(f.filename);
      return {
        id: `cw-file-${f.file_id}`,
        filename: f.filename,
        mimeType,
        size: f.filesize,
        isInline: false,
        downloadUrl: `/api/attachments/chatwork?roomId=${roomId}&fileId=${f.file_id}`,
      };
    });
  } catch (err) {
    console.error(`[Chatwork] ファイル取得エラー (room: ${roomId}):`, err);
    return [];
  }
}

/**
 * ファイル名からMIMEタイプを推測
 */
function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', csv: 'text/csv', txt: 'text/plain',
    mp4: 'video/mp4', mp3: 'audio/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Chatwork特定ファイルのダウンロードURLを取得
 */
export async function getChatworkFileDownloadUrl(roomId: string, fileId: string): Promise<string | null> {
  try {
    const res = await chatworkFetch(`/rooms/${roomId}/files/${fileId}?create_download_url=1`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.download_url || null;
  } catch {
    return null;
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

/** Phase 29: デモモードが環境変数で無効化されている場合は空配列を返す */
function getDemoChatworkMessages(): UnifiedMessage[] {
  if (process.env.DISABLE_DEMO_DATA === 'true') {
    return [];
  }
  const now = new Date();
  return [
    {
      id: 'chatwork-demo-1',
      channel: 'chatwork',
      channelIcon: '🔵',
      from: { name: '中村四郎', address: '4001' },
      body: '■ 週次報告\n今週の進捗を共有します。タスクAは完了、タスクBは80%、タスクCは来週着手予定です。',
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
