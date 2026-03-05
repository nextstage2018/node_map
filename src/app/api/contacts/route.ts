// Phase 26+54: コンタクトAPI — 共有化 + コンテキスト強化 + active_channels自動集計 + 組織自動リンク
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId, getServerUserEmail } from '@/lib/serverAuth';
import { getBlocklist } from '@/services/inbox/inboxStorage.service';
import { findOrCreateOrganization } from '@/services/contact/organizationLinking.service';

export const dynamic = 'force-dynamic';

// ========================================
// active_channels を inbox_messages の metadata から集計
// ========================================
async function getActiveChannels(
  supabase: ReturnType<typeof createServerClient>,
  senderAddress: string,
  senderName: string
): Promise<{ channel: string; name: string }[]> {
  if (!supabase) return [];

  const { data: msgs } = await supabase
    .from('inbox_messages')
    .select('channel, metadata')
    .or(`from_address.eq.${senderAddress},from_name.eq.${senderName}`)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (!msgs) return [];

  const channelSet = new Map<string, string>();
  for (const msg of msgs) {
    const meta = msg.metadata || {};
    if (msg.channel === 'slack' && meta.slackChannelName) {
      const key = `slack:${meta.slackChannel || meta.slackChannelName}`;
      if (!channelSet.has(key)) {
        channelSet.set(key, meta.slackChannelName);
      }
    } else if (msg.channel === 'chatwork' && meta.chatworkRoomName) {
      const key = `chatwork:${meta.chatworkRoomId || meta.chatworkRoomName}`;
      if (!channelSet.has(key)) {
        channelSet.set(key, meta.chatworkRoomName);
      }
    } else if (msg.channel === 'email') {
      channelSet.set('email:main', 'メール');
    }
  }

  return Array.from(channelSet.entries()).map(([key, name]) => ({
    channel: key.split(':')[0],
    name,
  }));
}

// ========================================
// GET: コンタクト一覧取得（共有化 + コンテキスト強化）
// ========================================
export async function GET(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: true, data: [], stats: { total: 0, byRelationship: {}, byChannel: {}, unconfirmedCount: 0 } });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const relationship = searchParams.get('relationship') || '';
    const channel = searchParams.get('channel') || '';

    // Phase 35: ログインユーザーのメールアドレスを取得（「Me」除外用）
    const userEmail = await getServerUserEmail();
    const userEmailLower = userEmail?.toLowerCase() || '';

    // 1. inbox_messagesからユニークな送信者を集計（metadata含む）
    const { data: senderStats, error: senderError } = await supabase.rpc('get_contact_stats_from_messages');

    // rpcが未登録の場合はフォールバック: 直接クエリ
    let senders: {
      from_name: string;
      from_address: string;
      channel: string;
      channels: string[];
      count: number;
      last_contact: string;
      active_channels: { channel: string; name: string }[];
    }[] = [];

    if (senderError || !senderStats) {
      // Slack/Chatwork: 受信メッセージのfrom_addressからコンタクト生成（従来通り）
      const { data: rawSlackCwMessages } = await supabase
        .from('inbox_messages')
        .select('from_name, from_address, channel, timestamp, metadata')
        .in('channel', ['slack', 'chatwork'])
        .neq('from_name', 'あなた')
        .neq('from_name', '')
        .order('timestamp', { ascending: false });

      // Email: 送信メッセージのto_listからコンタクト生成（メルマガ等のノイズ除外）
      const { data: rawSentEmails } = await supabase
        .from('inbox_messages')
        .select('to_list, channel, timestamp, metadata, direction')
        .eq('channel', 'email')
        .eq('direction', 'sent')
        .order('timestamp', { ascending: false });

      const senderMap = new Map<string, {
        from_name: string;
        from_address: string;
        channels: Set<string>;
        count: number;
        last_contact: string;
        channelNames: Map<string, string>;
      }>();

      // Slack/Chatworkメッセージ処理（従来ロジック）
      if (rawSlackCwMessages) {
        for (const msg of rawSlackCwMessages) {
          let key = '';
          if (msg.from_address && msg.from_address.trim()) {
            key = msg.from_address.toLowerCase().trim();
          } else {
            key = (msg.from_name || '').trim().replace(/[\s　]+/g, ' ').toLowerCase();
          }
          if (!key) continue;
          const fromNameLower = (msg.from_name || '').toLowerCase();
          if (fromNameLower === 'me' || fromNameLower === 'me（自分）') continue;
          const meta = msg.metadata || {};
          const existing = senderMap.get(key);

          let channelKey = '';
          let channelDisplayName = '';
          if (msg.channel === 'slack' && meta.slackChannelName) {
            channelKey = `slack:${meta.slackChannel || meta.slackChannelName}`;
            channelDisplayName = meta.slackChannelName;
          } else if (msg.channel === 'chatwork' && meta.chatworkRoomName) {
            channelKey = `chatwork:${meta.chatworkRoomId || meta.chatworkRoomName}`;
            channelDisplayName = meta.chatworkRoomName;
          }

          if (existing) {
            existing.count++;
            existing.channels.add(msg.channel);
            if (channelKey && !existing.channelNames.has(channelKey)) {
              existing.channelNames.set(channelKey, channelDisplayName);
            }
            if (msg.timestamp > existing.last_contact) {
              existing.last_contact = msg.timestamp;
              existing.from_name = msg.from_name || existing.from_name;
            }
          } else {
            const channelNames = new Map<string, string>();
            if (channelKey) channelNames.set(channelKey, channelDisplayName);
            senderMap.set(key, {
              from_name: msg.from_name || '',
              from_address: msg.from_address || '',
              channels: new Set([msg.channel]),
              count: 1,
              last_contact: msg.timestamp,
              channelNames,
            });
          }
        }
      }

      // Email送信先処理（to_listから宛先を展開）
      if (rawSentEmails) {
        for (const msg of rawSentEmails) {
          const toList = msg.to_list || [];
          for (const recipient of toList) {
            // to_listの要素: { name: string, address: string } または文字列
            let toAddress = '';
            let toName = '';
            if (typeof recipient === 'string') {
              toAddress = recipient.toLowerCase().trim();
              toName = recipient;
            } else if (recipient && typeof recipient === 'object') {
              toAddress = (recipient.address || '').toLowerCase().trim();
              toName = recipient.name || recipient.address || '';
            }
            if (!toAddress) continue;
            // 自分自身を除外
            if (userEmailLower && toAddress === userEmailLower) continue;

            const existing = senderMap.get(toAddress);
            if (existing) {
              existing.count++;
              existing.channels.add('email');
              if (!existing.channelNames.has('email:main')) {
                existing.channelNames.set('email:main', 'メール');
              }
              if (msg.timestamp > existing.last_contact) {
                existing.last_contact = msg.timestamp;
                if (toName) existing.from_name = toName;
              }
            } else {
              const channelNames = new Map<string, string>();
              channelNames.set('email:main', 'メール');
              senderMap.set(toAddress, {
                from_name: toName,
                from_address: toAddress,
                channels: new Set(['email']),
                count: 1,
                last_contact: msg.timestamp,
                channelNames,
              });
            }
          }
        }
      }

      senders = Array.from(senderMap.values()).map((s) => ({
        from_name: s.from_name,
        from_address: s.from_address,
        channel: Array.from(s.channels)[0],
        channels: Array.from(s.channels),
        count: s.count,
        last_contact: s.last_contact,
        active_channels: Array.from(s.channelNames.entries()).map(([key, name]) => ({
          channel: key.split(':')[0],
          name,
        })),
      }));
    } else {
      senders = senderStats;
    }

    // 2. 既存のcontact_personsテーブルからデータ取得（1コンタクト=1行、channels=配列、組織JOIN）
    const { data: existingContacts } = await supabase
      .from('contact_persons')
      .select('*, contact_channels(*), organizations(relationship_type)')
      .or(`owner_user_id.eq.${userId},owner_user_id.is.null`);

    // 3. Phase 35: senderの統計情報をアドレス/名前で引けるマップに変換
    // 「Me」やログインユーザーのアドレスを除外
    const senderByAddress = new Map<string, typeof senders[0]>();
    const senderByName = new Map<string, typeof senders[0]>();
    const matchedSenderKeys = new Set<string>();

    for (const s of senders) {
      const nameLower = (s.from_name || '').toLowerCase();
      if (nameLower === 'me' || nameLower === 'me（自分）') continue;
      if (userEmailLower && s.from_address?.toLowerCase() === userEmailLower) continue;
      if (s.from_address && s.from_address.trim()) {
        senderByAddress.set(s.from_address.toLowerCase().trim(), s);
      }
      if (s.from_name) {
        // Phase 35: 名前のスペース正規化（全角/半角統一）
        const normalizedName = s.from_name.trim().replace(/[\s　]+/g, ' ').toLowerCase();
        senderByName.set(normalizedName, s);
      }
    }

    // 4. Phase 35: contact_persons を主体としてコンタクトリスト生成（重複なし）
    const contacts: {
      id: string; name: string; address: string;
      channels: { channel: string; address: string; frequency?: number }[];
      allChannels: string[]; relationshipType: string; confidence: number;
      confirmed: boolean; mainChannel: string; messageCount: number;
      lastContactAt: string; isAutoGenerated: boolean;
      companyName: string; department: string; notes: string;
      visibility: string; activeChannels: { channel: string; name: string }[];
      organization_id?: string; is_team_member?: boolean;
    }[] = [];

    if (existingContacts) {
      for (const c of existingContacts) {
        const cChannels = (c.contact_channels && Array.isArray(c.contact_channels)) ? c.contact_channels : [];

        // このコンタクトに対応するsenderを探す（チャンネルアドレス → 名前の優先順）
        let matchedSender: typeof senders[0] | undefined;
        for (const ch of cChannels) {
          const addr = ch.address?.toLowerCase();
          if (addr && senderByAddress.has(addr)) {
            matchedSender = senderByAddress.get(addr);
            matchedSenderKeys.add(addr);
            break;
          }
        }
        if (!matchedSender && c.name) {
          // Phase 35: 名前正規化してから照合
          const normalizedName = c.name.trim().replace(/[\s　]+/g, ' ').toLowerCase();
          if (senderByName.has(normalizedName)) {
            matchedSender = senderByName.get(normalizedName);
            const sKey = matchedSender?.from_address?.toLowerCase()?.trim();
            if (sKey) matchedSenderKeys.add(sKey);
            matchedSenderKeys.add(normalizedName);
          }
        }

        // 複数senderがマッチする場合もカウントを合算
        let totalCount = matchedSender?.count || 0;
        let latestContact = matchedSender?.last_contact || c.last_contact_at || '';
        const allMsgChannels = new Set<string>(matchedSender?.channels || []);
        const mergedActiveChannels: { channel: string; name: string }[] = [...(matchedSender?.active_channels || [])];
        const activeChannelKeys = new Set(mergedActiveChannels.map((a) => `${a.channel}::${a.name}`));

        // 他のチャンネルアドレスでもマッチするsenderがあれば合算
        for (const ch of cChannels) {
          const addr = ch.address?.toLowerCase();
          if (!addr || (matchedSender && addr === matchedSender.from_address?.toLowerCase())) continue;
          const otherSender = senderByAddress.get(addr);
          if (otherSender) {
            matchedSenderKeys.add(addr);
            totalCount += otherSender.count;
            if (otherSender.last_contact > latestContact) latestContact = otherSender.last_contact;
            for (const sCh of (otherSender.channels || [])) allMsgChannels.add(sCh);
            for (const ac of (otherSender.active_channels || [])) {
              const acKey = `${ac.channel}::${ac.name}`;
              if (!activeChannelKeys.has(acKey)) {
                mergedActiveChannels.push(ac);
                activeChannelKeys.add(acKey);
              }
            }
          }
        }

        // DB contact_channels からも activeChannels に追加
        for (const ch of cChannels) {
          const acKey = `${ch.channel}::${ch.address}`;
          if (!activeChannelKeys.has(acKey)) {
            mergedActiveChannels.push({ channel: ch.channel, name: ch.address });
            activeChannelKeys.add(acKey);
          }
        }

        const channelTypes = [...new Set([
          ...cChannels.map((ch: { channel: string }) => ch.channel),
          ...Array.from(allMsgChannels),
        ])];
        const primaryAddress = cChannels.length > 0 ? cChannels[0].address : (matchedSender?.from_address || '');

        contacts.push({
          id: c.id,
          name: c.name || '',
          address: primaryAddress,
          channels: cChannels,
          allChannels: channelTypes.length > 0 ? channelTypes : [c.main_channel || 'email'],
          // Phase 54: 組織のrelationship_typeを優先参照
          relationshipType: (c.organizations as { relationship_type?: string } | null)?.relationship_type || 'unknown',
          confidence: c.confidence || 0,
          confirmed: c.confirmed || false,
          mainChannel: c.main_channel || 'email',
          messageCount: totalCount || c.message_count || 0,
          lastContactAt: latestContact || c.last_contact_at || '',
          isAutoGenerated: false,
          companyName: c.company_name || '',
          department: c.department || '',
          notes: c.notes || '',
          visibility: c.visibility || 'private',
          activeChannels: mergedActiveChannels,
          organization_id: c.organization_id || undefined,
          is_team_member: c.is_team_member || false,
        });
      }
    }

    // 5. Phase 35: どのcontact_personsにもマッチしなかったsenderをauto生成エントリとして追加
    for (const sender of senders) {
      const addrKey = sender.from_address?.toLowerCase()?.trim() || '';
      const nameKey = (sender.from_name || '').trim().replace(/[\s　]+/g, ' ').toLowerCase();
      if ((addrKey && matchedSenderKeys.has(addrKey)) || (nameKey && matchedSenderKeys.has(nameKey))) continue;

      const key = addrKey || nameKey;
      if (!key) continue;

      const autoVisibility = sender.channel === 'email' ? 'private' : 'shared';
      contacts.push({
        id: `auto_${Buffer.from(key).toString('base64').slice(0, 20)}`,
        name: sender.from_name,
        address: sender.from_address,
        channels: [{ channel: sender.channel, address: sender.from_address, frequency: sender.count }],
        allChannels: sender.channels || [sender.channel],
        relationshipType: 'unknown',
        confidence: 0,
        confirmed: false,
        mainChannel: sender.channel,
        messageCount: sender.count,
        lastContactAt: sender.last_contact,
        isAutoGenerated: true,
        companyName: '',
        department: '',
        notes: '',
        visibility: autoVisibility,
        activeChannels: sender.active_channels || [],
      });
    }

    // Phase 29: ブロックリストのサーバーサイドフィルタ
    let filteredByBlock = contacts;
    try {
      const blocklist = await getBlocklist();
      if (blocklist.length > 0) {
        filteredByBlock = contacts.filter((c) => {
          const addr = (c.address || '').toLowerCase();
          const domain = addr.split('@')[1] || '';
          for (const entry of blocklist) {
            if (entry.match_type === 'exact' && addr === entry.address.toLowerCase()) return false;
            if (entry.match_type === 'domain' && domain === entry.address.toLowerCase()) return false;
          }
          return true;
        });
      }
    } catch {
      // ブロックリスト取得失敗時はフィルタなしで続行
    }

    // 4. フィルタリング
    let filtered = filteredByBlock;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q)
      );
    }
    if (relationship && relationship !== 'all') {
      filtered = filtered.filter((c) => c.relationshipType === relationship);
    }
    if (channel && channel !== 'all') {
      filtered = filtered.filter((c) => c.mainChannel === channel || c.allChannels.includes(channel));
    }

    // 5. 統計情報
    const stats = {
      total: contacts.length,
      byRelationship: {
        internal: contacts.filter((c) => c.relationshipType === 'internal').length,
        client: contacts.filter((c) => c.relationshipType === 'client').length,
        partner: contacts.filter((c) => c.relationshipType === 'partner').length,
        unknown: contacts.filter((c) => c.relationshipType === 'unknown').length,
      },
      byChannel: {
        email: contacts.filter((c) => c.mainChannel === 'email').length,
        slack: contacts.filter((c) => c.mainChannel === 'slack').length,
        chatwork: contacts.filter((c) => c.mainChannel === 'chatwork').length,
      },
      unconfirmedCount: contacts.filter((c) => !c.confirmed).length,
    };

    filtered.sort((a, b) => new Date(b.lastContactAt).getTime() - new Date(a.lastContactAt).getTime());

    return NextResponse.json({ success: true, data: filtered, stats });
  } catch (error) {
    console.error('[Contacts API] エラー:', error);
    return NextResponse.json({ success: false, error: 'コンタクトの取得に失敗しました' }, { status: 500 });
  }
}

// ========================================
// POST: コンタクト新規作成（Phase 53c: 秘書チャットのContactFormCardから呼ばれる）
// ========================================
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }
    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { id, name, company_name, department, relationship_type, email, phone } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: '名前は必須です' }, { status: 400 });
    }

    // contact_persons.id は TEXT型（自動生成なし）→ クライアントから渡されたIDを使うか手動生成
    const contactId = id || `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Phase 54: company_name + メールドメインから組織を自動検索・作成
    const emailDomain = email?.includes('@') ? email.toLowerCase().split('@')[1] : null;
    const autoOrganizationId = await findOrCreateOrganization(supabase, userId, company_name, emailDomain);

    // 1. コンタクト本体を作成
    const { error: contactError } = await supabase
      .from('contact_persons')
      .insert({
        id: contactId,
        name,
        company_name: company_name || null,
        department: department || null,
        relationship_type: relationship_type || 'unknown',
        confirmed: true,
        main_channel: email ? 'email' : 'other',
        visibility: 'shared',
        owner_user_id: userId,
        organization_id: autoOrganizationId,
      });

    if (contactError) {
      console.error('[Contacts API] POST contact error:', contactError);
      return NextResponse.json({ success: false, error: contactError.message }, { status: 500 });
    }

    // 2. チャネル（メール/電話）を登録
    const channels: { contact_id: string; channel: string; address: string }[] = [];
    if (email) {
      channels.push({ contact_id: contactId, channel: 'email', address: email });
    }
    if (phone) {
      channels.push({ contact_id: contactId, channel: 'phone', address: phone });
    }

    if (channels.length > 0) {
      const { error: channelError } = await supabase
        .from('contact_channels')
        .insert(channels);

      if (channelError) {
        console.error('[Contacts API] POST channel error:', channelError);
        return NextResponse.json({
          success: true,
          data: { id: contactId },
          warning: `コンタクトは作成しましたが、チャンネル登録に失敗しました: ${channelError.message}`,
        });
      }
    }

    return NextResponse.json({ success: true, data: { id: contactId } });
  } catch (error) {
    console.error('[Contacts API] POST Error:', error);
    return NextResponse.json({ success: false, error: 'コンタクトの作成に失敗しました' }, { status: 500 });
  }
}

// ========================================
// PUT: コンタクト情報を更新（コンテキストフィールド対応）
// ========================================
export async function PUT(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body = await request.json();
    const { id, name, relationshipType, confirmed, mainChannel, companyName, department, notes } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'IDが必要です' }, { status: 400 });
    }

    // 新規コンタクト登録（auto_ プレフィックスまたは team_ プレフィックス、または存在しないID）
    // 既存チェック
    let isNew = id.startsWith('auto_') || id.startsWith('team_');
    if (!isNew) {
      const { data: existing } = await supabase
        .from('contact_persons')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (!existing) isNew = true;
    }
    if (isNew) {
      const address = body.address || '';
      const channel = mainChannel || 'email';
      const newId = crypto.randomUUID();

      // Slack/Chatworkはshared、Emailはprivate
      const visibility = (channel === 'slack' || channel === 'chatwork') ? 'shared' : 'private';

      // Phase 54: company_name + メールドメインから組織を自動検索・作成
      const emailDomain = address?.includes('@') ? address.toLowerCase().split('@')[1] : null;
      const autoOrganizationId = body.organizationId || await findOrCreateOrganization(supabase, userId, companyName, emailDomain);

      const { error: insertError } = await supabase
        .from('contact_persons')
        .insert({
          id: newId,
          name: name || '',
          relationship_type: relationshipType || 'unknown',
          confidence: 1.0,
          confirmed: confirmed ?? true,
          main_channel: channel,
          message_count: body.messageCount || 0,
          last_contact_at: body.lastContactAt || new Date().toISOString(),
          company_name: companyName || null,
          department: department || null,
          notes: notes || null,
          visibility,
          owner_user_id: visibility === 'private' ? userId : null,
          organization_id: autoOrganizationId,
          is_team_member: body.isTeamMember || false,
        });

      if (insertError) {
        console.error('[Contacts API] 登録エラー:', insertError);
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
      }

      if (address) {
        await supabase.from('contact_channels').insert({
          contact_id: newId,
          channel,
          address,
          frequency: body.messageCount || 0,
        });
      }

      return NextResponse.json({ success: true, data: { id: newId } });
    }

    // 既存コンタクトの更新
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (relationshipType !== undefined) updateData.relationship_type = relationshipType;
    if (confirmed !== undefined) updateData.confirmed = confirmed;
    if (mainChannel !== undefined) updateData.main_channel = mainChannel;
    if (companyName !== undefined) updateData.company_name = companyName;
    if (department !== undefined) updateData.department = department;
    if (notes !== undefined) updateData.notes = notes;

    // Phase 54: company_name変更時に組織を自動リンク
    if (companyName !== undefined && companyName) {
      // 現在のコンタクト情報を取得してメールドメインを抽出
      const { data: currentContact } = await supabase
        .from('contact_persons')
        .select('organization_id, contact_channels(address, channel)')
        .eq('id', id)
        .single();

      if (currentContact && !currentContact.organization_id) {
        const emailChannel = ((currentContact.contact_channels || []) as { address: string; channel: string }[])
          .find((ch) => ch.channel === 'email' && ch.address?.includes('@'));
        const emailDomain = emailChannel ? emailChannel.address.toLowerCase().split('@')[1] : null;
        const orgId = await findOrCreateOrganization(supabase, userId, companyName, emailDomain);
        if (orgId) {
          updateData.organization_id = orgId;
        }
      }
    }

    const { error } = await supabase
      .from('contact_persons')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[Contacts API] 更新エラー:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Contacts API] エラー:', error);
    return NextResponse.json({ success: false, error: '更新に失敗しました' }, { status: 500 });
  }
}
