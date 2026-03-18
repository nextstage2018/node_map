// v10.2: Chatworkトークンに account_id を一括補完するエンドポイント
// 全ユーザーのChatworkトークンで /v2/me を呼び、account_id を自動取得・保存
// + contact_channels にも chatwork アドレスとして自動登録
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    // 全Chatworkトークンを取得
    const { data: tokens } = await supabase
      .from('user_service_tokens')
      .select('id, user_id, token_data')
      .eq('service_name', 'chatwork')
      .eq('is_active', true);

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ success: true, data: { updated: 0 }, message: 'Chatworkトークンがありません' });
    }

    const results: { user_id: string; account_id: string | null; account_name: string | null; error?: string }[] = [];

    for (const token of tokens) {
      const apiToken = token.token_data?.api_token;
      if (!apiToken) {
        results.push({ user_id: token.user_id, account_id: null, account_name: null, error: 'api_tokenなし' });
        continue;
      }

      try {
        const meRes = await fetch('https://api.chatwork.com/v2/me', {
          headers: { 'X-ChatWorkToken': apiToken },
        });

        if (!meRes.ok) {
          results.push({ user_id: token.user_id, account_id: null, account_name: null, error: `HTTP ${meRes.status}` });
          continue;
        }

        const me = await meRes.json();
        const accountId = String(me.account_id);
        const accountName = me.name || token.token_data.account_name;

        // token_data を更新（account_id 追加）
        const updatedTokenData = {
          ...token.token_data,
          account_id: accountId,
          account_name: accountName,
          chatwork_id: me.chatwork_id || null,
        };

        await supabase
          .from('user_service_tokens')
          .update({ token_data: updatedTokenData, updated_at: new Date().toISOString() })
          .eq('id', token.id);

        // ★ contact_channels にも chatwork アドレスとして登録
        // linked_user_id でこのユーザーの contact_persons を取得
        const { data: contact } = await supabase
          .from('contact_persons')
          .select('id')
          .eq('linked_user_id', token.user_id)
          .limit(1)
          .maybeSingle();

        if (contact) {
          // 既存チェック
          const { data: existingCh } = await supabase
            .from('contact_channels')
            .select('id')
            .eq('contact_id', contact.id)
            .eq('channel', 'chatwork')
            .eq('address', accountId)
            .limit(1);

          if (!existingCh || existingCh.length === 0) {
            await supabase.from('contact_channels').insert({
              contact_id: contact.id,
              channel: 'chatwork',
              address: accountId,
              user_id: token.user_id,
            }).then(({ error: chErr }) => {
              if (chErr && chErr.code !== '23505') {
                console.warn(`[Enrich Chatwork] contact_channels登録失敗:`, chErr.message);
              }
            });
          }
        }

        results.push({ user_id: token.user_id, account_id: accountId, account_name: accountName });
      } catch (err) {
        results.push({ user_id: token.user_id, account_id: null, account_name: null, error: String(err) });
      }
    }

    const updated = results.filter(r => r.account_id).length;
    console.log(`[Enrich Chatwork] ${updated}/${tokens.length}人のaccount_idを取得・保存`);

    return NextResponse.json({
      success: true,
      data: { total: tokens.length, updated, results },
    });
  } catch (error) {
    console.error('[Enrich Chatwork] エラー:', error);
    return NextResponse.json({ success: false, error: 'Chatworkトークン補完に失敗しました' }, { status: 500 });
  }
}
