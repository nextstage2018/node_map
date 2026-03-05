// Phase D: 組織のチャネルのうち、プロジェクトに未紐づけのものを返すAPI
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

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

    // 組織のチャネル一覧を取得
    const { data: orgChannels, error: chError } = await supabase
      .from('organization_channels')
      .select('id, service_name, channel_id, channel_name')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (chError || !orgChannels || orgChannels.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // プロジェクトに紐づいているチャネルを取得
    const { data: projChannels } = await supabase
      .from('project_channels')
      .select('service_name, channel_identifier')
      .in('organization_channel_id', orgChannels.map(c => c.id));

    const linkedSet = new Set(
      (projChannels || []).map(pc => `${pc.service_name}:${pc.channel_identifier}`)
    );

    // 未紐づけチャネルをフィルタ（メールは対象外: 1:1なので）
    const unlinked = orgChannels
      .filter(c => c.service_name !== 'email')
      .filter(c => !linkedSet.has(`${c.service_name}:${c.channel_id}`));

    if (unlinked.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 各チャネルのメッセージ数・最終メッセージを取得
    const result = [];
    for (const ch of unlinked) {
      // メッセージ数を取得
      const metadataKey = ch.service_name === 'slack' ? 'slackChannel' : 'chatworkRoomId';
      const { count } = await supabase
        .from('inbox_messages')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>' + metadataKey, ch.channel_id);

      const { data: lastMsg } = await supabase
        .from('inbox_messages')
        .select('created_at')
        .eq('metadata->>' + metadataKey, ch.channel_id)
        .order('created_at', { ascending: false })
        .limit(1);

      result.push({
        service_name: ch.service_name,
        channel_identifier: ch.channel_id,
        channel_name: ch.channel_name || ch.channel_id,
        message_count: count || 0,
        last_message_at: lastMsg?.[0]?.created_at || null,
      });
    }

    // メッセージ数が多い順にソート
    result.sort((a, b) => b.message_count - a.message_count);

    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    console.error('[API] unlinked-channels エラー:', error);
    return NextResponse.json(
      { success: false, error: '未紐づけチャネルの取得に失敗しました' },
      { status: 500 }
    );
  }
}
