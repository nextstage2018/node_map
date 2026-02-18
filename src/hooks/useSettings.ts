'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  AppSettings,
  ServiceType,
  ServiceConnection,
  ProfileSettings,
  ConnectionTestResponse,
} from '@/lib/types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setSettings(data.data);
      }
    } catch {
      // フォールバック
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveServiceSettings = async (
    service: ServiceType,
    serviceSettings: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, settings: serviceSettings }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchSettings();
      }
      return data;
    } catch {
      return { success: false, error: '保存に失敗しました' };
    }
  };

  const saveProfile = async (
    profile: Partial<ProfileSettings>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setSettings((prev) =>
          prev ? { ...prev, profile: { ...prev.profile, ...profile } } : prev
        );
      }
      return data;
    } catch {
      return { success: false, error: '保存に失敗しました' };
    }
  };

  const testConnection = async (
    service: ServiceType
  ): Promise<ConnectionTestResponse> => {
    // テスト中ステータスに一時変更
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        connections: prev.connections.map((c) =>
          c.type === service ? { ...c, status: 'testing' as const } : c
        ),
      };
    });

    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const result: ConnectionTestResponse = await res.json();

      // ステータス更新
      setSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          connections: prev.connections.map((c) =>
            c.type === service
              ? {
                  ...c,
                  status: result.success ? ('connected' as const) : ('error' as const),
                  lastTested: new Date().toISOString(),
                  errorMessage: result.success ? undefined : result.message,
                }
              : c
          ),
        };
      });

      return result;
    } catch {
      setSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          connections: prev.connections.map((c) =>
            c.type === service ? { ...c, status: 'error' as const } : c
          ),
        };
      });
      return { success: false, message: '接続テストに失敗しました' };
    }
  };

  const getConnection = (service: ServiceType): ServiceConnection => {
    return (
      settings?.connections.find((c) => c.type === service) || {
        type: service,
        status: 'disconnected',
      }
    );
  };

  const connectedCount =
    settings?.connections.filter((c) => c.status === 'connected').length ?? 0;
  const totalCount = settings?.connections.length ?? 5;

  return {
    settings,
    isLoading,
    fetchSettings,
    saveServiceSettings,
    saveProfile,
    testConnection,
    getConnection,
    connectedCount,
    totalCount,
  };
}
