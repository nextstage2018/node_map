// Phase 58b: NodeMapユーザー一覧API
// Supabase auth のユーザー一覧を返す（自社組織メンバーとの紐づけ用）
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: true, data: [] });
    }

    // service_role キーで管理者クライアントを作成
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // auth ユーザー一覧を取得
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({
      perPage: 100,
    });

    if (error) {
      console.error('[Users API] listUsers エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 必要な情報のみ返す（セキュリティのため最小限）
    const mapped = (users || []).map(u => ({
      id: u.id,
      email: u.email || '',
      displayName: u.user_metadata?.display_name || u.user_metadata?.full_name || u.email || '',
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error('[Users API] エラー:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}
