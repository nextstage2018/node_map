// Phase 25: ユーザーチャネル購読管理 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// デモモード用のインメモリストア
const demoSubscriptions: Record<string, any[]> = {};

// ========================================
// GET: ユーザーの購読チャネル一覧取得
// ========================================
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const searchParams = request.nextUrl.searchParams;
    const serviceName = searchParams.get('service');

    const supabase = createServerClient();
    if (!supabase) {
      // デモモード
      const subs = (demoSubscriptions[userId] || [])
        .filter(s => !serviceName || s.service_name === serviceName);
      return NextResponse.json({ success: true, data: subs });
    }

    let query = supabase
      .from('user_channel_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('service_name')
      .order('channel_name');

    if (serviceName) {
      query = query.eq('service_name', serviceName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('チャネル購読取得エラー:', error);
      return NextResponse.json(
        { success: false, error: 'チャネル購読の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('チャネル購読API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラー' },
      { status: 500 }
    );
  }
}

// ========================================
// POST: 購読チャネル追加/更新（バッチ対応）
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();
    const { serviceName, channels } = body;

    // バリデーション
    const validServices = ['gmail', 'slack', 'chatwork'];
    if (!serviceName || !validServices.includes(serviceName)) {
      return NextResponse.json(
        { success: false, error: `無効なサービス名です。有効: ${validServices.join(', ')}` },
        { status: 400 }
      );
    }

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チャネル情報が必要です' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    if (!supabase) {
      // デモモード
      if (!demoSubscriptions[userId]) demoSubscriptions[userId] = [];
      // 既存の同サービスの購読を削除してから追加
      demoSubscriptions[userId] = demoSubscriptions[userId].filter(
        (s) => s.service_name !== serviceName
      );
      for (const ch of channels) {
        demoSubscriptions[userId].push({
          id: crypto.randomUUID(),
          user_id: userId,
          service_name: serviceName,
          channel_id: ch.channel_id,
          channel_name: ch.channel_name,
          channel_type: ch.channel_type || null,
          is_active: ch.is_active !== false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({ success: true, message: '購読を更新しました' });
    }

    // 既存の同サービス購読を一旦全て無効化
    await supabase
      .from('user_channel_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('service_name', serviceName);

    // 選択されたチャネルをupsert
    const records = channels.map((ch: any) => ({
      user_id: userId,
      service_name: serviceName,
      channel_id: ch.channel_id,
      channel_name: ch.channel_name,
      channel_type: ch.channel_type || null,
      is_active: ch.is_active !== false,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('user_channel_subscriptions')
      .upsert(records, {
        onConflict: 'user_id,service_name,channel_id',
      });

    if (error) {
      console.error('チャネル購読upsertエラー:', error);
      return NextResponse.json(
        { success: false, error: 'チャネル購読の更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: '購読を更新しました' });
  } catch (error) {
    console.error('チャネル購読POST エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラー' },
      { status: 500 }
    );
  }
}

// ========================================
// DELETE: 購読解除（サービス単位 or 個別）
// ========================================
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const searchParams = request.nextUrl.searchParams;
    const serviceName = searchParams.get('service');
    const channelId = searchParams.get('channelId');

    if (!serviceName) {
      return NextResponse.json(
        { success: false, error: 'service パラメータが必要です' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    if (!supabase) {
      // デモモード
      if (demoSubscriptions[userId]) {
        demoSubscriptions[userId] = demoSubscriptions[userId].filter((s) => {
          if (s.service_name !== serviceName) return true;
          if (channelId && s.channel_id !== channelId) return true;
          return false;
        });
      }
      return NextResponse.json({ success: true, message: '購読を解除しました' });
    }

    let query = supabase
      .from('user_channel_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('service_name', serviceName);

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    const { error } = await query;

    if (error) {
      console.error('チャネル購読削除エラー:', error);
      return NextResponse.json(
        { success: false, error: '購読の解除に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: '購読を解除しました' });
  } catch (error) {
    console.error('チャネル購読DELETE エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラー' },
      { status: 500 }
    );
  }
}
