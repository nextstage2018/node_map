// インボックスAPI — 未読数取得（サイドバー用軽量エンドポイント）
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ unreadCount: 0 });
    }

    // 未読メッセージ数をカウント（受信メッセージのみ・Slack/Chatworkのみ）
    // Gmail排除: EMAIL_ENABLEDに関わらず、バッジはSlack/Chatworkのみカウント
    // ユーザー分離: user_idでログインユーザーのメッセージのみ
    const { count, error } = await supabase
      .from('inbox_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('direction', 'received')
      .eq('user_id', userId)
      .in('channel', ['slack', 'chatwork']);

    if (error) {
      console.error('[/api/inbox] 未読数取得エラー:', error);
      return NextResponse.json({ unreadCount: 0 });
    }

    return NextResponse.json({ unreadCount: count ?? 0 });
  } catch (error) {
    console.error('[/api/inbox] エラー:', error);
    return NextResponse.json({ unreadCount: 0 });
  }
}
