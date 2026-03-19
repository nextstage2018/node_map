// ログインユーザー自身のcontact_persons取得API
// v10.4: all_internal=true で社内メンバー全員も返す
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // linked_user_idでログインユーザーのcontact_personsを取得
    const { data, error } = await supabase
      .from('contact_persons')
      .select('id, name, company_name, relationship_type')
      .eq('linked_user_id', userId)
      .limit(1)
      .single();

    if (error || !data) {
      // owner_user_idでフォールバック
      const { data: fallback } = await supabase
        .from('contact_persons')
        .select('id, name, company_name, relationship_type')
        .eq('owner_user_id', userId)
        .eq('is_team_member', true)
        .limit(1)
        .single();

      if (fallback) {
        return NextResponse.json({ success: true, data: fallback });
      }
      return NextResponse.json({ success: false, error: 'コンタクトが見つかりません' }, { status: 404 });
    }

    // v10.4: all_internal=true の場合、linked_user_idを持つ社内メンバー全員を追加で返す
    const allInternal = request.nextUrl.searchParams.get('all_internal');
    if (allInternal === 'true') {
      const { data: internalMembers } = await supabase
        .from('contact_persons')
        .select('id, name')
        .not('linked_user_id', 'is', null)
        .eq('relationship_type', 'internal')
        .order('name');

      return NextResponse.json({
        success: true,
        data,
        internalMembers: internalMembers || [],
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Contacts Me] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
