'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { UnifiedMessage, ChannelType, MessageGroup } from '@/lib/types';
import { getMessageGroupKey, getGroupLabel } from '@/lib/utils';

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
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPage(1);
    try {
      const res = await fetch('/api/messages?page=1&limit=50');
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
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

  return {
    messages,
    messageGroups,
    isLoading,
    isLoadingMore,
    error,
    refresh: fetchMessages,
    loadMore,
    hasMore,
    messageCounts,
    unreadCounts,
  };
}
