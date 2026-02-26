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

    // 組織の所有確認（relationship_type も取得）
    const { data: org } = await supabase
      .from('organizations')
      .select('id, relationship_type')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    // Phase 37b: 既に別の組織に所属しているコンタクトをチェック
    const { data: existingContacts } = await supabase
      .from('contact_persons')
      .select('id, name, organization_id')
      .in('id', contact_ids);

    const alreadyInOtherOrg = (existingContacts || []).filter(
      c => c.organization_id && c.organization_id !== orgId
    );

    if (alreadyInOtherOrg.length > 0) {
      // 別組織に所属しているコンタクトの組織名を取得
      const otherOrgIds = [...new Set(alreadyInOtherOrg.map(c => c.organization_id))];
      const { data: otherOrgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', otherOrgIds);
      const orgNameMap = new Map((otherOrgs || []).map(o => [o.id, o.name]));

      const conflicts = alreadyInOtherOrg.map(c =>
        `${c.name}（${orgNameMap.get(c.organization_id!) || '不明な組織'}に所属中）`
      );
      return NextResponse.json({
        success: false,
        error: `以下のコンタクトは既に別の組織に所属しています。先に元の組織から外してください：\n${conflicts.join('、')}`,
      }, { status: 409 });
    }

    // Phase 37b: 組織の関係性をコンタクトにも設定
    const orgToContactRel: Record<string, string> = {
      internal: 'internal', client: 'client', partner: 'partner',
      vendor: 'partner', prospect: 'client',
    };
    const contactRelType = org.relationship_type ? orgToContactRel[org.relationship_type] : undefined;

    // 複数コンタクトを一括でorganization_idに紐づけ
    const updatePayload: Record<string, unknown> = {
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    if (contactRelType) {
      updatePayload.relationship_type = contactRelType;
    }

    const { data, error } = await supabase
      .from('contact_persons')
      .update(updatePayload)
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
