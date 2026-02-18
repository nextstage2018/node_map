'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  NodeData,
  EdgeData,
  ClusterData,
  ClusterDiff,
  MapUser,
  MapViewMode,
  MapState,
} from '@/lib/types';

interface NodeMapData {
  nodes: NodeData[];
  edges: EdgeData[];
  clusters: ClusterData[];
}

export function useNodeMap() {
  const [data, setData] = useState<NodeMapData>({ nodes: [], edges: [], clusters: [] });
  const [compareData, setCompareData] = useState<NodeMapData>({ nodes: [], edges: [], clusters: [] });
  const [users, setUsers] = useState<MapUser[]>([]);
  const [clusterDiff, setClusterDiff] = useState<ClusterDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [mapState, setMapState] = useState<MapState>({
    viewMode: 'base',
    selectedTaskId: null,
    selectedUserId: 'user_self',
    compareUserId: null,
    isCompareMode: false,
  });

  // ユーザー一覧取得
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/nodemap/users');
      const json = await res.json();
      if (json.success) setUsers(json.data);
    } catch {
      // fallback
    }
  }, []);

  // ノードマップデータ取得
  const fetchMapData = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/nodemap?userId=${userId}`);
      const json = await res.json();
      if (json.success) {
        return json.data as NodeMapData;
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
    return { nodes: [], edges: [], clusters: [] };
  }, []);

  // メインデータの読み込み
  const loadMainData = useCallback(async (userId: string) => {
    const result = await fetchMapData(userId);
    setData(result);
  }, [fetchMapData]);

  // 比較データの読み込み
  const loadCompareData = useCallback(async (userId: string) => {
    const result = await fetchMapData(userId);
    setCompareData(result);
  }, [fetchMapData]);

  // クラスター差分の取得
  const fetchClusterDiff = useCallback(async (taskId: string, userId: string) => {
    try {
      const res = await fetch(`/api/clusters/diff?taskId=${taskId}&userId=${userId}`);
      const json = await res.json();
      if (json.success) setClusterDiff(json.data);
    } catch {
      // fallback
    }
  }, []);

  // 表示モード切替
  const setViewMode = useCallback((mode: MapViewMode) => {
    setMapState((prev) => ({ ...prev, viewMode: mode }));
  }, []);

  // タスク選択
  const selectTask = useCallback((taskId: string | null) => {
    setMapState((prev) => ({
      ...prev,
      selectedTaskId: taskId,
      viewMode: taskId ? 'ideation' : 'base',
    }));
    if (taskId) {
      fetchClusterDiff(taskId, mapState.selectedUserId);
    } else {
      setClusterDiff(null);
    }
  }, [fetchClusterDiff, mapState.selectedUserId]);

  // ユーザー切替
  const selectUser = useCallback(async (userId: string) => {
    setMapState((prev) => ({
      ...prev,
      selectedUserId: userId,
      selectedTaskId: null,
      viewMode: 'base',
    }));
    await loadMainData(userId);
  }, [loadMainData]);

  // 比較モード切替
  const toggleCompareMode = useCallback(async (compareUserId: string | null) => {
    if (compareUserId) {
      setMapState((prev) => ({
        ...prev,
        isCompareMode: true,
        compareUserId,
      }));
      await loadCompareData(compareUserId);
    } else {
      setMapState((prev) => ({
        ...prev,
        isCompareMode: false,
        compareUserId: null,
      }));
      setCompareData({ nodes: [], edges: [], clusters: [] });
    }
  }, [loadCompareData]);

  // 初期データ読み込み
  useEffect(() => {
    fetchUsers();
    loadMainData('user_self');
  }, [fetchUsers, loadMainData]);

  // タスク一覧（クラスターから抽出。構想面のsummaryをタスク名として使用）
  const availableTasks = Array.from(
    new Set(data.clusters.map((c) => c.taskId))
  ).map((taskId) => {
    const ideation = data.clusters.find((c) => c.taskId === taskId && c.clusterType === 'ideation');
    const anyCluster = data.clusters.find((c) => c.taskId === taskId);
    return { id: taskId, label: ideation?.summary || anyCluster?.summary || taskId };
  });

  return {
    data,
    compareData,
    users,
    mapState,
    clusterDiff,
    isLoading,
    availableTasks,
    setViewMode,
    selectTask,
    selectUser,
    toggleCompareMode,
  };
}
