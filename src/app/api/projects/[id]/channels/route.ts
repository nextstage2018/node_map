// Phase 40c: プロジェクト ↔ チャネル紐づけ API（GET / POST / DELETE）
// v10.3: チャネル追加時にBOT自動参加
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';
import { ensureSlackBotInChannel, ensureChatworkBotInRoom, checkBotStatus } from '@/services/bot/botChannelJoin.service';

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

    // プロジェクトの存在確認（user_idフィルタなし: PJは組織共有リソース）
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
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

    // v10.3: 各チャネルのBOT参加状態を確認
    const channels = data || [];
    const channelsWithBotStatus = await Promise.all(
      channels.map(async (ch) => {
        if (ch.service_name === 'slack' || ch.service_name === 'chatwork') {
          try {
            const botStatus = await checkBotStatus(ch.service_name, ch.channel_identifier);
            return { ...ch, botStatus };
          } catch {
            return { ...ch, botStatus: { inChannel: false, error: 'チェック失敗' } };
          }
        }
        return { ...ch, botStatus: null };
      })
    );

    return NextResponse.json({ success: true, data: channelsWithBotStatus });
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

    // プロジェクトの存在確認（user_idフィルタなし: PJは組織共有リソース）
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
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

    // v10.3: BOT自動参加（チャネル追加成功後に実行。失敗してもチャネル追加自体はブロックしない）
    let botJoinResult = null;
    try {
      if (serviceName === 'slack') {
        botJoinResult = await ensureSlackBotInChannel(channelIdentifier, userId);
      } else if (serviceName === 'chatwork') {
        botJoinResult = await ensureChatworkBotInRoom(channelIdentifier, userId);
      }

      if (botJoinResult) {
        if (botJoinResult.success && !botJoinResult.alreadyMember) {
          console.log(`[Project Channels API] BOT自動参加成功: ${serviceName} ${channelIdentifier}`);
        } else if (!botJoinResult.success) {
          console.warn(`[Project Channels API] BOT自動参加失敗: ${botJoinResult.error}`);
        }
      }
    } catch (botErr) {
      console.warn('[Project Channels API] BOT自動参加で例外:', botErr);
    }

    return NextResponse.json({
      success: true,
      data,
      botJoin: botJoinResult ? {
        success: botJoinResult.success,
        alreadyMember: botJoinResult.alreadyMember,
        error: botJoinResult.error || null,
      } : null,
    });
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
      .eq('project_id', projectId);

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
