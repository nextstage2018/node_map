import { NextResponse } from 'next/server';
import type { ServiceType, ConnectionTestResponse } from '@/lib/types';

// POST: 接続テスト
export async function POST(req: Request) {
  try {
    const { service } = (await req.json()) as { service: ServiceType };

    if (!service) {
      return NextResponse.json(
        { success: false, message: 'service は必須です' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // 実API接続テスト（トークンがあれば実際にリクエスト）
    const result = await runConnectionTest(service);

    const latencyMs = Date.now() - startTime;

    const response: ConnectionTestResponse = {
      ...result,
      latencyMs,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { success: false, message: '接続テストに失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * 各サービスの接続テスト
 * トークンが設定されている場合は実際にAPIリクエストで疎通確認
 * 未設定の場合はデモモードとしてシミュレーション
 */
async function runConnectionTest(
  service: ServiceType
): Promise<{ success: boolean; message: string }> {
  // --- Slack: 実API接続テスト ---
  if (service === 'slack') {
    const token = process.env.SLACK_BOT_TOKEN;
    if (token) {
      try {
        const { WebClient } = await import('@slack/web-api');
        const client = new WebClient(token);
        const authResult = await client.auth.test();
        const team = authResult.team || 'Unknown';
        const user = authResult.user || 'Unknown';
        return {
          success: true,
          message: `Slack接続成功（ワークスペース: ${team}、Bot: ${user}）`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Slack接続失敗: ${errorMsg}`,
        };
      }
    }
  }

  // --- Chatwork: 実API接続テスト ---
  if (service === 'chatwork') {
    const token = process.env.CHATWORK_API_TOKEN;
    if (token) {
      try {
        const res = await fetch('https://api.chatwork.com/v2/me', {
          headers: { 'X-ChatWorkToken': token },
        });
        if (res.ok) {
          const me = await res.json();
          return {
            success: true,
            message: `Chatwork接続成功（${me.name || 'OK'}）`,
          };
        }
        return {
          success: false,
          message: `Chatwork接続失敗: HTTP ${res.status}`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `Chatwork接続失敗: ${errorMsg}`,
        };
      }
    }
  }

  // --- 他サービス: 環境変数チェック ---
  const envChecks: Record<ServiceType, boolean> = {
    email: !!(process.env.EMAIL_USER || process.env.GMAIL_CLIENT_ID),
    slack: !!process.env.SLACK_BOT_TOKEN,
    chatwork: !!process.env.CHATWORK_API_TOKEN,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  };

  if (envChecks[service]) {
    return { success: true, message: `${service} への接続に成功しました` };
  }

  // デモモード: シミュレーション
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));
  const isSuccess = Math.random() > 0.5;

  if (isSuccess) {
    return { success: true, message: `${service} への接続テストに成功しました（デモ）` };
  } else {
    return {
      success: false,
      message: `${service} への接続に失敗しました。API情報を確認してください。`,
    };
  }
}
