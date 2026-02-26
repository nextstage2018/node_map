// Phase 37: 組織メンバー自動検出 API
// 紐づけ済みチャネルの inbox_messages から送信者を抽出し、
// 未紐づけの contact_persons を自動でメンバーに追加する
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

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

    // 組織の所有確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .eq('user_id', userId)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: '組織が見つかりません' }, { status: 404 });
    }

    // 紐づけ済みチャネル取得
    const { data: channels } = await supabase
      .from('organization_channels')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: 0, added: 0 },
        message: '紐づけ済みのチャネルがありません。先にチャネルを追加してください。',
      });
    }

    // チャネルごとにメッセージから送信者アドレスを収集
    const senderAddresses = new Set<string>();

    for (const ch of channels) {
      let messages: { from_address: string; from_name: string }[] = [];

      if (ch.service_name === 'slack') {
        // Slack: metadata の slackChannel でフィルタ
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'slack')
          .filter('metadata->>slackChannel', 'eq', ch.channel_id)
          .limit(200);
        messages = data || [];
      } else if (ch.service_name === 'chatwork') {
        // Chatwork: metadata の chatworkRoomId でフィルタ
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'chatwork')
          .filter('metadata->>chatworkRoomId', 'eq', ch.channel_id)
          .limit(200);
        messages = data || [];
      } else if (ch.service_name === 'email') {
        // Email: from_address がドメインを含むかチェック
        const domain = ch.channel_id.startsWith('@') ? ch.channel_id : `@${ch.channel_id}`;
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'email')
          .ilike('from_address', `%${domain}`)
          .limit(200);
        messages = data || [];
      }

      for (const msg of messages) {
        if (msg.from_address) {
          senderAddresses.add(msg.from_address);
        }
      }
    }

    if (senderAddresses.size === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: 0, added: 0 },
        message: '紐づけチャネルにメッセージが見つかりませんでした。',
      });
    }

    // contact_persons から一致するコンタクトを検索
    // from_address は contact_persons の id と一致するケース（Slack/Chatwork）
    // または contact_channels のアドレスと一致するケース
    const addressArray = Array.from(senderAddresses);

    // まず contact_persons.id で照合（Slack=UXXXXX, Chatwork=account_id）
    const { data: contactsById } = await supabase
      .from('contact_persons')
      .select('id, name, organization_id')
      .in('id', addressArray);

    // 次に contact_channels.address で照合（email）
    const { data: channelMatches } = await supabase
      .from('contact_channels')
      .select('contact_id, address')
      .in('address', addressArray);

    // contact_id のセットを作る（重複排除）
    const matchedContactIds = new Set<string>();

    // id直接一致
    if (contactsById) {
      for (const c of contactsById) {
        if (!c.organization_id || c.organization_id === orgId) {
          matchedContactIds.add(c.id);
        }
      }
    }

    // channel経由一致（別組織所属のコンタクトは除外するため、後でフィルタ）
    if (channelMatches) {
      for (const ch of channelMatches) {
        matchedContactIds.add(ch.contact_id);
      }
    }

    // 既にこの組織に紐づいているコンタクトを除外
    const { data: existingMembers } = await supabase
      .from('contact_persons')
      .select('id')
      .eq('organization_id', orgId);

    const existingIds = new Set((existingMembers || []).map(m => m.id));
    const newMemberIds = Array.from(matchedContactIds).filter(id => !existingIds.has(id));

    if (newMemberIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: senderAddresses.size, added: 0 },
        message: `${senderAddresses.size}人の送信者を検出しましたが、全員既にメンバーか、コンタクトに未登録です。`,
      });
    }

    // 他の組織に紐づいているコンタクトは除外
    const { data: freeContacts } = await supabase
      .from('contact_persons')
      .select('id')
      .in('id', newMemberIds)
      .or('organization_id.is.null');

    const freeIds = (freeContacts || []).map(c => c.id);

    if (freeIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: senderAddresses.size, added: 0 },
        message: '検出されたコンタクトは全て他の組織に所属済みです。',
      });
    }

    // メンバーとして追加（company_name も組織名に設定）
    const { error: updateError } = await supabase
      .from('contact_persons')
      .update({
        organization_id: orgId,
        company_name: org.name,
        auto_added_to_org: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', freeIds);

    if (updateError) {
      console.error('[Detect Members API] 更新エラー:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { detected: senderAddresses.size, added: freeIds.length },
      message: `${freeIds.length}人のメンバーを自動追加しました。`,
    });
  } catch (error) {
    console.error('[Detect Members API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバー検出に失敗しました' }, { status: 500 });
  }
}
