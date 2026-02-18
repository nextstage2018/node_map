'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnifiedMessage, ChannelType } from '@/lib/types';

export function useMessages() {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
      } else {
        setError(data.error || 'メッセージの取得に失敗しました');
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

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
    isLoading,
    error,
    refresh: fetchMessages,
    messageCounts,
    unreadCounts,
  };
}
