'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ContactPerson,
  ContactStats,
  PersonRelationshipType,
  ChannelType,
} from '@/lib/types';

export function useContacts() {
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // フィルター状態
  const [filterRelationship, setFilterRelationship] = useState<PersonRelationshipType | null>(null);
  const [filterChannel, setFilterChannel] = useState<ChannelType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // コンタクト一覧取得
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRelationship) params.set('relationship', filterRelationship);
      if (filterChannel) params.set('channel', filterChannel);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.data);
      }
    } catch {
      // エラーハンドリング
    } finally {
      setIsLoading(false);
    }
  }, [filterRelationship, filterChannel, searchQuery]);

  // 統計取得
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch {
      // エラーハンドリング
    }
  }, []);

  // 関係属性更新
  const updateRelationship = useCallback(
    async (id: string, type: PersonRelationshipType) => {
      try {
        const res = await fetch(`/api/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relationshipType: type }),
        });
        const data = await res.json();
        if (data.success) {
          // ローカル更新
          setContacts((prev) =>
            prev.map((c) =>
              c.id === id
                ? { ...c, relationshipType: type, confirmed: true, confidence: 1.0 }
                : c
            )
          );
          // 統計再取得
          fetchStats();
        }
      } catch {
        // エラーハンドリング
      }
    },
    [fetchStats]
  );

  useEffect(() => {
    fetchContacts();
    fetchStats();
  }, [fetchContacts, fetchStats]);

  return {
    contacts,
    stats,
    isLoading,
    filterRelationship,
    filterChannel,
    searchQuery,
    setFilterRelationship,
    setFilterChannel,
    setSearchQuery,
    updateRelationship,
    refreshContacts: fetchContacts,
  };
}
