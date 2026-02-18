'use client';

import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import type { ServiceType, ChannelAuthType, ChannelAuth, UserPreferences } from '@/lib/types';
import { cn } from '@/lib/utils';
import ConnectionOverview from '@/components/settings/ConnectionOverview';
import ServiceSettingsCard from '@/components/settings/ServiceSettingsCard';
import ProfileSettings from '@/components/settings/ProfileSettings';
import ChannelAuthCard from '@/components/settings/ChannelAuthCard';
import UserPreferencesCard from '@/components/settings/UserPreferencesCard';

type SettingsTab = 'admin' | 'personal';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('admin');
  const {
    settings,
    isLoading,
    saveServiceSettings,
    saveProfile,
    testConnection,
    getConnection,
  } = useSettings();

  // デモ用: 個人認証状態
  const [channelAuths, setChannelAuths] = useState<ChannelAuth[]>([
    { channel: 'email', status: 'unauthenticated' },
    { channel: 'slack', status: 'unauthenticated' },
    { channel: 'chatwork', status: 'unauthenticated' },
  ]);

  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    notificationsEnabled: true,
    emailDigest: 'daily',
    defaultInboxFilter: 'all',
    aiAutoSuggest: true,
  });

  // OAuth認証シミュレーション
  const handleAuth = async (channel: ChannelAuthType) => {
    // 本番: OAuth2フローを開始（ポップアップ or リダイレクト）
    await new Promise((r) => setTimeout(r, 1500));
    setChannelAuths((prev) =>
      prev.map((a) =>
        a.channel === channel
          ? {
              ...a,
              status: 'authenticated' as const,
              accountName:
                channel === 'email'
                  ? 'suzuki@company.com'
                  : channel === 'slack'
                  ? 'suzuki@workspace'
                  : 'suzuki_cw',
              authenticatedAt: new Date().toISOString(),
            }
          : a
      )
    );
  };

  const handleRevoke = async (channel: ChannelAuthType) => {
    setChannelAuths((prev) =>
      prev.map((a) =>
        a.channel === channel
          ? { ...a, status: 'unauthenticated' as const, accountName: undefined, authenticatedAt: undefined }
          : a
      )
    );
  };

  const handleSavePreferences = async (prefs: Partial<UserPreferences>) => {
    setUserPreferences((prev) => ({ ...prev, ...prefs }));
    return { success: true };
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin text-2xl mb-2">⚙️</div>
          <p className="text-sm text-gray-500">設定を読み込み中...</p>
        </div>
      </div>
    );
  }

  const channelServices: ServiceType[] = ['email', 'slack', 'chatwork'];
  const infraServices: ServiceType[] = ['openai', 'supabase'];

  const tabs: { key: SettingsTab; label: string; icon: string; description: string }[] = [
    { key: 'admin', label: '管理者設定', icon: '🔧', description: 'API接続・インフラ基盤' },
    { key: 'personal', label: '個人設定', icon: '👤', description: '認証・プロフィール・表示' },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* ページヘッダー */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            API接続・認証・プロフィールを管理します
          </p>
        </div>

        {/* タブ切り替え */}
        <div className="flex gap-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex-1 p-4 rounded-2xl border-2 transition-all text-left',
                activeTab === tab.key
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tab.icon}</span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    activeTab === tab.key ? 'text-blue-700' : 'text-gray-700'
                  )}
                >
                  {tab.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">{tab.description}</p>
            </button>
          ))}
        </div>

        {/* ===== 管理者設定タブ ===== */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            {/* 接続ステータス概要 */}
            <ConnectionOverview
              connections={settings.connections}
              connectedCount={settings.connections.filter((c) => c.status === 'connected').length}
              totalCount={settings.connections.length}
            />

            {/* チャネル連携設定 */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                📨 チャネル連携（API基盤）
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                各サービスのClient ID/Secret、Bot Token等を設定します。ユーザーの個人認証はこの設定が完了した後に行えます。
              </p>
              <div className="space-y-3">
                {channelServices.map((type) => (
                  <ServiceSettingsCard
                    key={type}
                    serviceType={type}
                    connection={getConnection(type)}
                    onSave={saveServiceSettings}
                    onTest={testConnection}
                  />
                ))}
              </div>
            </div>

            {/* インフラ設定 */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                🤖 AI・データベース
              </h2>
              <div className="space-y-3">
                {infraServices.map((type) => (
                  <ServiceSettingsCard
                    key={type}
                    serviceType={type}
                    connection={getConnection(type)}
                    onSave={saveServiceSettings}
                    onTest={testConnection}
                  />
                ))}
              </div>
            </div>

            {/* デモモード注記 */}
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-2">
                <span className="text-sm">💡</span>
                <div>
                  <h3 className="text-xs font-bold text-amber-800 mb-1">デモモードについて</h3>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    API情報が未設定のサービスはデモモードで動作しています。
                    実際のメッセージやAI機能を利用するには、各サービスのAPI情報を設定してください。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== 個人設定タブ ===== */}
        {activeTab === 'personal' && (
          <div className="space-y-6">
            {/* チャネル認証 */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-1">
                🔑 アカウント認証
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                各チャネルに自分のアカウントでログインします。管理者によるAPI基盤設定が完了している必要があります。
              </p>
              <div className="space-y-3">
                {channelAuths.map((auth) => (
                  <ChannelAuthCard
                    key={auth.channel}
                    channel={auth.channel}
                    auth={auth}
                    adminReady={
                      getConnection(auth.channel as ServiceType).status === 'connected'
                    }
                    onAuth={handleAuth}
                    onRevoke={handleRevoke}
                  />
                ))}
              </div>
            </div>

            {/* プロフィール */}
            <ProfileSettings
              profile={settings.profile}
              onSave={saveProfile}
            />

            {/* 表示・通知設定 */}
            <UserPreferencesCard
              preferences={userPreferences}
              onSave={handleSavePreferences}
            />
          </div>
        )}
      </div>
    </div>
  );
}
