// 設定サービス（クライアント側）
import {
  AppSettings,
  ServiceType,
  ServiceConnection,
  ConnectionStatus,
  ProfileSettings,
  ConnectionTestResponse,
} from '@/lib/types';

class SettingsService {
  private settings: AppSettings;

  constructor() {
    this.settings = this.getDefaultSettings();
  }

  private getDefaultSettings(): AppSettings {
    return {
      profile: {
        displayName: '',
        email: '',
        timezone: 'Asia/Tokyo',
        language: 'ja',
      },
      connections: [
        { type: 'email', status: 'disconnected' },
        { type: 'slack', status: 'disconnected' },
        { type: 'chatwork', status: 'disconnected' },
        { type: 'anthropic', status: 'disconnected' },
        { type: 'supabase', status: 'disconnected' },
      ],
    };
  }

  // 設定を取得
  async getSettings(): Promise<AppSettings> {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        this.settings = data.data;
      }
    } catch {
      // フォールバック: ローカル設定を使用
    }
    return this.settings;
  }

  // サービス設定を保存
  async saveServiceSettings(
    service: ServiceType,
    settings: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, settings }),
      });
      const data = await res.json();
      if (data.success) {
        await this.getSettings(); // 再取得
      }
      return data;
    } catch {
      return { success: false, error: '設定の保存に失敗しました' };
    }
  }

  // プロフィール設定を保存
  async saveProfileSettings(
    profile: Partial<ProfileSettings>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        this.settings.profile = { ...this.settings.profile, ...profile };
      }
      return data;
    } catch {
      return { success: false, error: 'プロフィールの保存に失敗しました' };
    }
  }

  // 接続テスト
  async testConnection(service: ServiceType): Promise<ConnectionTestResponse> {
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      return await res.json();
    } catch {
      return { success: false, message: '接続テストに失敗しました' };
    }
  }

  // 接続ステータスを取得
  getConnectionStatus(service: ServiceType): ServiceConnection {
    return (
      this.settings.connections.find((c) => c.type === service) || {
        type: service,
        status: 'disconnected' as ConnectionStatus,
      }
    );
  }

  // 接続済みサービス数
  getConnectedCount(): number {
    return this.settings.connections.filter((c) => c.status === 'connected').length;
  }

  // 全サービス数
  getTotalServiceCount(): number {
    return this.settings.connections.length;
  }
}

export const settingsService = new SettingsService();
