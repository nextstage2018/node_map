// Phase 24: ユーザー別サービストークンCRUD API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// デモモード用のインメモリストア
const demoTokens: Record<string, any[]> = {};

// GET: 自分のトークン一覧取得（トークン値はマスクして返す）
export async function GET() {
  try {
    const userId = await getServerUserId();
    const sb = createServerClient();

    if (!sb) {
      // デモモード
      const tokens = demoTokens[userId] || [];
      return NextResponse.json({
        success: true,
        data: tokens.map(t => ({
          ...t,
          token_data: maskTokenData(t.token_data),
        })),
      });
    }

    const { data, error } = await sb
      .from('user_service_tokens')
      .select('id, service_name, is_active, connected_at, last_used_at, token_data')
      .eq('user_id', userId)
      .order('service_name');

    if (error) throw error;

    // トークン値をマスクして返す
    const masked = (data || []).map(row => ({
      ...row,
      token_data: maskTokenData(row.token_data),
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (error) {
    console.error('トークン取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: トークンを保存（upsert: 同じサービスがあれば更新）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();
    const { serviceName, tokenData } = body;

    if (!serviceName || !tokenData) {
      return NextResponse.json(
        { success: false, error: 'serviceName と tokenData は必須です' },
        { status: 400 }
      );
    }

    // 許可されたサービス名
    const allowedServices = ['gmail', 'slack', 'chatwork'];
    if (!allowedServices.includes(serviceName)) {
      return NextResponse.json(
        { success: false, error: `無効なサービス名です。許可: ${allowedServices.join(', ')}` },
        { status: 400 }
      );
    }

    const sb = createServerClient();

    if (!sb) {
      // デモモード
      if (!demoTokens[userId]) demoTokens[userId] = [];
      const existing = demoTokens[userId].findIndex(t => t.service_name === serviceName);
      const record = {
        id: `token-${Date.now()}`,
        service_name: serviceName,
        token_data: tokenData,
        is_active: true,
        connected_at: new Date().toISOString(),
        last_used_at: null,
      };
      if (existing >= 0) {
        demoTokens[userId][existing] = record;
      } else {
        demoTokens[userId].push(record);
      }
      return NextResponse.json({
        success: true,
        data: { ...record, token_data: maskTokenData(record.token_data) },
      });
    }

    const now = new Date().toISOString();

    const { data, error } = await sb
      .from('user_service_tokens')
      .upsert(
        {
          user_id: userId,
          service_name: serviceName,
          token_data: tokenData,
          is_active: true,
          connected_at: now,
          updated_at: now,
        },
        {
          onConflict: 'user_id,service_name',
        }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: { ...data, token_data: maskTokenData(data.token_data) },
    });
  } catch (error) {
    console.error('トークン保存エラー:', error);
    return NextResponse.json(
      { success: false, error: 'トークンの保存に失敗しました' },
      { status: 500 }
    );
  }
}

// DELETE: トークンを削除（接続解除）
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const { searchParams } = new URL(request.url);
    const serviceName = searchParams.get('serviceName');

    if (!serviceName) {
      return NextResponse.json(
        { success: false, error: 'serviceName は必須です' },
        { status: 400 }
      );
    }

    const sb = createServerClient();

    if (!sb) {
      // デモモード
      if (demoTokens[userId]) {
        demoTokens[userId] = demoTokens[userId].filter(t => t.service_name !== serviceName);
      }
      return NextResponse.json({ success: true });
    }

    const { error } = await sb
      .from('user_service_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('service_name', serviceName);

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

// ヘルパー: トークン値をマスクする（セキュリティ対策）
function maskTokenData(tokenData: Record<string, any>): Record<string, any> {
  const masked: Record<string, any> = {};
  for (const [key, value] of Object.entries(tokenData)) {
    if (typeof value === 'string' && value.length > 8) {
      masked[key] = value.slice(0, 4) + '****' + value.slice(-4);
    } else if (typeof value === 'string') {
      masked[key] = '****';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}
