// v10.6: 全プロジェクト一覧取得（組織名付き）— 議事録移動ドロップダウン等で使用
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
      return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, organization_id, organizations(name)')
      .order('name', { ascending: true });

    if (error) {
      console.error('[Projects list-all] エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 組織名をフラット化
    const result = (data || []).map((p: Record<string, unknown>) => {
      const org = p.organizations as { name: string } | null;
      return {
        id: p.id,
        name: p.name,
        org_name: org?.name || '',
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Projects list-all] エラー:', error);
    return NextResponse.json({ success: false, error: 'プロジェクト一覧の取得に失敗しました' }, { status: 500 });
  }
}
