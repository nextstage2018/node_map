// Phase 54: 組織自動リンクユーティリティ
// コンタクトのcompany_nameやメールドメインから組織を自動検索・作成・紐づけ

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * company_name やメールドメインから組織を検索し、なければ自動作成して organization_id を返す
 *
 * 処理順序:
 * 1. companyName が空なら null
 * 2. organizations テーブルで名前完全一致検索
 * 3. emailDomain があれば domain 一致検索
 * 4. どちらもなければ新規 organization を作成
 * 5. organization_id を返す
 */
export async function findOrCreateOrganization(
  supabase: SupabaseClient,
  userId: string,
  companyName: string | null | undefined,
  emailDomain?: string | null
): Promise<string | null> {
  // companyName が空なら何もしない
  if (!companyName || !companyName.trim()) {
    // ドメインのみの場合もスキップ（会社名がないと組織名が決まらない）
    return null;
  }

  const trimmedName = companyName.trim();

  try {
    // 1. 名前完全一致で既存組織を検索
    const { data: nameMatch } = await supabase
      .from('organizations')
      .select('id')
      .eq('user_id', userId)
      .eq('name', trimmedName)
      .limit(1)
      .single();

    if (nameMatch) {
      return nameMatch.id;
    }

    // 2. ドメイン一致で既存組織を検索
    if (emailDomain) {
      const cleanDomain = emailDomain.toLowerCase().trim();
      const { data: domainMatch } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .eq('domain', cleanDomain)
        .limit(1)
        .single();

      if (domainMatch) {
        return domainMatch.id;
      }
    }

    // 3. フリーメールドメインチェック（組織として作成すべきでないドメイン）
    const freeDomains = new Set([
      'gmail.com', 'yahoo.co.jp', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'outlook.jp', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
      'docomo.ne.jp', 'ezweb.ne.jp', 'au.com', 'softbank.ne.jp',
      'i.softbank.jp', 'nifty.com', 'biglobe.ne.jp', 'ocn.ne.jp',
    ]);

    const domainForOrg = emailDomain && !freeDomains.has(emailDomain.toLowerCase())
      ? emailDomain.toLowerCase()
      : null;

    // 4. 新規組織を作成
    const { data: newOrg, error: createError } = await supabase
      .from('organizations')
      .insert({
        name: trimmedName,
        domain: domainForOrg,
        user_id: userId,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[OrgLinking] 組織作成エラー:', createError);
      return null;
    }

    console.log(`[OrgLinking] 組織自動作成: "${trimmedName}" (id: ${newOrg.id})`);
    return newOrg.id;
  } catch (error) {
    console.error('[OrgLinking] findOrCreateOrganization エラー:', error);
    return null;
  }
}
