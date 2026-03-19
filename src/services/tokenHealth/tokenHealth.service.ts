// v10.4: トークンヘルスチェックサービス
// 全サービス（Google/Slack/Chatwork）のトークン有効性を検証

import { getServerSupabase, getSupabase } from '@/lib/supabase';

const GOOGLE_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ========================================
// 型定義
// ========================================
export type TokenStatus = 'healthy' | 'expiring_soon' | 'expired' | 'invalid' | 'not_connected' | 'error';

export interface ServiceHealth {
  service: 'google' | 'slack' | 'chatwork';
  status: TokenStatus;
  message: string;
  lastChecked: string;
  details?: {
    email?: string;
    teamName?: string;
    accountName?: string;
    expiresAt?: string | null;
    scopes?: string[];
    hasCalendarScope?: boolean;
    hasDriveScope?: boolean;
  };
}

export interface UserTokenHealth {
  userId: string;
  services: ServiceHealth[];
  hasIssues: boolean;
  checkedAt: string;
}

// ========================================
// ヘルスチェック: Google
// ========================================
async function checkGoogleHealth(userId: string): Promise<ServiceHealth> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) {
    return {
      service: 'google',
      status: 'error',
      message: 'DB接続エラー',
      lastChecked: new Date().toISOString(),
    };
  }

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data, updated_at, last_used_at')
    .eq('user_id', userId)
    .eq('service_name', 'gmail')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.token_data) {
    return {
      service: 'google',
      status: 'not_connected',
      message: '未接続',
      lastChecked: new Date().toISOString(),
    };
  }

  const tokenData = data.token_data as {
    access_token?: string;
    refresh_token?: string;
    expiry?: string | null;
    email?: string;
    scope?: string;
  };

  const scopes = tokenData.scope ? tokenData.scope.split(/[, ]+/) : [];
  const hasCalendarScope = scopes.some(s => s.includes('calendar'));
  const hasDriveScope = scopes.some(s => s.includes('drive'));

  // まずアクセストークンでAPI疎通テスト
  if (tokenData.access_token) {
    try {
      const testRes = await fetch(`${CALENDAR_API_BASE}/calendars/primary?fields=id`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (testRes.ok) {
        // expiry チェック（期限切れが近いか）
        let expiringWarning = false;
        if (tokenData.expiry) {
          const expiry = new Date(tokenData.expiry);
          const now = new Date();
          const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (hoursUntilExpiry < 1 && hoursUntilExpiry > 0) {
            expiringWarning = true;
          }
        }

        return {
          service: 'google',
          status: expiringWarning ? 'expiring_soon' : 'healthy',
          message: expiringWarning ? 'トークン期限切れ間近（自動更新予定）' : '正常に接続中',
          lastChecked: new Date().toISOString(),
          details: {
            email: tokenData.email,
            expiresAt: tokenData.expiry,
            scopes,
            hasCalendarScope,
            hasDriveScope,
          },
        };
      }

      // 401 → refresh_token で復旧を試行
      if (testRes.status === 401) {
        if (tokenData.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          try {
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token',
              }),
            });

            if (refreshRes.ok) {
              return {
                service: 'google',
                status: 'expiring_soon',
                message: 'アクセストークン期限切れ（リフレッシュ可能）',
                lastChecked: new Date().toISOString(),
                details: {
                  email: tokenData.email,
                  expiresAt: tokenData.expiry,
                  scopes,
                  hasCalendarScope,
                  hasDriveScope,
                },
              };
            }

            // リフレッシュも失敗 → 無効
            return {
              service: 'google',
              status: 'expired',
              message: 'トークン無効（再認証が必要）',
              lastChecked: new Date().toISOString(),
              details: {
                email: tokenData.email,
                scopes,
                hasCalendarScope,
                hasDriveScope,
              },
            };
          } catch {
            return {
              service: 'google',
              status: 'expired',
              message: 'リフレッシュ失敗（再認証が必要）',
              lastChecked: new Date().toISOString(),
              details: { email: tokenData.email },
            };
          }
        }

        // refresh_tokenがない
        return {
          service: 'google',
          status: 'expired',
          message: 'トークン期限切れ（再認証が必要）',
          lastChecked: new Date().toISOString(),
          details: { email: tokenData.email },
        };
      }

      // その他のエラー（403等）
      return {
        service: 'google',
        status: 'invalid',
        message: `APIエラー (${testRes.status})`,
        lastChecked: new Date().toISOString(),
        details: { email: tokenData.email },
      };
    } catch (err) {
      return {
        service: 'google',
        status: 'error',
        message: `接続チェック失敗: ${err instanceof Error ? err.message : '不明'}`,
        lastChecked: new Date().toISOString(),
        details: { email: tokenData.email },
      };
    }
  }

  return {
    service: 'google',
    status: 'invalid',
    message: 'アクセストークンなし',
    lastChecked: new Date().toISOString(),
  };
}

// ========================================
// ヘルスチェック: Slack
// ========================================
async function checkSlackHealth(userId: string): Promise<ServiceHealth> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) {
    return {
      service: 'slack',
      status: 'error',
      message: 'DB接続エラー',
      lastChecked: new Date().toISOString(),
    };
  }

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data, updated_at')
    .eq('user_id', userId)
    .eq('service_name', 'slack')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.token_data) {
    return {
      service: 'slack',
      status: 'not_connected',
      message: '未接続',
      lastChecked: new Date().toISOString(),
    };
  }

  const tokenData = data.token_data as {
    access_token?: string;
    team_name?: string;
    authed_user_name?: string;
  };

  if (!tokenData.access_token) {
    return {
      service: 'slack',
      status: 'invalid',
      message: 'アクセストークンなし',
      lastChecked: new Date().toISOString(),
    };
  }

  // Slack auth.test でトークン検証
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const result = await res.json();

    if (result.ok) {
      return {
        service: 'slack',
        status: 'healthy',
        message: '正常に接続中',
        lastChecked: new Date().toISOString(),
        details: {
          teamName: result.team || tokenData.team_name,
        },
      };
    }

    // token_revoked, invalid_auth, account_inactive 等
    const errorMsg = result.error || 'unknown_error';
    if (['token_revoked', 'invalid_auth', 'account_inactive'].includes(errorMsg)) {
      return {
        service: 'slack',
        status: 'expired',
        message: `トークン無効 (${errorMsg})。再認証が必要`,
        lastChecked: new Date().toISOString(),
        details: { teamName: tokenData.team_name },
      };
    }

    return {
      service: 'slack',
      status: 'invalid',
      message: `Slack APIエラー: ${errorMsg}`,
      lastChecked: new Date().toISOString(),
      details: { teamName: tokenData.team_name },
    };
  } catch (err) {
    return {
      service: 'slack',
      status: 'error',
      message: `接続チェック失敗: ${err instanceof Error ? err.message : '不明'}`,
      lastChecked: new Date().toISOString(),
      details: { teamName: tokenData.team_name },
    };
  }
}

// ========================================
// ヘルスチェック: Chatwork
// ========================================
async function checkChatworkHealth(userId: string): Promise<ServiceHealth> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) {
    return {
      service: 'chatwork',
      status: 'error',
      message: 'DB接続エラー',
      lastChecked: new Date().toISOString(),
    };
  }

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data, updated_at')
    .eq('user_id', userId)
    .eq('service_name', 'chatwork')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.token_data) {
    return {
      service: 'chatwork',
      status: 'not_connected',
      message: '未接続',
      lastChecked: new Date().toISOString(),
    };
  }

  const tokenData = data.token_data as {
    api_token?: string;
    account_name?: string;
    account_id?: string;
  };

  const apiToken = tokenData.api_token;
  if (!apiToken) {
    return {
      service: 'chatwork',
      status: 'invalid',
      message: 'APIトークンなし',
      lastChecked: new Date().toISOString(),
    };
  }

  // Chatwork /v2/me でトークン検証
  try {
    const res = await fetch('https://api.chatwork.com/v2/me', {
      headers: { 'X-ChatWorkToken': apiToken },
    });

    if (res.ok) {
      const me = await res.json();
      return {
        service: 'chatwork',
        status: 'healthy',
        message: '正常に接続中',
        lastChecked: new Date().toISOString(),
        details: {
          accountName: me.name || tokenData.account_name,
        },
      };
    }

    if (res.status === 401) {
      return {
        service: 'chatwork',
        status: 'expired',
        message: 'APIトークン無効（再発行が必要）',
        lastChecked: new Date().toISOString(),
        details: { accountName: tokenData.account_name },
      };
    }

    // 429 Rate limit等
    if (res.status === 429) {
      return {
        service: 'chatwork',
        status: 'healthy',
        message: 'レート制限中（トークン自体は有効）',
        lastChecked: new Date().toISOString(),
        details: { accountName: tokenData.account_name },
      };
    }

    return {
      service: 'chatwork',
      status: 'invalid',
      message: `APIエラー (${res.status})`,
      lastChecked: new Date().toISOString(),
      details: { accountName: tokenData.account_name },
    };
  } catch (err) {
    return {
      service: 'chatwork',
      status: 'error',
      message: `接続チェック失敗: ${err instanceof Error ? err.message : '不明'}`,
      lastChecked: new Date().toISOString(),
      details: { accountName: tokenData.account_name },
    };
  }
}

// ========================================
// メインエントリ: ユーザー別ヘルスチェック
// ========================================
export async function checkUserTokenHealth(userId: string): Promise<UserTokenHealth> {
  const [google, slack, chatwork] = await Promise.all([
    checkGoogleHealth(userId),
    checkSlackHealth(userId),
    checkChatworkHealth(userId),
  ]);

  const services = [google, slack, chatwork];
  const hasIssues = services.some(s =>
    s.status === 'expired' || s.status === 'invalid'
  );

  return {
    userId,
    services,
    hasIssues,
    checkedAt: new Date().toISOString(),
  };
}

// ========================================
// 全ユーザー一括チェック（Cron用）
// ========================================
export async function checkAllUsersTokenHealth(): Promise<UserTokenHealth[]> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return [];

  // アクティブなトークンを持つ全ユーザーを取得
  const { data: tokens } = await supabase
    .from('user_service_tokens')
    .select('user_id')
    .eq('is_active', true);

  if (!tokens || tokens.length === 0) return [];

  // ユニークなユーザーID
  const userIds = [...new Set(tokens.map(t => t.user_id))];

  const results: UserTokenHealth[] = [];
  for (const userId of userIds) {
    try {
      const health = await checkUserTokenHealth(userId);
      results.push(health);
    } catch (err) {
      console.error(`[TokenHealth] ユーザー ${userId} のチェック失敗:`, err);
    }
  }

  return results;
}
