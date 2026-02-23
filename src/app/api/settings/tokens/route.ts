import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET: ユーザーのトークン一覧取得
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { data: tokens, error } = await supabase
      .from('user_service_tokens')
      .select('id, service_type, is_active, connected_at, updated_at, credentials')
      .eq('user_id', user.id);

    if (error) throw error;

    const safeTokens = (tokens || []).map(t => ({
      ...t,
      accountName: getAccountName(t.service_type, t.credentials),
      credentials: undefined,
    }));

    return NextResponse.json({ success: true, data: safeTokens });
  } catch (error) {
    console.error('トークン取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: トークン保存（upsert）
export async function POST(req: Request) {
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
    const { service_type, credentials } = body;

    if (!service_type || !credentials) {
      return NextResponse.json(
        { success: false, error: 'service_type と credentials は必須です' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_service_tokens')
      .upsert(
        {
          user_id: user.id,
          service_type,
          credentials,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,service_type' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        accountName: getAccountName(service_type, credentials),
        credentials: undefined,
      },
    });
  } catch (error) {
    console.error('トークン保存エラー:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの保存に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: トークン削除
export async function DELETE(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const serviceType = searchParams.get('service_type');

    if (!serviceType) {
      return NextResponse.json(
        { success: false, error: 'service_type は必須です' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('user_service_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('service_type', serviceType);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('トークン削除エラー:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの削除に失敗しました' },
      { status: 500 }
    );
  }
}

function getAccountName(serviceType: string, credentials: Record<string, string>): string {
  switch (serviceType) {
    case 'email':
      return credentials.email || credentials.user || '接続済み';
    case 'slack':
      return credentials.workspace || credentials.teamName || '接続済み';
    case 'chatwork':
      return credentials.accountName || '接続済み';
    default:
      return '接続済み';
  }
}
