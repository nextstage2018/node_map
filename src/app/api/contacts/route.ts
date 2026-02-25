// Phase 26: コンタクトAPI — 共有化 + コンテキスト強化 + active_channels自動集計
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';
import { getBlocklist } from '@/services/inbox/inboxStorage.service';

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
      const { data: rawMessages } = await supabase
        .from('inbox_messages')
        .select('from_name, from_address, channel, timestamp, metadata')
        .neq('from_name', 'あなた')
        .neq('from_name', '')
        .order('timestamp', { ascending: false });

      if (rawMessages) {
        const senderMap = new Map<string, {
          from_name: string;
          from_address: string;
          channels: Set<string>;
          count: number;
          last_contact: string;
          channelNames: Map<string, string>; // key -> display name
        }>();

        for (const msg of rawMessages) {
          const key = msg.from_address?.toLowerCase() || msg.from_name;
          if (!key) continue;
          const meta = msg.metadata || {};
          const existing = senderMap.get(key);

          // チャネル名を抽出
          let channelKey = '';
          let channelDisplayName = '';
          if (msg.channel === 'slack' && meta.slackChannelName) {
            channelKey = `slack:${meta.slackChannel || meta.slackChannelName}`;
            channelDisplayName = meta.slackChannelName;
          } else if (msg.channel === 'chatwork' && meta.chatworkRoomName) {
            channelKey = `chatwork:${meta.chatworkRoomId || meta.chatworkRoomName}`;
            channelDisplayName = meta.chatworkRoomName;
          } else if (msg.channel === 'email') {
            channelKey = 'email:main';
            channelDisplayName = 'メール';
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
      }
    } else {
      senders = senderStats;
    }

    // 2. 既存のcontact_personsテーブルからデータ取得（新フィールド含む）
    // shared コンタクト + 自分の private コンタクトを取得
    const { data: existingContacts } = await supabase
      .from('contact_persons')
      .select('*, contact_channels(*)')
      .or(`visibility.eq.shared,visibility.is.null,owner_user_id.eq.${userId},owner_user_id.is.null`);

    const existingMap = new Map<string, typeof existingContacts extends (infer T)[] ? T : never>();
    if (existingContacts) {
      for (const c of existingContacts) {
        if (c.contact_channels && Array.isArray(c.contact_channels)) {
          for (const ch of c.contact_channels) {
            existingMap.set(ch.address?.toLowerCase() || '', c);
          }
        }
        existingMap.set(c.name?.toLowerCase() || '', c);
      }
    }

    // 3. 統合コンタクトリスト生成（コンテキストフィールド追加）
    const contacts = senders.map((sender) => {
      const key = sender.from_address?.toLowerCase() || sender.from_name?.toLowerCase();
      const existing = existingMap.get(key);

      // visibility自動判定: Slack/Chatworkはshared、Emailはprivate
      const autoVisibility = sender.channel === 'email' ? 'private' : 'shared';

      return {
        id: existing?.id || `auto_${Buffer.from(key).toString('base64').slice(0, 20)}`,
        name: existing?.name || sender.from_name,
        address: sender.from_address,
        channels: existing?.contact_channels || [{ channel: sender.channel, address: sender.from_address, frequency: sender.count }],
        allChannels: sender.channels || [sender.channel],
        relationshipType: existing?.relationship_type || 'unknown',
        confidence: existing?.confidence || 0,
        confirmed: existing?.confirmed || false,
        mainChannel: existing?.main_channel || sender.channel,
        messageCount: sender.count,
        lastContactAt: sender.last_contact,
        isAutoGenerated: !existing,
        // 新フィールド
        companyName: existing?.company_name || '',
        department: existing?.department || '',
        notes: existing?.notes || '',
        visibility: existing?.visibility || autoVisibility,
        activeChannels: sender.active_channels || [],
      };
    });

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

    // 自動生成コンタクトの場合、contact_personsに新規登録
    if (id.startsWith('auto_')) {
      const address = body.address || '';
      const channel = mainChannel || 'email';
      const newId = crypto.randomUUID();

      // Slack/Chatworkはshared、Emailはprivate
      const visibility = (channel === 'slack' || channel === 'chatwork') ? 'shared' : 'private';

      // Phase 30c: メールアドレスからorganization_idを自動マッチング
      let autoOrganizationId = body.organizationId || null;
      let autoRelationshipType = relationshipType || 'unknown';
      if (!autoOrganizationId && address && address.includes('@')) {
        const domain = address.toLowerCase().split('@')[1];
        if (domain) {
          const { data: orgMatch } = await supabase
            .from('organizations')
            .select('id')
            .eq('domain', domain)
            .eq('user_id', userId)
            .limit(1)
            .single();
          if (orgMatch) {
            autoOrganizationId = orgMatch.id;
            // ドメインマッチした場合、未分類なら自社メンバーに設定
            if (autoRelationshipType === 'unknown') {
              autoRelationshipType = 'internal';
            }
          }
        }
      }

      const { error: insertError } = await supabase
        .from('contact_persons')
        .insert({
          id: newId,
          name: name || '',
          relationship_type: autoRelationshipType,
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
