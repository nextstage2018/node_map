// v3.3: プロジェクトメンバー管理 API（GET / POST / DELETE）
// project_members テーブルを使用（組織メンバーからの移行）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// プロジェクトメンバー一覧取得
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

    const { id: projectId } = await params;

    // プロジェクトの所有確認
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // project_members + contact_persons を結合取得
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        id,
        role,
        created_at,
        contact_id,
        contact_persons!inner (
          id,
          name,
          relationship_type,
          main_channel,
          message_count,
          last_contact_at,
          is_team_member,
          company_name,
          linked_user_id
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Project Members API] 取得エラー:', error);
      // フォールバック: 組織メンバーを返す
      if (project.organization_id) {
        const { data: orgMembers } = await supabase
          .from('contact_persons')
          .select('id, name, relationship_type, main_channel, message_count, last_contact_at, is_team_member, company_name, linked_user_id')
          .eq('organization_id', project.organization_id)
          .order('name', { ascending: true });
        return NextResponse.json({
          success: true,
          data: (orgMembers || []).map(m => ({
            id: null, // project_memberレコードなし
            contact_id: m.id,
            role: 'member',
            contact: m,
            is_fallback: true,
          })),
          fallback: true,
        });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // レスポンス整形
    const members = (data || []).map(pm => ({
      id: pm.id,
      contact_id: pm.contact_id,
      role: pm.role,
      created_at: pm.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contact: (pm as any).contact_persons,
    }));

    // project_members が空なら組織メンバーにフォールバック
    if (members.length === 0 && project.organization_id) {
      const { data: orgMembers } = await supabase
        .from('contact_persons')
        .select('id, name, relationship_type, main_channel, message_count, last_contact_at, is_team_member, company_name, linked_user_id')
        .eq('organization_id', project.organization_id)
        .order('name', { ascending: true });
      return NextResponse.json({
        success: true,
        data: (orgMembers || []).map(m => ({
          id: null,
          contact_id: m.id,
          role: 'member',
          contact: m,
          is_fallback: true,
        })),
        fallback: true,
      });
    }

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    console.error('[Project Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの取得に失敗しました' }, { status: 500 });
  }
}

// プロジェクトにメンバーを追加
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

    const { id: projectId } = await params;
    const body = await request.json();
    const { contact_id, role } = body;

    if (!contact_id) {
      return NextResponse.json({ success: false, error: 'contact_id は必須です' }, { status: 400 });
    }

    // プロジェクトの所有確認
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // auto_ プレフィックスのコンタクトはcontact_personsに未登録 → 先に登録する
    let resolvedContactId = contact_id;
    if (contact_id.startsWith('auto_')) {
      // リクエストからname情報を取得（フロント側から渡される）
      const { name: contactName, companyName } = body;
      const newContactId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { error: createErr } = await supabase
        .from('contact_persons')
        .insert({
          id: newContactId,
          owner_user_id: userId,
          name: contactName || 'Unknown',
          company_name: companyName || null,
          organization_id: project.organization_id || null,
          relationship_type: 'internal',
        });
      if (createErr) {
        console.error('[Project Members API] コンタクト自動作成エラー:', createErr);
        return NextResponse.json(
          { success: false, error: 'コンタクトの登録に失敗しました。先にコンタクトを登録してください。' },
          { status: 400 }
        );
      }
      resolvedContactId = newContactId;
    } else {
      // 既存コンタクトの存在確認
      const { data: existingContact } = await supabase
        .from('contact_persons')
        .select('id')
        .eq('id', contact_id)
        .single();
      if (!existingContact) {
        return NextResponse.json(
          { success: false, error: 'コンタクトが見つかりません。先にコンタクトを登録してください。' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        contact_id: resolvedContactId,
        role: role || 'member',
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'このメンバーは既にプロジェクトに追加されています' },
          { status: 409 }
        );
      }
      console.error('[Project Members API] 追加エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Project Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの追加に失敗しました' }, { status: 500 });
  }
}

// プロジェクトからメンバーを削除
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

    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const contactId = searchParams.get('contactId');

    if (!memberId && !contactId) {
      return NextResponse.json({ success: false, error: 'memberId または contactId は必須です' }, { status: 400 });
    }

    let query = supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (memberId) {
      query = query.eq('id', memberId);
    } else if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { error } = await query;

    if (error) {
      console.error('[Project Members API] 削除エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Project Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバーの削除に失敗しました' }, { status: 500 });
  }
}
