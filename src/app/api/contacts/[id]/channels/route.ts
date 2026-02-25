// Phase 35: コンタクトチャンネル追加 API
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: 指定コンタクトにチャンネルを追加
export async function POST(
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
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const { id: contactId } = await params;
    const body = await request.json();
    const { channel, address } = body;

    if (!channel || !address?.trim()) {
      return NextResponse.json(
        { success: false, error: 'チャンネル種別とアドレスは必須です' },
        { status: 400 }
      );
    }

    const validChannels = ['email', 'slack', 'chatwork'];
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        { success: false, error: 'チャンネル種別が不正です（email/slack/chatwork）' },
        { status: 400 }
      );
    }

    // Phase 35: コンタクトの存在確認
    const { data: contact, error: contactError } = await supabase
      .from('contact_persons')
      .select('id')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { success: false, error: 'コンタクトが見つかりません' },
        { status: 404 }
      );
    }

    // Phase 35: contact_channels に追加（UNIQUE制約で重複は自動ブロック）
    const { data, error } = await supabase
      .from('contact_channels')
      .insert({
        contact_id: contactId,
        channel,
        address: address.trim(),
      })
      .select()
      .single();

    if (error) {
      // UNIQUE制約違反
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'このチャンネル・アドレスは既に登録されています' },
          { status: 409 }
        );
      }
      console.error('[Contacts Channels API] 追加エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Contacts Channels API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'チャンネルの追加に失敗しました' },
      { status: 500 }
    );
  }
}
