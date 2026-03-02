// Phase 35+: コンタクト重複検出 API（auto生成コンタクト同士のアドレス重複にも対応）
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured, getServerSupabase } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface ContactRow {
  id: string;
  name: string;
  relationship_type: string | null;
  main_channel: string | null;
  message_count: number | null;
  last_contact_at: string | null;
  company_name: string | null;
  is_auto_generated: boolean | null;
}

interface ChannelRow {
  contact_id: string;
  channel: string;
  address: string;
}

interface DuplicateGroup {
  name: string;
  reason: string; // 'name' | 'address'
  contacts: ContactRow[];
}

// GET: 同名 + 同アドレスの重複候補を検出
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = getServerSupabase() || createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: { groups: [] } });
    }

    // 全コンタクトを取得
    const { data: contacts, error } = await supabase
      .from('contact_persons')
      .select('id, name, relationship_type, main_channel, message_count, last_contact_at, company_name, is_auto_generated')
      .order('name', { ascending: true });

    if (error) {
      console.error('[Contacts Duplicates API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, data: { groups: [] } });
    }

    const groups: DuplicateGroup[] = [];
    const usedIds = new Set<string>();

    // ---- (1) 同名グループ（既存ロジック） ----
    const nameMap = new Map<string, ContactRow[]>();
    for (const contact of contacts) {
      const normalizedName = contact.name?.trim().toLowerCase();
      if (!normalizedName) continue;
      const existing = nameMap.get(normalizedName) || [];
      existing.push(contact);
      nameMap.set(normalizedName, existing);
    }

    for (const [, items] of nameMap.entries()) {
      if (items.length >= 2) {
        groups.push({
          name: items[0].name,
          reason: 'name',
          contacts: items,
        });
        items.forEach(c => usedIds.add(c.id));
      }
    }

    // ---- (2) 同アドレスグループ（auto生成コンタクト対応） ----
    // contact_channels からアドレス情報を取得
    const contactIds = contacts.map(c => c.id);
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('contact_id, channel, address')
      .in('contact_id', contactIds);

    if (channels && channels.length > 0) {
      // アドレスでグループ化
      const addressMap = new Map<string, ChannelRow[]>();
      for (const ch of channels) {
        if (!ch.address) continue;
        const key = `${ch.channel}::${ch.address.toLowerCase()}`;
        const existing = addressMap.get(key) || [];
        existing.push(ch);
        addressMap.set(key, existing);
      }

      // 同じアドレスを持つ異なるコンタクトをグループ化
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      for (const [, channelEntries] of addressMap.entries()) {
        const uniqueContactIds = [...new Set(channelEntries.map(ch => ch.contact_id))];
        if (uniqueContactIds.length < 2) continue;

        // 既に同名グループで検出済みのペアは除外
        const newIds = uniqueContactIds.filter(id => !usedIds.has(id));
        if (newIds.length < 2) continue;

        // 対象のコンタクト情報を取得
        const groupContacts = uniqueContactIds
          .map(id => contactMap.get(id))
          .filter((c): c is ContactRow => c !== undefined);

        if (groupContacts.length >= 2) {
          const addr = channelEntries[0].address;
          const ch = channelEntries[0].channel;
          groups.push({
            name: `${addr}（${ch}）`,
            reason: 'address',
            contacts: groupContacts,
          });
          groupContacts.forEach(c => usedIds.add(c.id));
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { groups },
    });
  } catch (error) {
    console.error('[Contacts Duplicates API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '重複検出に失敗しました' },
      { status: 500 }
    );
  }
}
