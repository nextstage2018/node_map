// Phase 40c: プロジェクトに紐づくチャネルのメッセージを取得
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

    const { id: projectId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

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

    // プロジェクトに紐づくチャネル取得
    const { data: channels, error: chError } = await supabase
      .from('project_channels')
      .select('service_name, channel_identifier')
      .eq('project_id', projectId);

    if (chError) {
      console.error('[Project Messages API] チャネル取得エラー:', chError);
      return NextResponse.json({ success: false, error: chError.message }, { status: 500 });
    }

    if (!channels || channels.length === 0) {
      return NextResponse.json({ success: true, data: [], total: 0 });
    }

    // チャネルごとにメッセージを検索
    // Slack: metadata->slackChannel = channel_identifier
    // Chatwork: metadata->chatworkRoomId = channel_identifier
    // Email: from_address = channel_identifier OR to_list に含む
    const allMessages: any[] = [];

    for (const ch of channels) {
      let query = supabase
        .from('inbox_messages')
        .select('*')
        .order('timestamp', { ascending: false });

      if (ch.service_name === 'slack') {
        query = query.eq('metadata->>slackChannel', ch.channel_identifier);
      } else if (ch.service_name === 'chatwork') {
        query = query.eq('metadata->>chatworkRoomId', ch.channel_identifier);
      } else if (ch.service_name === 'email') {
        // メールの場合: from_address がチャネルのアドレス、または自分が送ったもの
        query = query.or(`from_address.eq.${ch.channel_identifier},metadata->>emailTo.cs.${ch.channel_identifier}`);
      }

      const { data: msgs, error: msgError } = await query.limit(limit);

      if (msgError) {
        console.error(`[Project Messages API] ${ch.service_name} メッセージ取得エラー:`, msgError);
        continue;
      }

      if (msgs) {
        allMessages.push(...msgs);
      }
    }

    // 時系列でソート（新しい順）
    allMessages.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // ページネーション適用
    const paginated = allMessages.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      total: allMessages.length,
    });
  } catch (error) {
    console.error('[Project Messages API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'メッセージの取得に失敗しました' },
      { status: 500 }
    );
  }
}
