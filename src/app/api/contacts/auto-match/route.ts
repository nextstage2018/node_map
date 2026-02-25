// Phase 30c: コンタクト自動マッチング API
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: メールアドレスで既存コンタクト・組織を自動マッチング
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ success: true, matched: false });
    }

    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: '有効なメールアドレスが必要です' },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();
    const domain = emailLower.split('@')[1];

    // 1. メールアドレス完全一致で contact_persons を検索
    const { data: channelMatch } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('address', emailLower)
      .limit(1)
      .single();

    if (channelMatch) {
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('*')
        .eq('id', channelMatch.contact_id)
        .single();

      if (contact) {
        return NextResponse.json({
          success: true,
          matched: true,
          matchType: 'email_exact',
          contact,
        });
      }
    }

    // 2. ドメインで organizations を検索
    if (domain) {
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('domain', domain)
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (org) {
        return NextResponse.json({
          success: true,
          matched: true,
          matchType: 'domain',
          organization: org,
        });
      }
    }

    // 3. マッチなし
    return NextResponse.json({
      success: true,
      matched: false,
    });
  } catch (error) {
    console.error('[AutoMatch API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '自動マッチングに失敗しました' },
      { status: 500 }
    );
  }
}
