'use client';

import { useSettings } from '@/hooks/useSettings';
import type { ServiceType } from '@/lib/types';
import { SERVICE_CONFIG } from '@/lib/constants';
import ConnectionOverview from '@/components/settings/ConnectionOverview';
import ServiceSettingsCard from '@/components/settings/ServiceSettingsCard';
import ProfileSettings from '@/components/settings/ProfileSettings';

export default function SettingsPage() {
  const {
    settings,
    isLoading,
    saveServiceSettings,
    saveProfile,
    testConnection,
    getConnection,
  } = useSettings();

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

  const serviceTypes: ServiceType[] = ['email', 'slack', 'chatwork', 'openai', 'supabase'];

  // チャネル系とインフラ系に分離
  const channelServices: ServiceType[] = ['email', 'slack', 'chatwork'];
  const infraServices: ServiceType[] = ['openai', 'supabase'];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* ページヘッダー */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            各サービスのAPI接続設定とプロフィールを管理します
          </p>
        </div>

        {/* 接続ステータス概要 */}
        <ConnectionOverview
          connections={settings.connections}
          connectedCount={settings.connections.filter((c) => c.status === 'connected').length}
          totalCount={settings.connections.length}
        />

        {/* チャネル接続設定 */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            📨 チャネル連携
          </h2>
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
            🔧 インフラ連携
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

        {/* プロフィール設定 */}
        <ProfileSettings
          profile={settings.profile}
          onSave={saveProfile}
        />

        {/* デモモード注記 */}
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-sm">💡</span>
            <div>
              <h3 className="text-xs font-bold text-amber-800 mb-1">デモモードについて</h3>
              <p className="text-xs text-amber-700 leading-relaxed">
                現在、API情報が未設定のサービスはデモモードで動作しています。
                実際のメッセージやAI機能を利用するには、各サービスのAPI情報を設定してください。
                設定は保存後、「接続テスト」で疎通確認ができます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
