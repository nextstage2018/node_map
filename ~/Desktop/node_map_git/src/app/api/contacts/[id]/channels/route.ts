// Phase 35: コンタクトチャネル追加API
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
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

    const { id: contactId } = await params;
    const body = await request.json();
    const { channel, address } = body;

    if (!channel || !address) {
      return NextResponse.json({ success: false, error: 'channel と address は必須です' }, { status: 400 });
    }

    // コンタクト存在確認
    const { data: contact } = await supabase
      .from('contact_persons')
      .select('id')
      .eq('id', contactId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json({ success: false, error: 'コンタクトが見つかりません' }, { status: 404 });
    }

    // チャンネル追加（UNIQUE制約で重複防止）
    const { error: insertError } = await supabase
      .from('contact_channels')
      .insert({ contact_id: contactId, channel, address: address.trim() });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: false, error: 'このチャネルは既に登録されています' }, { status: 409 });
      }
      console.error('[Channels API] Insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Channels API] Error:', error);
    return NextResponse.json({ success: false, error: 'チャネルの追加に失敗しました' }, { status: 500 });
  }
}
