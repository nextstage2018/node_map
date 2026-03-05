// Phase 36: コンタクトプロフィール自動取得API
import { NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

interface EnrichDetail {
  id: string;
  name: string;
  channel: string;
  updated: string[];
}

async function getSlackUserProfile(slackUserId: string, token: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok && data.user) {
      const profile = data.user.profile || {};
      return {
        real_name: profile.real_name_normalized || profile.real_name || data.user.real_name || '',
        title: profile.title || '',
        display_name: profile.display_name || '',
        image_url: profile.image_192 || profile.image_72 || '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function getChatworkContacts(token: string): Promise<Map<string, { name: string; organization: string }>> {
  const map = new Map<string, { name: string; organization: string }>();
  try {
    const res = await fetch('https://api.chatwork.com/v2/contacts', {
      headers: { 'X-ChatworkToken': token },
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const contact of data) {
        map.set(String(contact.account_id), {
          name: contact.name || '',
          organization: contact.organization_name || '',
        });
      }
    }
  } catch { /* ignore */ }
  return map;
}

export async function POST() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const slackToken = process.env.SLACK_BOT_TOKEN || '';
    const chatworkToken = process.env.CHATWORK_API_TOKEN || '';

    if (!slackToken && !chatworkToken) {
      return NextResponse.json({
        success: true,
        enriched: 0,
        slackProfilesFound: 0,
        chatworkProfilesFound: 0,
        details: [],
        message: 'Slack/Chatwork のトークンが未設定のため、自動取得をスキップしました',
      });
    }

    // 全コンタクトとチャンネルを取得
    const { data: contacts } = await supabase
      .from('contact_persons')
      .select('id, name, department, company_name, contact_channels(channel, address)');

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, enriched: 0, slackProfilesFound: 0, chatworkProfilesFound: 0, details: [] });
    }

    // Chatwork連絡先を一括取得（API呼び出し回数削減）
    let chatworkContacts = new Map<string, { name: string; organization: string }>();
    if (chatworkToken) {
      chatworkContacts = await getChatworkContacts(chatworkToken);
    }

    const details: EnrichDetail[] = [];
    let slackProfilesFound = 0;
    let chatworkProfilesFound = 0;

    for (const contact of contacts) {
      const channels = (contact.contact_channels || []) as Array<{ channel: string; address: string }>;
      const updateData: Record<string, string> = {};
      const updatedFields: string[] = [];

      for (const ch of channels) {
        // Slack プロフィール取得
        if (ch.channel === 'slack' && slackToken && ch.address) {
          const profile = await getSlackUserProfile(ch.address, slackToken);
          if (profile) {
            slackProfilesFound++;
            if (profile.real_name && !contact.name) {
              updateData.name = profile.real_name;
              updatedFields.push('name');
            }
            if (profile.title && !contact.department) {
              updateData.department = profile.title;
              updatedFields.push('department');
            }
          }
        }

        // Chatwork プロフィール取得
        if (ch.channel === 'chatwork' && chatworkToken && ch.address) {
          const cwProfile = chatworkContacts.get(ch.address);
          if (cwProfile) {
            chatworkProfilesFound++;
            if (cwProfile.name && !contact.name) {
              updateData.name = cwProfile.name;
              updatedFields.push('name');
            }
            if (cwProfile.organization && !contact.company_name) {
              updateData.company_name = cwProfile.organization;
              updatedFields.push('company_name');
            }
          }
        }
      }

      // 更新があればDBに反映
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('contact_persons')
          .update(updateData)
          .eq('id', contact.id);

        if (!error) {
          details.push({
            id: contact.id,
            name: updateData.name || contact.name || '',
            channel: channels[0]?.channel || 'unknown',
            updated: updatedFields,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      enriched: details.length,
      slackProfilesFound,
      chatworkProfilesFound,
      details,
    });
  } catch (error) {
    console.error('[Enrich API] Error:', error);
    return NextResponse.json({ success: false, error: 'プロフィール取得に失敗しました' }, { status: 500 });
  }
}
