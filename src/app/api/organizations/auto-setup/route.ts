// Phase 52: 組織一括セットアップAPI
// 組織作成 + メンバー紐づけ + チャネル登録を1回のリクエストで実行
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { OrgRecommendationService } from '@/services/analytics/orgRecommendation.service';

export const dynamic = 'force-dynamic';

// Phase 60: 未登録組織の候補を取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const candidates = await OrgRecommendationService.detectUnregisteredOrgs(userId);
    return NextResponse.json({ success: true, data: candidates });
  } catch (error) {
    console.error('[Auto Setup GET] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      domain,
      relationshipType = 'client',
      contactIds = [],
      channels = [],
    } = body as {
      name: string;
      domain?: string;
      relationshipType?: string;
      contactIds?: string[];
      channels?: Array<{ serviceName: string; channelId: string; channelName: string }>;
    };

    if (!name) {
      return NextResponse.json({ error: '組織名は必須です' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    const results = {
      organization: null as { id: string; name: string } | null,
      membersAdded: 0,
      channelsAdded: 0,
      errors: [] as string[],
    };

    // 1. 組織作成（ドメイン重複チェック付き）
    let orgId: string | null = null;

    if (domain) {
      const { data: existing } = await sb
        .from('organizations')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('domain', domain)
        .limit(1);

      if (existing && existing.length > 0) {
        orgId = existing[0].id;
        results.organization = { id: orgId, name: existing[0].name };
        results.errors.push(`組織「${existing[0].name}」は既に存在します（ドメイン: ${domain}）`);
      }
    }

    if (!orgId) {
      const { data: newOrg, error: orgErr } = await sb
        .from('organizations')
        .insert({
          name,
          domain: domain || null,
          relationship_type: relationshipType,
          user_id: userId,
        })
        .select('id, name')
        .single();

      if (orgErr || !newOrg) {
        console.error('[Auto Setup] 組織作成エラー:', orgErr);
        return NextResponse.json({
          error: `組織の作成に失敗: ${orgErr?.message || 'Unknown error'}`,
        }, { status: 500 });
      }

      orgId = newOrg.id;
      results.organization = { id: orgId, name: newOrg.name };
    }

    // 2. メンバー一括紐づけ
    if (contactIds.length > 0 && orgId) {
      // organization_idが他の組織に設定されていないコンタクトのみ更新
      for (const contactId of contactIds) {
        try {
          const { data: contact } = await sb
            .from('contact_persons')
            .select('id, organization_id')
            .eq('id', contactId)
            .single();

          if (!contact) continue;

          // 既に他の組織に所属している場合はスキップ
          if (contact.organization_id && contact.organization_id !== orgId) {
            results.errors.push(`コンタクト ${contactId} は既に他の組織に所属しています`);
            continue;
          }

          // relationship_typeマッピング
          const relMap: Record<string, string> = {
            internal: 'internal',
            client: 'client',
            partner: 'partner',
            vendor: 'partner',
            prospect: 'client',
          };

          const { error: updateErr } = await sb
            .from('contact_persons')
            .update({
              organization_id: orgId,
              company_name: name,
              relationship_type: relMap[relationshipType] || 'client',
              auto_added_to_org: true,
            })
            .eq('id', contactId);

          if (!updateErr) {
            results.membersAdded++;
          } else {
            results.errors.push(`メンバー追加エラー: ${updateErr.message}`);
          }
        } catch (e) {
          results.errors.push(`メンバー ${contactId} の処理エラー`);
        }
      }
    }

    // 3. チャネル一括登録
    if (channels.length > 0 && orgId) {
      for (const ch of channels) {
        try {
          const { error: chErr } = await sb
            .from('organization_channels')
            .insert({
              organization_id: orgId,
              service_name: ch.serviceName,
              channel_id: ch.channelId,
              channel_name: ch.channelName,
              is_active: true,
              user_id: userId,
            });

          if (!chErr) {
            results.channelsAdded++;
          } else if (chErr.code === '23505') {
            // UNIQUE制約違反（既存）→スキップ
            results.errors.push(`チャネル ${ch.channelName} は既に登録済み`);
          } else {
            results.errors.push(`チャネル登録エラー: ${chErr.message}`);
          }
        } catch (e) {
          results.errors.push(`チャネル ${ch.channelName} の処理エラー`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('[Auto Setup] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
