// Phase 40c: プロジェクト ↔ チャネル紐づけ API（GET / POST / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクトに紐づくチャネル一覧取得
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

    const { id: projectId } = await params;

    // プロジェクトの所有確認
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // プロジェクトに紐づくチャネル
    const { data, error } = await supabase
      .from('project_channels')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Project Channels API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Project Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの取得に失敗しました' }, { status: 500 });
  }
}

// プロジェクトにチャネルを追加
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

    const { id: projectId } = await params;
    const body = await request.json();
    const { organizationChannelId, serviceName, channelIdentifier, channelLabel } = body;

    if (!serviceName || !channelIdentifier) {
      return NextResponse.json(
        { success: false, error: 'serviceName, channelIdentifier は必須です' },
        { status: 400 }
      );
    }

    // プロジェクトの所有確認
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('project_channels')
      .insert({
        project_id: projectId,
        organization_channel_id: organizationChannelId || null,
        service_name: serviceName,
        channel_identifier: channelIdentifier,
        channel_label: channelLabel || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'このチャネルは既にプロジェクトに紐付けられています' },
          { status: 409 }
        );
      }
      console.error('[Project Channels API] 追加エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Project Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの追加に失敗しました' }, { status: 500 });
  }
}

// プロジェクトからチャネルを削除
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

    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const channelDbId = searchParams.get('channelId');

    if (!channelDbId) {
      return NextResponse.json({ success: false, error: 'channelId は必須です' }, { status: 400 });
    }

    const { error } = await supabase
      .from('project_channels')
      .delete()
      .eq('id', channelDbId)
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('[Project Channels API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Project Channels API] エラー:', error);
    return NextResponse.json({ success: false, error: 'チャネルの削除に失敗しました' }, { status: 500 });
  }
}
