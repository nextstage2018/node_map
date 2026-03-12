// Phase B: 過去のやり取り変遷API — from_addressでグルーピングして時系列表示
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fromAddress = searchParams.get('fromAddress');
    const excludeId = searchParams.get('excludeId'); // 現在表示中のメッセージIDを除外
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    if (!fromAddress) {
      return NextResponse.json({ success: false, error: 'fromAddress パラメータが必要です' }, { status: 400 });
    }

    const supabase = getServerSupabase() || getSupabase();

    // from_address に一致する送受信メッセージを時系列で取得
    // 受信: from_address = 指定アドレス
    // 送信: to_address (to_listの中) に指定アドレスが含まれる
    let query = supabase
      .from('inbox_messages')
      .select('id, channel, from_name, from_address, subject, body, direction, is_read, timestamp, created_at, metadata')
      .eq('user_id', userId)
      .in('channel', ['slack', 'chatwork'])
      .or(`from_address.eq.${fromAddress},to_address.eq.${fromAddress}`)
      .order('timestamp', { ascending: false })
      .limit(limit);

    // 現在のメッセージを除外
    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Messages History API] DB取得エラー:', error);
      return NextResponse.json({ success: false, error: 'データの取得に失敗しました' }, { status: 500 });
    }

    const history = (data || []).map((msg) => ({
      id: msg.id,
      channel: msg.channel,
      fromName: msg.from_name || msg.from_address || '不明',
      fromAddress: msg.from_address || '',
      subject: msg.subject || '',
      body: (msg.body || '').slice(0, 200), // プレビュー用に200文字まで
      direction: msg.direction || 'received',
      isRead: msg.is_read,
      timestamp: msg.timestamp || msg.created_at,
      metadata: msg.metadata || {},
    }));

    return NextResponse.json({
      success: true,
      data: {
        fromAddress,
        totalCount: history.length,
        messages: history,
      },
    });
  } catch (error) {
    console.error('[Messages History API] エラー:', error);
    return NextResponse.json({ success: false, error: '処理に失敗しました' }, { status: 500 });
  }
}
