// v3.3: プロジェクトチャネルからメンバー自動検出 API
// project_channels → inbox_messages → 送信者を抽出 → contact_persons/project_members に追加
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

    // チャネルごとにメッセージから送信者を収集
    const senderMap = new Map<string, { address: string; name: string; channel: string }>();

    for (const ch of channels) {
      let messages: { from_address: string; from_name: string }[] = [];

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
        message: 'チャネルにメッセージがまだありません。メッセージ同期後に再実行してください。',
      });
    }

    const addressArray = Array.from(senderMap.keys());

    // 既存 contact_persons を検索（id直接一致 or contact_channels.address一致）
    const { data: contactsById } = await supabase
      .from('contact_persons')
      .select('id, name')
      .in('id', addressArray);

    const { data: channelMatches } = await supabase
      .from('contact_channels')
      .select('contact_id, address')
      .in('address', addressArray);

    // address → contact_id マッピング
    const addressToContactId = new Map<string, string>();
    if (contactsById) {
      for (const c of contactsById) {
        addressToContactId.set(c.id, c.id);
      }
    }
    if (channelMatches) {
      for (const ch of channelMatches) {
        if (!addressToContactId.has(ch.address)) {
          addressToContactId.set(ch.address, ch.contact_id);
        }
      }
    }

    // 既存 project_members を取得
    const { data: existingMembers } = await supabase
      .from('project_members')
      .select('contact_id')
      .eq('project_id', projectId);

    const existingContactIds = new Set((existingMembers || []).map(m => m.contact_id));

    let addedCount = 0;

    for (const [address, sender] of senderMap) {
      let contactId = addressToContactId.get(address);

      // コンタクトが存在しない場合は新規作成
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
            relationship_type: 'client',
            main_channel: mainChannel,
            confirmed: false,
          });

        if (!createErr) {
          contactId = newId;
          // contact_channels にも追加
          await supabase.from('contact_channels').insert({
            contact_id: newId,
            channel: mainChannel,
            address: address,
            user_id: userId,
          });
        }
      }

      if (!contactId || existingContactIds.has(contactId)) continue;

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
