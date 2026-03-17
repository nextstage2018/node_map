// v3.3 + v4.6 + v9.0fix: プロジェクトチャネルからメンバー自動検出 API
// 経路1: Slack API（conversations.members）で直接チャネル参加者を取得
// 経路2: inbox_messages から送信者を抽出（フォールバック + Chatwork/Email）
// → contact_persons/project_members に追加
// v9.0fix: 既存メンバーのcontact_channelsを逆引きして重複防止を強化
import { NextResponse, NextRequest } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
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

    // ★ ルール#1: getServerSupabase() を使う
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const { id: projectId } = await params;

    // プロジェクトの存在確認
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // プロジェクトに紐づくチャネル取得
    const { data: channels } = await supabase
      .from('project_channels')
      .select('*')
      .eq('project_id', projectId);

    if (!channels || channels.length === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: 0, added: 0 },
        message: 'チャネルが未登録です。先にチャネルを追加してください。',
      });
    }

    // 送信者マップ: address → { address, name, channel, email? }
    const senderMap = new Map<string, { address: string; name: string; channel: string; email?: string }>();

    // ============================================================
    // 経路1: Slack API で直接チャネルメンバーを取得
    // ============================================================
    const slackChannels = channels.filter(ch => ch.service_name === 'slack');

    if (slackChannels.length > 0) {
      try {
        const { getChannelMembers } = await import('@/services/slack/slackClient.service');

        for (const ch of slackChannels) {
          const members = await getChannelMembers(ch.channel_identifier, userId);

          for (const member of members) {
            // ボットは除外
            if (member.isBot) continue;

            if (!senderMap.has(member.slackUserId)) {
              senderMap.set(member.slackUserId, {
                address: member.slackUserId,
                name: member.realName || member.name,
                channel: 'slack',
                email: member.email || undefined,
              });
            }
          }
        }
      } catch (slackErr) {
        console.warn('[Project Members Detect] Slack API取得失敗、inbox_messagesにフォールバック:', slackErr);
      }
    }

    // ============================================================
    // 経路2: inbox_messages から送信者を抽出（Chatwork / Email + Slackフォールバック）
    // ============================================================
    for (const ch of channels) {
      let messages: { from_address: string; from_name: string }[] = [];

      if (ch.service_name === 'slack' && senderMap.size > 0) {
        const hasSlackMembers = Array.from(senderMap.values()).some(s => s.channel === 'slack');
        if (hasSlackMembers) continue;
      }

      if (ch.service_name === 'slack') {
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'slack')
          .filter('metadata->>slackChannel', 'eq', ch.channel_identifier)
          .limit(200);
        messages = data || [];
      } else if (ch.service_name === 'chatwork') {
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'chatwork')
          .filter('metadata->>chatworkRoomId', 'eq', ch.channel_identifier)
          .limit(200);
        messages = data || [];
      } else if (ch.service_name === 'email') {
        const domain = ch.channel_identifier.startsWith('@') ? ch.channel_identifier : `@${ch.channel_identifier}`;
        const { data } = await supabase
          .from('inbox_messages')
          .select('from_address, from_name')
          .eq('channel', 'email')
          .ilike('from_address', `%${domain}`)
          .limit(200);
        messages = data || [];
      }

      for (const msg of messages) {
        if (msg.from_address && !senderMap.has(msg.from_address)) {
          senderMap.set(msg.from_address, {
            address: msg.from_address,
            name: msg.from_name || msg.from_address,
            channel: ch.service_name,
          });
        }
      }
    }

    if (senderMap.size === 0) {
      return NextResponse.json({
        success: true,
        data: { detected: 0, added: 0 },
        message: 'チャネルにメンバーが見つかりませんでした。',
      });
    }

    // ============================================================
    // ★ 重複防止: 既存メンバーの全アドレスを収集
    // project_members → contact_id → contact_channels.address で逆引き
    // ============================================================
    const { data: existingMembers } = await supabase
      .from('project_members')
      .select('contact_id')
      .eq('project_id', projectId);

    const existingContactIds = new Set((existingMembers || []).map(m => m.contact_id));

    // 既存メンバーのcontact_channelsからアドレスを取得（逆引き）
    const knownAddresses = new Set<string>();
    if (existingContactIds.size > 0) {
      const contactIdArray = Array.from(existingContactIds);
      const { data: existingChannels } = await supabase
        .from('contact_channels')
        .select('contact_id, address')
        .in('contact_id', contactIdArray);

      if (existingChannels) {
        for (const ch of existingChannels) {
          knownAddresses.add(ch.address);
        }
      }
    }

    // 組織内の既存コンタクト名も収集（contact_channels未登録時の安全策）
    const knownNames = new Map<string, string>(); // name → contact_id
    if (project.organization_id) {
      const { data: orgContacts } = await supabase
        .from('contact_persons')
        .select('id, name')
        .eq('organization_id', project.organization_id);

      if (orgContacts) {
        for (const c of orgContacts) {
          if (!knownNames.has(c.name)) {
            knownNames.set(c.name, c.id);
          }
        }
      }
    }

    // ============================================================
    // メンバー追加ループ
    // ============================================================
    const addressArray = Array.from(senderMap.keys());

    // グローバルなcontact_channels照合（アドレス→contact_id）
    const addressToContactId = new Map<string, string>();
    const { data: channelMatches } = await supabase
      .from('contact_channels')
      .select('contact_id, address')
      .in('address', addressArray);

    if (channelMatches) {
      for (const ch of channelMatches) {
        addressToContactId.set(ch.address, ch.contact_id);
      }
    }

    let addedCount = 0;

    for (const [address, sender] of senderMap) {
      // ★ 重複チェック1: アドレスが既存メンバーに紐づいている
      if (knownAddresses.has(address)) {
        // 既存メンバーでもメールアドレスがあれば contact_channels(email) に追加
        // → カレンダー招待で参加者として表示するために必要
        if (sender.email) {
          const existingContactId = addressToContactId.get(address);
          if (existingContactId) {
            const { data: existingEmail } = await supabase
              .from('contact_channels')
              .select('id')
              .eq('contact_id', existingContactId)
              .eq('channel', 'email')
              .eq('address', sender.email)
              .limit(1);

            if (!existingEmail || existingEmail.length === 0) {
              await supabase.from('contact_channels').insert({
                contact_id: existingContactId,
                channel: 'email',
                address: sender.email,
                user_id: userId,
              }).then(({ error: emailErr }) => {
                if (emailErr && emailErr.code !== '23505') {
                  console.warn('[Project Members Detect] 既存メンバーemail追加失敗:', emailErr.message);
                }
              });
            }
          }
        }
        continue;
      }

      // contact_idの解決（3段階）
      let contactId = addressToContactId.get(address);

      // ★ 重複チェック2: 名前で既存コンタクトに一致
      if (!contactId) {
        const nameMatchId = knownNames.get(sender.name);
        if (nameMatchId) {
          contactId = nameMatchId;
          // 次回のためにcontact_channelsにも登録
          const mainChannel = sender.channel === 'slack' ? 'slack' : sender.channel === 'chatwork' ? 'chatwork' : 'email';
          await supabase.from('contact_channels').insert({
            contact_id: nameMatchId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          });
        }
      }

      // 新規コンタクト作成
      if (!contactId) {
        const newId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const mainChannel = sender.channel === 'slack' ? 'slack' : sender.channel === 'chatwork' ? 'chatwork' : 'email';
        const { error: createErr } = await supabase
          .from('contact_persons')
          .insert({
            id: newId,
            name: sender.name,
            owner_user_id: userId,
            organization_id: project.organization_id || null,
            relationship_type: 'internal',
            main_channel: mainChannel,
            confirmed: false,
          });

        if (!createErr) {
          contactId = newId;
          const { error: chErr } = await supabase.from('contact_channels').insert({
            contact_id: newId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          });
          if (chErr) {
            console.error('[Project Members Detect] contact_channels挿入失敗:', chErr.message, { newId, mainChannel, address });
          }
        } else {
          console.error('[Project Members Detect] contact_persons挿入失敗:', createErr.message, { address, name: sender.name });
          continue;
        }
      }

      // ★ Slackメンバーのメールアドレスがあれば contact_channels(email) にも追加
      // → カレンダー招待（参加者選択）に必要
      if (sender.email && contactId) {
        // 既にemail登録済みか確認してから追加（UNIQUE制約対策）
        const { data: existingEmail } = await supabase
          .from('contact_channels')
          .select('id')
          .eq('contact_id', contactId)
          .eq('channel', 'email')
          .eq('address', sender.email)
          .limit(1);

        if (!existingEmail || existingEmail.length === 0) {
          await supabase.from('contact_channels').insert({
            contact_id: contactId,
            channel: 'email',
            address: sender.email,
            user_id: userId,
          }).then(({ error: emailErr }) => {
            if (emailErr && emailErr.code !== '23505') {
              console.warn('[Project Members Detect] email contact_channels追加失敗:', emailErr.message, { contactId, email: sender.email });
            }
          });
        }
      }

      // ★ 重複チェック3: 既にproject_membersに存在
      if (existingContactIds.has(contactId)) continue;

      // project_members に追加
      const { error: memberErr } = await supabase
        .from('project_members')
        .insert({
          project_id: projectId,
          contact_id: contactId,
          role: 'member',
          user_id: userId,
        });

      if (!memberErr) {
        addedCount++;
        existingContactIds.add(contactId);
        knownAddresses.add(address);
      } else if (memberErr.code === '23505') {
        existingContactIds.add(contactId);
      }
    }

    return NextResponse.json({
      success: true,
      data: { detected: senderMap.size, added: addedCount },
      message: addedCount > 0
        ? `${senderMap.size}人検出、${addedCount}人を追加しました。`
        : `${senderMap.size}人検出しましたが、全員既にメンバーです。`,
    });
  } catch (error) {
    console.error('[Project Members Detect API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバー検出に失敗しました' }, { status: 500 });
  }
}
