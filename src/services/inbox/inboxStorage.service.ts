import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { UnifiedMessage } from '@/lib/types';

/**
 * インボックスメッセージのSupabase保存サービス
 *
 * 動作フロー:
 * 1. API呼び出し時にメッセージを取得（Gmail/Slack/Chatwork）
 * 2. 取得したメッセージをSupabaseに保存（upsert）
 * 3. ブロックリストに一致するメッセージを除外
 * 4. Supabaseから読み出して返却
 *
 * 新着取り込みタイミング:
 * - ページ表示時（useMessagesのfetchMessages）
 * - 手動更新ボタン押下時（forceRefresh）
 * - 2分間隔のStale-While-Revalidate
 */

// ================================
// メッセージ保存（UPSERT）
// ================================
export async function saveMessages(messages: UnifiedMessage[]): Promise<number> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured() || messages.length === 0) return 0;

  try {
    // Phase 25: DB上で既読済みのメッセージIDを事前取得（既読を上書きしない）
    const allIds = messages.map((m) => m.id);
    const existingReadIds = new Set<string>();
    for (let i = 0; i < allIds.length; i += 50) {
      const batch = allIds.slice(i, i + 50);
      const { data: readRows } = await supabase
        .from('inbox_messages')
        .select('id')
        .in('id', batch)
        .eq('is_read', true);
      if (readRows) {
        readRows.forEach((r) => existingReadIds.add(r.id));
      }
    }

    const rows = messages.map((msg) => ({
      id: msg.id,
      channel: msg.channel,
      from_name: msg.from.name,
      from_address: msg.from.address,
      to_list: msg.to || [],
      cc_list: msg.cc || [],
      subject: msg.subject || null,
      body: msg.body,
      body_full: msg.bodyFull || null,
      attachments: msg.attachments || [],
      timestamp: msg.timestamp,
      // DB上で既読なら true を維持（サービス側のisReadで上書きしない）
      is_read: existingReadIds.has(msg.id) ? true : msg.isRead,
      status: existingReadIds.has(msg.id) ? 'read' : msg.status,
      thread_id: msg.threadId || null,
      metadata: msg.metadata,
      thread_messages: msg.threadMessages || [],
      // Phase 38: 送信/受信の方向
      direction: msg.direction || 'received',
    }));

    // バッチでupsert（50件ずつ）
    let savedCount = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase
        .from('inbox_messages')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error('[InboxStorage] 保存エラー:', error.message);
      } else {
        savedCount += batch.length;
      }
    }

    if (existingReadIds.size > 0) {
      console.log(`[InboxStorage] ${savedCount}/${messages.length}件を保存（既読保持: ${existingReadIds.size}件）`);
    } else {
      console.log(`[InboxStorage] ${savedCount}/${messages.length}件を保存`);
    }
    return savedCount;
  } catch (error) {
    console.error('[InboxStorage] 保存処理エラー:', error);
    return 0;
  }
}

// ================================
// メッセージ読み出し（ブロックリスト適用）
// ================================
export async function loadMessages(options?: {
  channel?: string;
  limit?: number;
  offset?: number;
  since?: string; // ISO日時
  direction?: 'received' | 'sent' | 'all'; // Phase 38: 方向フィルタ
}): Promise<{ messages: UnifiedMessage[]; total: number }> {
  const supabase = getSupabase();
  if (!supabase || !isSupabaseConfigured()) {
    return { messages: [], total: 0 };
  }

  try {
    // ブロックリスト取得
    const blocklist = await getBlocklist();

    let query = supabase
      .from('inbox_messages')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false });

    if (options?.channel) {
      query = query.eq('channel', options.channel);
    }
    // Phase 38: 方向フィルタ（デフォルトは全て取得）
    if (options?.direction && options.direction !== 'all') {
      query = query.eq('direction', options.direction);
    }
    if (options?.since) {
      query = query.gte('timestamp', options.since);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[InboxStorage] 読み出しエラー:', error.message);
      return { messages: [], total: 0 };
    }

    // ブロックリストでフィルタリング
    const filtered = (data || []).filter((row) => {
      if (row.channel !== 'email') return true; // メールのみブロック対象
      return !isBlocked(row.from_address, blocklist);
    });

    // UnifiedMessage形式に変換
    const messages: UnifiedMessage[] = filtered.map((row) => ({
      id: row.id,
      channel: row.channel,
      channelIcon: row.channel === 'email' ? '📧' : row.channel === 'slack' ? '💬' : '🔵',
      from: { name: row.from_name, address: row.from_address },
      to: row.to_list || undefined,
      cc: row.cc_list || undefined,
      subject: row.subject || undefined,
      body: row.body,
      bodyFull: row.body_full || undefined,
      attachments: row.attachments || undefined,
      timestamp: row.timestamp,
      isRead: row.is_read,
      status: row.status,
      direction: row.direction || 'received', // Phase 38
      threadId: row.thread_id || undefined,
      metadata: row.metadata || {},
      threadMessages: row.thread_messages || undefined,
    }));

    return { messages, total: count || 0 };
  } catch (error) {
    console.error('[InboxStorage] 読み出し処理エラー:', error);
    return { messages: [], total: 0 };
  }
}

// ================================
// 同期状態管理
// ================================
export async function getSyncState(channel: string) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from('inbox_sync_state')
    .select('*')
    .eq('channel', channel)
    .single();

  return data;
}

export async function updateSyncState(channel: string, update: {
  last_sync_at?: string;
  last_message_id?: string;
  message_count?: number;
  status?: string;
  error_message?: string;
}) {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase
    .from('inbox_sync_state')
    .update(update)
    .eq('channel', channel);
}

// ================================
// ブロックリスト管理
// ================================
interface BlocklistEntry {
  id: string;
  address: string;
  match_type: 'exact' | 'domain';
  reason: string | null;
  created_at: string;
}

export async function getBlocklist(): Promise<BlocklistEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('email_blocklist')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[InboxStorage] ブロックリスト取得エラー:', error.message);
    return [];
  }

  return data || [];
}

export async function addToBlocklist(address: string, matchType: 'exact' | 'domain' = 'exact', reason?: string) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('email_blocklist')
    .insert({
      address: matchType === 'domain' ? address.replace(/^.*@/, '') : address,
      match_type: matchType,
      reason: reason || null,
    });

  if (error) {
    console.error('[InboxStorage] ブロックリスト追加エラー:', error.message);
    return false;
  }
  return true;
}

export async function removeFromBlocklist(id: string) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('email_blocklist')
    .delete()
    .eq('id', id);

  return !error;
}

// ブロック判定
function isBlocked(address: string, blocklist: BlocklistEntry[]): boolean {
  if (!address) return false;
  const lowerAddr = address.toLowerCase();
  const domain = lowerAddr.split('@')[1] || '';

  for (const entry of blocklist) {
    if (entry.match_type === 'exact' && lowerAddr === entry.address.toLowerCase()) {
      return true;
    }
    if (entry.match_type === 'domain' && domain === entry.address.toLowerCase()) {
      return true;
    }
  }
  return false;
}

// ================================
// 既読マーク
// ================================
export async function markAsRead(messageId: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase
    .from('inbox_messages')
    .update({ is_read: true, status: 'read' })
    .eq('id', messageId);
}
