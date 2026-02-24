'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UnifiedMessage, ChannelType, MessageGroup } from '@/lib/types';
import { getMessageGroupKey, getGroupLabel } from '@/lib/utils';

// クライアント側メッセージキャッシュ（ブラウザタブ内で有効）
let clientMessageCache: {
  messages: UnifiedMessage[];
  timestamp: number;
  page: number;
} | null = null;

const CLIENT_CACHE_TTL = 2 * 60 * 1000; // 2分

/**
 * メッセージをグループ化する
 * 同一ルーム/チャンネル/スレッドのメッセージを1つのグループにまとめる
 */
function groupMessages(messages: UnifiedMessage[]): MessageGroup[] {
  const groupMap = new Map<string, UnifiedMessage[]>();

  for (const msg of messages) {
    const key = getMessageGroupKey(msg);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(msg);
  }

  const groups: MessageGroup[] = [];

  for (const [groupKey, msgs] of Array.from(groupMap.entries())) {
    // グループ内メッセージを時系列順（古い→新しい）にソート
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const latest = sorted[sorted.length - 1];

    groups.push({
      groupKey,
      channel: latest.channel,
      groupLabel: getGroupLabel(latest),
      latestMessage: latest,
      messages: sorted,
      messageCount: sorted.length,
      unreadCount: sorted.filter((m) => !m.isRead).length,
      latestTimestamp: latest.timestamp,
    });
  }

  // グループを最新メッセージの日時で降順ソート
  groups.sort(
    (a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
  );

  return groups;
}

export function useMessages() {
  const [messages, setMessages] = useState<UnifiedMessage[]>(() => {
    // 初期値: クライアントキャッシュがあれば即表示
    if (clientMessageCache && Date.now() - clientMessageCache.timestamp < CLIENT_CACHE_TTL) {
      return clientMessageCache.messages;
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    // キャッシュがあればローディング不要
    return !(clientMessageCache && Date.now() - clientMessageCache.timestamp < CLIENT_CACHE_TTL);
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const isRevalidating = useRef(false);

  const fetchMessages = useCallback(async (forceRefresh = false) => {
    // キャッシュがあり、強制更新でなければバックグラウンド更新
    const hasCache = clientMessageCache && Date.now() - clientMessageCache.timestamp < CLIENT_CACHE_TTL;
    if (hasCache && !forceRefresh) {
      // Stale-While-Revalidate: キャッシュを表示しつつバックグラウンドで更新
      if (isRevalidating.current) return; // 既に更新中ならスキップ
      isRevalidating.current = true;
      try {
        const res = await fetch('/api/messages?page=1&limit=50');
        const data = await res.json();
        if (data.success) {
          setMessages(data.data);
          clientMessageCache = { messages: data.data, timestamp: Date.now(), page: 1 };
          setHasMore(data.pagination?.hasMore ?? false);
        }
      } catch {
        // バックグラウンド更新失敗はキャッシュ維持
      } finally {
        isRevalidating.current = false;
      }
      return;
    }

    // キャッシュなし or 強制更新: フル読み込み
    setIsLoading(true);
    setError(null);
    setPage(1);
    try {
      const url = forceRefresh
        ? '/api/messages?page=1&limit=50&refresh=true'
        : '/api/messages?page=1&limit=50';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
        clientMessageCache = { messages: data.data, timestamp: Date.now(), page: 1 };
        setHasMore(data.pagination?.hasMore ?? false);
      } else {
        setError(data.error || 'メッセージの取得に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/messages?page=${nextPage}&limit=50`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        // 重複除去して追加
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data.data.filter((m: UnifiedMessage) => !existingIds.has(m.id));
          return [...prev, ...newMessages];
        });
        setPage(nextPage);
        setHasMore(data.pagination?.hasMore ?? false);
      } else {
        setHasMore(false);
      }
    } catch {
      // エラー時はhasMoreを変更しない（再試行可能）
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, isLoadingMore, hasMore]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // グループ化されたメッセージ
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // チャネルごとのメッセージ数
  const messageCounts: Record<ChannelType, number> = {
    email: messages.filter((m) => m.channel === 'email').length,
    slack: messages.filter((m) => m.channel === 'slack').length,
    chatwork: messages.filter((m) => m.channel === 'chatwork').length,
  };

  // チャネルごとの未読数
  const unreadCounts: Record<ChannelType, number> = {
    email: messages.filter((m) => m.channel === 'email' && !m.isRead).length,
    slack: messages.filter((m) => m.channel === 'slack' && !m.isRead).length,
    chatwork: messages.filter((m) => m.channel === 'chatwork' && !m.isRead).length,
  };

  // 強制更新（更新ボタン用）
  const forceRefresh = useCallback(() => {
    clientMessageCache = null; // キャッシュ破棄
    return fetchMessages(true);
  }, [fetchMessages]);

  // Phase 25: グループ内メッセージを既読にする
  const markGroupAsRead = useCallback((group: MessageGroup) => {
    const unreadIds = group.messages
      .filter((m) => !m.isRead)
      .map((m) => m.id);

    if (unreadIds.length === 0) return;

    // 1. ローカル状態を即時更新（UIが即座に反映される）
    setMessages((prev) => {
      const idSet = new Set(unreadIds);
      const updated = prev.map((m) =>
        idSet.has(m.id) ? { ...m, isRead: true, status: 'read' as const } : m
      );
      clientMessageCache = { messages: updated, timestamp: Date.now(), page };
      return updated;
    });

    // 2. DBに永続化（バックグラウンド・失敗しても UI には影響しない）
    fetch('/api/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: unreadIds }),
    }).catch((err) => {
      console.error('[useMessages] 既読API呼び出しエラー:', err);
    });
  }, [page]);

  // 送信メッセージをローカルに追加（即時表示用）
  const addSentMessage = useCallback((msg: UnifiedMessage) => {
    setMessages((prev) => {
      const newMessages = [msg, ...prev];
      clientMessageCache = { messages: newMessages, timestamp: Date.now(), page };
      return newMessages;
    });
  }, [page]);

  return {
    messages,
    messageGroups,
    isLoading,
    isLoadingMore,
    error,
    refresh: forceRefresh,
    loadMore,
    hasMore,
    messageCounts,
    unreadCounts,
    addSentMessage,
    markGroupAsRead,
  };
}
