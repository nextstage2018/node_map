// Phase 35: コンタクト重複検出 API
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// GET: 同じnameを持つコンタクトをグループ化して重複候補として返す
export async function GET() {
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
      return NextResponse.json({ success: true, data: { groups: [] } });
    }

    // Phase 35: 全コンタクトを取得
    const { data: contacts, error } = await supabase
      .from('contact_persons')
      .select('id, name, relationship_type, main_channel, message_count, last_contact_at, company_name')
      .order('name', { ascending: true });

    if (error) {
      console.error('[Contacts Duplicates API] 取得エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Phase 35: nameでグループ化し、2件以上あるグループを重複候補とする
    const nameMap = new Map<string, typeof contacts>();
    for (const contact of contacts || []) {
      const normalizedName = contact.name?.trim().toLowerCase();
      if (!normalizedName) continue;
      const existing = nameMap.get(normalizedName) || [];
      existing.push(contact);
      nameMap.set(normalizedName, existing);
    }

    const groups = Array.from(nameMap.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([, items]) => ({
        name: items[0].name,
        contacts: items,
      }));

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
