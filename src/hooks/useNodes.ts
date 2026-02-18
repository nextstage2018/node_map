'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  NodeData,
  EdgeData,
  ClusterData,
  ClusterDiff,
  NodeFilter,
  NodeType,
  UnderstandingLevel,
} from '@/lib/types';

interface NodeStats {
  totalNodes: number;
  byType: Record<NodeType, number>;
  byLevel: Record<UnderstandingLevel, number>;
  topKeywords: NodeData[];
}

export function useNodes(initialFilter?: NodeFilter) {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = initialFilter?.userId || 'demo-user';

  // ノード一覧取得
  const fetchNodes = useCallback(async (filter?: NodeFilter) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const f = filter || initialFilter;
      params.set('userId', f?.userId || 'demo-user');
      if (f?.type) params.set('type', f.type);
      if (f?.understandingLevel) params.set('level', f.understandingLevel);
      if (f?.minFrequency) params.set('minFrequency', String(f.minFrequency));
      if (f?.searchQuery) params.set('q', f.searchQuery);

      const res = await fetch(`/api/nodes?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setNodes(data.data);
      } else {
        setError(data.error || 'ノード取得エラー');
      }
    } catch {
      setError('通信エラー');
    } finally {
      setIsLoading(false);
    }
  }, [initialFilter]);

  // エッジ一覧取得
  const fetchEdges = useCallback(async (taskId?: string) => {
    try {
      const params = new URLSearchParams({ userId });
      if (taskId) params.set('taskId', taskId);

      const res = await fetch(`/api/edges?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setEdges(data.data);
      }
    } catch {
      console.error('エッジ取得エラー');
    }
  }, [userId]);

  // クラスター一覧取得
  const fetchClusters = useCallback(async (taskId?: string) => {
    try {
      const params = new URLSearchParams({ userId });
      if (taskId) params.set('taskId', taskId);

      const res = await fetch(`/api/clusters?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setClusters(data.data);
      }
    } catch {
      console.error('クラスター取得エラー');
    }
  }, [userId]);

  // 統計取得
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/stats?userId=${userId}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch {
      console.error('統計取得エラー');
    }
  }, [userId]);

  // テキストからキーワード抽出・ノード蓄積
  const extractFromText = useCallback(async (
    text: string,
    sourceType: 'message' | 'task_conversation' | 'task_ideation' | 'task_result',
    sourceId: string,
    direction: 'received' | 'sent' | 'self' = 'self',
    phase?: 'ideation' | 'progress' | 'result'
  ) => {
    try {
      const res = await fetch('/api/nodes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceType,
          sourceId,
          direction,
          userId,
          phase,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // ノード・エッジを再取得して最新状態に
        await fetchNodes();
        await fetchEdges();
        return data.data;
      }
      return null;
    } catch {
      console.error('キーワード抽出エラー');
      return null;
    }
  }, [userId, fetchNodes, fetchEdges]);

  // クラスター差分取得
  const getClusterDiff = useCallback(async (taskId: string): Promise<ClusterDiff | null> => {
    try {
      const params = new URLSearchParams({ taskId, userId });
      const res = await fetch(`/api/clusters/diff?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        return data.data;
      }
      return null;
    } catch {
      console.error('クラスター差分取得エラー');
      return null;
    }
  }, [userId]);

  // 初回取得
  useEffect(() => {
    fetchNodes();
    fetchEdges();
    fetchClusters();
    fetchStats();
  }, [fetchNodes, fetchEdges, fetchClusters, fetchStats]);

  return {
    // データ
    nodes,
    edges,
    clusters,
    stats,
    isLoading,
    error,
    // アクション
    fetchNodes,
    fetchEdges,
    fetchClusters,
    fetchStats,
    extractFromText,
    getClusterDiff,
    // 再取得
    refresh: () => {
      fetchNodes();
      fetchEdges();
      fetchClusters();
      fetchStats();
    },
  };
}
