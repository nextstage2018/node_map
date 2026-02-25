// Phase 37: 組織メンバー管理 API（GET / POST / DELETE）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// メンバー一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { id: orgId } = await params;

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('contact_persons')
      .select('id, name, relationship_type, main_channel, message_count, last_contact_at, is_team_member, auto_added_to_org, confirmed')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[Org Members API] 取得エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Org Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの取得に失敗しました' }, { status: 500 });
  }
}

// メンバー追加（contact_persons.organization_id を設定）
export async function POST(
  request: NextRequest,
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

    const { id: orgId } = await params;
    const body = await request.json();
    const { contact_ids } = body;

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'contact_ids は必須です' }, { status: 400 });
    }

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    // 複数コンタクトを一括でorganization_idに紐づけ
    const { data, error } = await supabase
      .from('contact_persons')
      .update({
        organization_id: orgId,
        updated_at: new Date().toISOString(),
      })
      .in('id', contact_ids)
      .select('id, name');

    if (error) {
      console.error('[Org Members API] 追加エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, count: data?.length || 0 });
  } catch (error) {
    console.error('[Org Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの追加に失敗しました' }, { status: 500 });
  }
}

// メンバー削除（organization_id を null に戻す）
export async function DELETE(
  request: NextRequest,
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

    const { id: orgId } = await params;
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ success: false, error: 'contactId は必須です' }, { status: 400 });
    }

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    const { error } = await supabase
      .from('contact_persons')
      .update({
        organization_id: null,
        auto_added_to_org: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('organization_id', orgId);

    if (error) {
      console.error('[Org Members API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Org Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの削除に失敗しました' }, { status: 500 });
  }
}
