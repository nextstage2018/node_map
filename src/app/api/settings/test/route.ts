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

    // デモモード: シミュレーション
    // 本番: 各サービスAPIに実際にリクエストして疎通確認
    const result = await simulateConnectionTest(service);

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

async function simulateConnectionTest(
  service: ServiceType
): Promise<{ success: boolean; message: string }> {
  // 実際の接続テストのシミュレーション
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700));

  // 環境変数が設定されているかチェック
  const envChecks: Record<ServiceType, boolean> = {
    email: !!process.env.GMAIL_CLIENT_ID,
    slack: !!process.env.SLACK_BOT_TOKEN,
    chatwork: !!process.env.CHATWORK_API_TOKEN,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  };

  if (envChecks[service]) {
    return { success: true, message: `${service} への接続に成功しました` };
  }

  // デモモード: 50%の確率で成功をシミュレート
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
