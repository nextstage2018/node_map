import { NextResponse } from 'next/server';
import type {
  AppSettings,
  ServiceType,
  ConnectionStatus,
} from '@/lib/types';
// force dynamic rendering to prevent static cache
export const dynamic = 'force-dynamic';


// インメモリ設定ストア（本番はSupabase or 環境変数）
let appSettings: AppSettings = {
  profile: {
    displayName: 'テストユーザー',
    email: 'test@example.com',
    timezone: 'Asia/Tokyo',
    language: 'ja',
  },
  connections: [
    {
      type: 'email',
      status: ((process.env.EMAIL_USER || process.env.GMAIL_CLIENT_ID) ? 'connected' : 'disconnected') as ConnectionStatus,
    },
    {
      type: 'slack',
      status: (process.env.SLACK_BOT_TOKEN ? 'connected' : 'disconnected') as ConnectionStatus,
    },
    {
      type: 'chatwork',
      status: (process.env.CHATWORK_API_TOKEN ? 'connected' : 'disconnected') as ConnectionStatus,
    },
    {
      type: 'anthropic',
      status: (process.env.ANTHROPIC_API_KEY ? 'connected' : 'disconnected') as ConnectionStatus,
    },
    {
      type: 'supabase',
      status: (process.env.NEXT_PUBLIC_SUPABASE_URL ? 'connected' : 'disconnected') as ConnectionStatus,
    },
  ],
};

// サービス別の保存済み設定（メモリ内。本番は暗号化してDB保存）
const savedServiceSettings: Record<string, Record<string, string>> = {};

// GET: 設定取得
export async function GET() {
  // 環境変数から接続状態を再評価
  const envChecks: Record<ServiceType, string | undefined> = {
    email: process.env.EMAIL_USER || process.env.GMAIL_CLIENT_ID || savedServiceSettings.email?.clientId,
    slack: process.env.SLACK_BOT_TOKEN || savedServiceSettings.slack?.botToken,
    chatwork: process.env.CHATWORK_API_TOKEN || savedServiceSettings.chatwork?.apiToken,
    anthropic: process.env.ANTHROPIC_API_KEY || savedServiceSettings.anthropic?.apiKey,
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL || savedServiceSettings.supabase?.url,
  };

  appSettings.connections = appSettings.connections.map((conn) => ({
    ...conn,
    status: envChecks[conn.type] ? 'connected' as ConnectionStatus : conn.status,
  }));

  return NextResponse.json({
    success: true,
    data: appSettings,
  });
}

// PUT: サービス設定を保存
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { service, settings } = body as {
      service: ServiceType;
      settings: Record<string, string>;
    };

    if (!service || !settings) {
      return NextResponse.json(
        { success: false, error: 'service と settings は必須です' },
        { status: 400 }
      );
    }

    // 設定を保存（メモリ内。本番は暗号化してDB保存）
    savedServiceSettings[service] = settings;

    // 接続ステータスを更新
    const connIdx = appSettings.connections.findIndex((c) => c.type === service);
    if (connIdx >= 0) {
      appSettings.connections[connIdx] = {
        ...appSettings.connections[connIdx],
        status: 'connected',
        lastTested: new Date().toISOString(),
      };
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: '設定の保存に失敗しました' },
      { status: 500 }
    );
  }
}
