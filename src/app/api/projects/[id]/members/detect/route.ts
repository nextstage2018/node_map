// v10.2: プロジェクトチャネルからメンバー自動検出 API
// ★ ログインユーザー優先マッチ:
//   Slack user ID / Chatwork account_id → user_service_tokens で照合
//   → ログインユーザーなら linked_user_id 経由で既存 contact_persons を確定利用
//   → ログインユーザーでなければ外部メンバーとして処理
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

    // ============================================================
    // ★ v10.2: ログインユーザーのチャネルIDマップを構築
    // user_service_tokens から Slack authed_user_id / Chatwork account_id を取得
    // → チャネルID → { nodeMapUserId, contactId } の確定マップ
    // ============================================================
    const loggedInUserMap = new Map<string, { nodeMapUserId: string; contactId: string | null }>();

    const { data: allTokens } = await supabase
      .from('user_service_tokens')
      .select('user_id, service_name, token_data')
      .eq('is_active', true)
      .in('service_name', ['slack', 'chatwork']);

    // ログインユーザーの contact_persons を linked_user_id で取得
    const userIds = [...new Set((allTokens || []).map(t => t.user_id))];
    const userToContactId = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: linkedContacts } = await supabase
        .from('contact_persons')
        .select('id, linked_user_id')
        .in('linked_user_id', userIds);

      if (linkedContacts) {
        for (const c of linkedContacts) {
          if (c.linked_user_id) {
            userToContactId.set(c.linked_user_id, c.id);
          }
        }
      }
    }

    // マップ構築: チャネルID → ログインユーザー情報
    for (const token of (allTokens || [])) {
      const contactId = userToContactId.get(token.user_id) || null;

      if (token.service_name === 'slack' && token.token_data?.authed_user_id) {
        loggedInUserMap.set(token.token_data.authed_user_id, {
          nodeMapUserId: token.user_id,
          contactId,
        });
      }
      if (token.service_name === 'chatwork' && token.token_data?.account_id) {
        loggedInUserMap.set(String(token.token_data.account_id), {
          nodeMapUserId: token.user_id,
          contactId,
        });
      }
    }

    console.log(`[Project Members Detect] ログインユーザーマップ: ${loggedInUserMap.size}人 (${[...loggedInUserMap.keys()].join(', ')})`);

    // ============================================================
    // 送信者マップ構築
    // ============================================================
    const senderMap = new Map<string, { address: string; name: string; channel: string; email?: string }>();

    // 経路1: Slack API で直接チャネルメンバーを取得
    const slackChannels = channels.filter(ch => ch.service_name === 'slack');

    if (slackChannels.length > 0) {
      try {
        const { getChannelMembers } = await import('@/services/slack/slackClient.service');

        for (const ch of slackChannels) {
          const members = await getChannelMembers(ch.channel_identifier, userId);

          for (const member of members) {
            if (member.isBot) continue;

            console.log(`[Project Members Detect] Slackメンバー: ${member.realName || member.name} (${member.slackUserId}), email: ${member.email || '(なし)'}, ログインユーザー: ${loggedInUserMap.has(member.slackUserId) ? '✓' : '✗'}`);

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

    // 経路2: inbox_messages から送信者を抽出（Chatwork / Email + Slackフォールバック）
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
    // 既存メンバーの全アドレスを収集（重複防止）
    // ============================================================
    const { data: existingMembers } = await supabase
      .from('project_members')
      .select('contact_id')
      .eq('project_id', projectId);

    const existingContactIds = new Set((existingMembers || []).map(m => m.contact_id));

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

    // グローバルなcontact_channels照合（アドレス→contact_id）
    const addressArray = Array.from(senderMap.keys());
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

    // グローバル名前照合（フォールバック用）
    const knownNames = new Map<string, string>();
    {
      const { data: allContacts } = await supabase
        .from('contact_persons')
        .select('id, name')
        .not('name', 'is', null);

      if (allContacts) {
        for (const c of allContacts) {
          if (!knownNames.has(c.name)) {
            knownNames.set(c.name, c.id);
          }
        }
      }
    }

    // ============================================================
    // メンバー追加ループ
    // ============================================================
    let addedCount = 0;

    for (const [address, sender] of senderMap) {
      // ★ 重複チェック1: アドレスが既存メンバーに紐づいている
      if (knownAddresses.has(address)) {
        // 既存メンバーでもメールアドレスがあれば contact_channels(email) に追加
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

      // ============================================================
      // ★ v10.2: contact_id解決（4段階、ログインユーザー優先）
      // ============================================================
      let contactId: string | undefined;

      // 段階0: ログインユーザーマッチ（最優先・確定的）
      const loggedInUser = loggedInUserMap.get(address);
      if (loggedInUser?.contactId) {
        contactId = loggedInUser.contactId;
        console.log(`[Project Members Detect] ★ログインユーザー確定: ${sender.name} → contact_id=${contactId}`);

        // contact_channels にこのアドレスが未登録なら追加（次回以降の高速マッチ用）
        if (!addressToContactId.has(address)) {
          const mainChannel = sender.channel === 'slack' ? 'slack' : sender.channel === 'chatwork' ? 'chatwork' : 'email';
          await supabase.from('contact_channels').upsert({
            contact_id: contactId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          }, { onConflict: 'contact_id,channel,address' }).then(({ error: chErr }) => {
            if (chErr) console.warn('[Project Members Detect] チャネル登録:', chErr.message);
          });
        }
      }

      // 段階1: contact_channels アドレス照合
      if (!contactId) {
        contactId = addressToContactId.get(address);
      }

      // 段階2: 名前でグローバル照合
      if (!contactId) {
        const nameMatchId = knownNames.get(sender.name);
        if (nameMatchId) {
          contactId = nameMatchId;
          const mainChannel = sender.channel === 'slack' ? 'slack' : sender.channel === 'chatwork' ? 'chatwork' : 'email';
          await supabase.from('contact_channels').insert({
            contact_id: nameMatchId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          }).then(({ error: chErr }) => {
            if (chErr && chErr.code !== '23505') {
              console.warn('[Project Members Detect] 名前マッチ チャネル登録失敗:', chErr.message);
            }
          });
        }
      }

      // 段階3: 新規コンタクト作成（外部メンバーのみここに到達）
      if (!contactId) {
        const newId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const mainChannel = sender.channel === 'slack' ? 'slack' : sender.channel === 'chatwork' ? 'chatwork' : 'email';
        // ★ organization_id は自動セットしない（手動で設定）
        const { error: createErr } = await supabase
          .from('contact_persons')
          .insert({
            id: newId,
            name: sender.name,
            owner_user_id: userId,
            organization_id: null,
            relationship_type: 'client',
            main_channel: mainChannel,
            confirmed: false,
          });

        if (!createErr) {
          contactId = newId;
          await supabase.from('contact_channels').insert({
            contact_id: newId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          }).then(({ error: chErr }) => {
            if (chErr) {
              console.error('[Project Members Detect] contact_channels挿入失敗:', chErr.message, { newId, mainChannel, address });
            }
          });
          console.log(`[Project Members Detect] 外部メンバー新規作成: ${sender.name} → contact_id=${newId}`);
        } else {
          console.error('[Project Members Detect] contact_persons挿入失敗:', createErr.message, { address, name: sender.name });
          continue;
        }
      }

      // メールアドレスがあれば contact_channels(email) にも追加
      if (sender.email && contactId) {
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
              console.warn('[Project Members Detect] email追加失敗:', emailErr.message);
            }
          });
        }
      }

      // 重複チェック: 既にproject_membersに存在
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

    const emailCount = Array.from(senderMap.values()).filter(s => !!s.email).length;
    const loggedInCount = Array.from(senderMap.keys()).filter(addr => loggedInUserMap.has(addr)).length;
    console.log(`[Project Members Detect] 結果: ${senderMap.size}人検出, ログインユーザー${loggedInCount}人, メール${emailCount}人, ${addedCount}人追加`);

    return NextResponse.json({
      success: true,
      data: { detected: senderMap.size, added: addedCount, emailsFound: emailCount, loggedInMatched: loggedInCount },
      message: addedCount > 0
        ? `${senderMap.size}人検出、${addedCount}人を追加しました。（ログインユーザー: ${loggedInCount}人、メール取得: ${emailCount}人）`
        : `${senderMap.size}人検出しましたが、全員既にメンバーです。（ログインユーザー: ${loggedInCount}人、メール取得: ${emailCount}人）`,
    });
  } catch (error) {
    console.error('[Project Members Detect API] エラー:', error);
    return NextResponse.json({ success: false, error: 'メンバー検出に失敗しました' }, { status: 500 });
  }
}
