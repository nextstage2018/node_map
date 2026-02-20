'use client';

import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import type { ServiceType, ChannelAuthType, ChannelAuth, UserPreferences } from '@/lib/types';
import { SERVICE_CONFIG, CONNECTION_STATUS_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
import Header from '@/components/shared/Header';
import ConnectionOverview from '@/components/settings/ConnectionOverview';
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
      <div className="flex flex-col h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <div className="animate-spin text-2xl mb-2">⚙️</div>
            <p className="text-sm text-slate-500">設定を読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  const channelServices: ServiceType[] = ['email', 'slack', 'chatwork'];
  const infraServices: ServiceType[] = ['anthropic', 'supabase'];

  const tabs: { key: SettingsTab; label: string; icon: string; description: string }[] = [
    { key: 'admin', label: '管理者設定', icon: '🔧', description: 'API接続・インフラ基盤' },
    { key: 'personal', label: '個人設定', icon: '👤', description: '認証・プロフィール・表示' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* ページヘッダー */}
          <div>
          <h1 className="text-xl font-bold text-slate-900">設定</h1>
          <p className="text-sm text-slate-500 mt-1">
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
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tab.icon}</span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    activeTab === tab.key ? 'text-blue-700' : 'text-slate-700'
                  )}
                >
                  {tab.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">{tab.description}</p>
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

            {/* チャネル連携ステータス */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
                📨 チャネル連携
              </h2>
              <div className="space-y-3">
                {channelServices.map((type) => {
                  const conn = getConnection(type);
                  const svcConfig = SERVICE_CONFIG[type as keyof typeof SERVICE_CONFIG];
                  const stConfig = CONNECTION_STATUS_CONFIG[conn.status];
                  return (
                    <div key={type} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', svcConfig.color.split(' ')[0])}>
                          <img src={svcConfig.icon} alt={svcConfig.label} width={24} height={24} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{svcConfig.label}</h3>
                          <p className="text-xs text-slate-500">{svcConfig.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={cn('w-2.5 h-2.5 rounded-full', stConfig.dotColor)} />
                        <span className={cn('text-sm font-medium', stConfig.color.split(' ')[1])}>
                          {stConfig.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI・データベース ステータス */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
                🤖 AI・データベース
              </h2>
              <div className="space-y-3">
                {infraServices.map((type) => {
                  const conn = getConnection(type);
                  const svcConfig = SERVICE_CONFIG[type as keyof typeof SERVICE_CONFIG];
                  const stConfig = CONNECTION_STATUS_CONFIG[conn.status];
                  return (
                    <div key={type} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', svcConfig.color.split(' ')[0])}>
                          <img src={svcConfig.icon} alt={svcConfig.label} width={24} height={24} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{svcConfig.label}</h3>
                          <p className="text-xs text-slate-500">{svcConfig.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={cn('w-2.5 h-2.5 rounded-full', stConfig.dotColor)} />
                        <span className={cn('text-sm font-medium', stConfig.color.split(' ')[1])}>
                          {stConfig.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 環境変数の案内 */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-start gap-2">
                <span className="text-sm">ℹ️</span>
                <div>
                  <h3 className="text-xs font-bold text-slate-700 mb-1">接続設定について</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    各サービスのAPI情報はVercelの環境変数で管理されています。接続状況を変更する場合は、Vercelダッシュボードから環境変数を更新してください。
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
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">
                🔑 アカウント認証
              </h2>
              <p className="text-xs text-slate-500 mb-3">
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
    </div>
  );
}
