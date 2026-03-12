// ログインユーザー自身のcontact_persons取得API
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Contacts Me] エラー:', error);
    return NextResponse.json({ success: false, error: '取得に失敗しました' }, { status: 500 });
  }
}
