// Phase 37: 組織チャネル紐づけ API（GET / POST / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// チャネル一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { id: orgId } = await params;

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('organization_channels')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Org Channels API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Org Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの取得に失敗しました' }, { status: 500 });
  }
}

// チャネル追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id: orgId } = await params;
    const body = await request.json();
    const { service_name, channel_id, channel_name, channel_type } = body;

    if (!service_name || !channel_id || !channel_name) {
      return NextResponse.json(
        { success: false, error: 'service_name, channel_id, channel_name は必須です' },
        { status: 400 }
      );
    }

    if (!['slack', 'chatwork', 'email'].includes(service_name)) {
      return NextResponse.json({ success: false, error: '不正なサービス名です' }, { status: 400 });
    }

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('organization_channels')
      .insert({
        organization_id: orgId,
        service_name,
        channel_id,
        channel_name,
        channel_type: channel_type || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'このチャネルは既に紐付けられています' },
          { status: 409 }
        );
      }
      console.error('[Org Channels API] 追加エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Org Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの追加に失敗しました' }, { status: 500 });
  }
}

// チャネル削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id: orgId } = await params;
    const { searchParams } = new URL(request.url);
    const channelDbId = searchParams.get('channelId');

    if (!channelDbId) {
      return NextResponse.json({ success: false, error: 'channelId は必須です' }, { status: 400 });
    }

    const { error } = await supabase
      .from('organization_channels')
      .delete()
      .eq('id', channelDbId)
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) {
      console.error('[Org Channels API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Org Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの削除に失敗しました' }, { status: 500 });
  }
}
