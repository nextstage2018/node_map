// Phase 35: コンタクト重複検出API
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface DuplicateContact {
  id: string;
  name: string;
  relationship_type: string;
  main_channel: string;
  message_count: number;
  last_contact_at: string;
  company_name: string | null;
}

interface DuplicateGroup {
  name: string;
  contacts: DuplicateContact[];
}

function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[\s　]+/g, ' ');
}

export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: { groups: [] } });
    }

    const { data: contacts, error } = await supabase
      .from('contact_persons')
      .select('id, name, relationship_type, main_channel, message_count, last_contact_at, company_name, contact_channels(address, channel)')
      .order('name');

    if (error) {
      console.error('[Duplicates API] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, data: { groups: [] } });
    }

    // 名前ベースの重複グループ
    const groupsByName = new Map<string, typeof contacts>();
    for (const c of contacts) {
      const norm = normalizeName(c.name);
      if (!norm) continue;
      if (!groupsByName.has(norm)) groupsByName.set(norm, []);
      groupsByName.get(norm)!.push(c);
    }

    // アドレスベースの重複グループ
    const groupsByAddress = new Map<string, typeof contacts>();
    for (const c of contacts) {
      const channels = (c.contact_channels || []) as Array<{ address?: string; channel?: string }>;
      for (const ch of channels) {
        if (!ch.address) continue;
        const addr = ch.address.toLowerCase().trim();
        if (!groupsByAddress.has(addr)) groupsByAddress.set(addr, []);
        const group = groupsByAddress.get(addr)!;
        if (!group.some(g => g.id === c.id)) group.push(c);
      }
    }

    // 重複グループを統合
    const seen = new Set<string>();
    const groups: DuplicateGroup[] = [];

    for (const [name, group] of groupsByName) {
      if (group.length < 2) continue;
      group.forEach(c => seen.add(c.id));
      groups.push({
        name: group[0].name || name,
        contacts: group.map(c => ({
          id: c.id,
          name: c.name || '',
          relationship_type: c.relationship_type || 'unknown',
          main_channel: c.main_channel || 'email',
          message_count: c.message_count || 0,
          last_contact_at: c.last_contact_at || '',
          company_name: c.company_name || null,
        })),
      });
    }

    for (const [, group] of groupsByAddress) {
      if (group.length < 2) continue;
      if (group.every(c => seen.has(c.id))) continue;
      group.forEach(c => seen.add(c.id));
      groups.push({
        name: group[0].name || '（同一アドレス）',
        contacts: group.map(c => ({
          id: c.id,
          name: c.name || '',
          relationship_type: c.relationship_type || 'unknown',
          main_channel: c.main_channel || 'email',
          message_count: c.message_count || 0,
          last_contact_at: c.last_contact_at || '',
          company_name: c.company_name || null,
        })),
      });
    }

    return NextResponse.json({ success: true, data: { groups } });
  } catch (error) {
    console.error('[Duplicates API] Error:', error);
    return NextResponse.json({ success: false, error: '重複検出に失敗しました' }, { status: 500 });
  }
}
