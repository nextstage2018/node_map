import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { ConnectionStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET: 設定取得（接続状態をSupabaseのuser_service_tokensから読み取り）
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // 未認証でもシステム接続状態は返す
    const systemConnections = [
      {
        type: 'anthropic' as const,
        status: (process.env.ANTHROPIC_API_KEY ? 'connected' : 'disconnected') as ConnectionStatus,
      },
      {
        type: 'supabase' as const,
        status: (process.env.NEXT_PUBLIC_SUPABASE_URL ? 'connected' : 'disconnected') as ConnectionStatus,
      },
    ];

    // ユーザーサービス接続状態
    let userConnections = [
      { type: 'email' as const, status: 'disconnected' as ConnectionStatus },
      { type: 'slack' as const, status: 'disconnected' as ConnectionStatus },
      { type: 'chatwork' as const, status: 'disconnected' as ConnectionStatus },
    ];

    if (user && !authError) {
      // user_service_tokensテーブルから接続状態を読み取り
      const { data: tokens } = await supabase
        .from('user_service_tokens')
        .select('service_type, is_active')
        .eq('user_id', user.id);

      if (tokens) {
        userConnections = userConnections.map((conn) => {
          const token = tokens.find((t: { service_type: string; is_active: boolean }) => t.service_type === conn.type);
          return {
            ...conn,
            status: (token && token.is_active ? 'connected' : 'disconnected') as ConnectionStatus,
          };
        });
      }
    }

    // プロフィール情報
    const profile = user ? {
      displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || '',
      email: user.email || '',
      timezone: user.user_metadata?.timezone || 'Asia/Tokyo',
      language: user.user_metadata?.language || 'ja',
    } : {
      displayName: '',
      email: '',
      timezone: 'Asia/Tokyo',
      language: 'ja',
    };

    return NextResponse.json({
      success: true,
      data: {
        profile,
        connections: [...userConnections, ...systemConnections],
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: '設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT: 通知設定など汎用設定の保存
export async function PUT(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { notifications } = body;

    if (notifications) {
      // 通知設定をuser_metadataに保存
      await supabase.auth.updateUser({
        data: { notifications },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: '設定の保存に失敗しました' },
      { status: 500 }
    );
  }
}
