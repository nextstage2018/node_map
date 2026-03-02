// 宛先サジェストAPI: コンタクト + 過去のメッセージアドレスから候補を返す
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface SuggestItem {
  address: string;
  name: string;
  channel: string;
  source: 'contact' | 'message_history';
  companyName?: string;
}

// GET /api/contacts/suggest?q=検索文字列&channel=email|slack|chatwork
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') || '').trim().toLowerCase();
    const channelFilter = searchParams.get('channel') || '';

    if (query.length < 1) {
      return NextResponse.json({ success: true, data: [] });
    }

    const results: SuggestItem[] = [];
    const seen = new Set<string>();

    // (1) contact_channels + contact_persons から検索
    const { data: channelData } = await supabase
      .from('contact_channels')
      .select('address, channel, contact_id, contact_persons(name, company_name)')
      .or(`address.ilike.%${query}%`)
      .limit(20);

    if (channelData) {
      for (const ch of channelData) {
        if (channelFilter && ch.channel !== channelFilter) continue;
        const key = `${ch.channel}::${ch.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contact = ch.contact_persons as any;
        results.push({
          address: ch.address,
          name: contact?.name || '',
          channel: ch.channel,
          source: 'contact',
          companyName: contact?.company_name || undefined,
        });
      }
    }

    // contact_persons の名前でも検索
    const { data: nameData } = await supabase
      .from('contact_persons')
      .select('id, name, company_name')
      .ilike('name', `%${query}%`)
      .limit(10);

    if (nameData) {
      for (const person of nameData) {
        // この人のチャネルを取得
        const { data: personChannels } = await supabase
          .from('contact_channels')
          .select('address, channel')
          .eq('contact_id', person.id);

        if (personChannels) {
          for (const ch of personChannels) {
            if (channelFilter && ch.channel !== channelFilter) continue;
            const key = `${ch.channel}::${ch.address}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              address: ch.address,
              name: person.name,
              channel: ch.channel,
              source: 'contact',
              companyName: person.company_name || undefined,
            });
          }
        }
      }
    }

    // (2) inbox_messages の from_address / from_name から過去の送信者を検索
    const { data: msgData } = await supabase
      .from('inbox_messages')
      .select('from_address, from_name, channel')
      .or(`from_address.ilike.%${query}%,from_name.ilike.%${query}%`)
      .eq('direction', 'received')
      .order('created_at', { ascending: false })
      .limit(30);

    if (msgData) {
      for (const msg of msgData) {
        if (!msg.from_address) continue;
        if (channelFilter && msg.channel !== channelFilter) continue;
        const key = `${msg.channel}::${msg.from_address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          address: msg.from_address,
          name: msg.from_name || '',
          channel: msg.channel,
          source: 'message_history',
        });
      }
    }

    // コンタクトを先に、メッセージ履歴を後に表示
    results.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'contact' ? -1 : 1;
      return (a.name || a.address).localeCompare(b.name || b.address);
    });

    return NextResponse.json({ success: true, data: results.slice(0, 15) });
  } catch (error) {
    console.error('[Contacts Suggest API] エラー:', error);
    return NextResponse.json({ success: false, error: 'サジェスト取得に失敗しました' }, { status: 500 });
  }
}
