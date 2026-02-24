// 設定サービス（クライアント側）- Phase 24: トークンAPI・プロフィールAPI接続対応
import {
  AppSettings,
  ServiceType,
  ServiceConnection,
  ConnectionStatus,
  ProfileSettings,
  ConnectionTestResponse,
} from '@/lib/types';

// トークン情報の型
interface ServiceToken {
  id: string;
  service_name: string;
  token_data: Record<string, any>;
  is_active: boolean;
  connected_at: string;
  last_used_at: string | null;
}

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

  // 設定を取得（admin設定 — 環境変数ベース）
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

  // サービス設定を保存（admin設定）
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

  // === Phase 24: プロフィールAPI ===

  // プロフィール取得
  async getProfile(): Promise<ProfileSettings | null> {
    try {
      const res = await fetch('/api/settings/profile');
      const data = await res.json();
      if (data.success && data.data) {
        this.settings.profile = data.data;
        return data.data;
      }
      return null;
    } catch {
      return null;
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

  // === Phase 24: トークン管理API ===

  // ユーザーのサービストークン一覧を取得
  async getServiceTokens(): Promise<ServiceToken[]> {
    try {
      const res = await fetch('/api/settings/tokens');
      const data = await res.json();
      if (data.success && data.data) {
        return data.data;
      }
      return [];
    } catch {
      return [];
    }
  }

  // サービストークンを保存（手動入力用 — Chatwork等）
  async saveServiceToken(
    serviceName: string,
    tokenData: Record<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName, tokenData }),
      });
      return await res.json();
    } catch {
      return { success: false, error: 'トークンの保存に失敗しました' };
    }
  }

  // サービストークンを削除（接続解除）
  async deleteServiceToken(
    serviceName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/settings/tokens?serviceName=${serviceName}`, {
        method: 'DELETE',
      });
      return await res.json();
    } catch {
      return { success: false, error: 'トークンの削除に失敗しました' };
    }
  }

  // === OAuth連携 ===

  // Gmail OAuth開始（リダイレクト）
  startGmailOAuth(): void {
    window.location.href = '/api/auth/gmail';
  }

  // Slack OAuth開始（リダイレクト）
  startSlackOAuth(): void {
    window.location.href = '/api/auth/slack';
  }

  // === 接続テスト ===

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
