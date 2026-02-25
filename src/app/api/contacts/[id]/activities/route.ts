// Phase 34: コンタクト活動履歴 API
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// GET: 指定コンタクトに関連するbusiness_events・unified_messagesを時系列で返す
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { id: contactId } = await params;

    // Phase 34: ビジネスイベント（contact_idが一致するもの）
    const { data: events, error: eventsError } = await supabase
      .from('business_events')
      .select('id, title, content, event_type, created_at')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (eventsError) {
      console.error('[Contact Activities API] イベント取得エラー:', eventsError);
    }

    // Phase 34: コンタクトのメールアドレスを取得してメッセージ検索
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('address')
      .eq('contact_id', contactId);

    const addresses = (channels || []).map((c: { address: string }) => c.address);

    let messages: { id: string; subject: string; body: string; channel: string; from_address: string; timestamp: string }[] = [];
    if (addresses.length > 0) {
      const { data: msgs, error: msgsError } = await supabase
        .from('unified_messages')
        .select('id, subject, body, channel, from_address, timestamp')
        .eq('user_id', userId)
        .in('from_address', addresses)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (msgsError) {
        console.error('[Contact Activities API] メッセージ取得エラー:', msgsError);
      }
      messages = msgs || [];
    }

    // Phase 34: 統合して時系列ソート
    const activities = [
      ...(events || []).map((e: { id: string; title: string; content: string | null; event_type: string; created_at: string }) => ({
        id: e.id,
        type: 'event' as const,
        title: e.title,
        content: e.content,
        eventType: e.event_type,
        timestamp: e.created_at,
      })),
      ...messages.map((m) => ({
        id: m.id,
        type: 'message' as const,
        title: m.subject || '（件名なし）',
        content: m.body?.slice(0, 200) || null,
        eventType: m.channel,
        timestamp: m.timestamp,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ success: true, data: activities });
  } catch (error) {
    console.error('[Contact Activities API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '活動履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}
