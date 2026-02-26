// Phase 30a + 37b: 組織マスター API（PUT / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// Phase 37b: 組織→コンタクト関係性マッピング
const ORG_TO_CONTACT_RELATIONSHIP: Record<string, string> = {
  internal: 'internal',
  client: 'client',
  partner: 'partner',
  vendor: 'partner',
  prospect: 'client',
};

// 組織更新
export async function PUT(
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

    const { id } = await params;
    const body = await request.json();
    const { name, domain, relationship_type, address, phone, memo } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '組織名は必須です' },
        { status: 400 }
      );
    }

    // 組織を更新
    const { data, error } = await supabase
      .from('organizations')
      .update({
        name: name.trim(),
        domain: domain?.trim() || null,
        relationship_type: relationship_type || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        memo: memo?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[Organizations API] 更新エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Phase 37b: 関係性が設定されている場合、所属コンタクトの relationship_type も連動更新
    if (relationship_type && ORG_TO_CONTACT_RELATIONSHIP[relationship_type]) {
      const contactRelType = ORG_TO_CONTACT_RELATIONSHIP[relationship_type];
      await supabase
        .from('contact_persons')
        .update({
          relationship_type: contactRelType,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', id);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Organizations API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '組織の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// 組織削除
export async function DELETE(
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

    const { id } = await params;

    // 組織に紐づくコンタクトのorganization_idをnullに戻す
    await supabase
      .from('contact_persons')
      .update({ organization_id: null })
      .eq('organization_id', id);

    // 組織チャネルも削除（CASCADE設定済みだが念のため）
    await supabase
      .from('organization_channels')
      .delete()
      .eq('organization_id', id);

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[Organizations API] 削除エラー:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Organizations API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '組織の削除に失敗しました' },
      { status: 500 }
    );
  }
}
