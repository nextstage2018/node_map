// Phase 52: 未登録組織の自動検出 + レコメンドサービス
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface OrgCandidate {
  domain: string;
  suggestedName: string;
  contactCount: number;
  messageCount: number;
  contactIds: string[];
  channels: Array<{
    serviceName: string;
    channelId: string;
    channelName: string;
  }>;
  suggestedRelationship: 'client' | 'partner' | 'vendor' | 'prospect';
  confidence: number; // 0-1
}

export class OrgRecommendationService {
  /**
   * 未登録組織を検出してレコメンド候補を返す
   */
  static async detectUnregisteredOrgs(userId: string): Promise<OrgCandidate[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      // 1. 既存組織のドメイン一覧を取得
      const { data: existingOrgs } = await sb
        .from('organizations')
        .select('domain')
        .eq('user_id', userId)
        .not('domain', 'is', null);

      const registeredDomains = new Set(
        (existingOrgs || []).map(o => o.domain?.toLowerCase()).filter(Boolean)
      );

      // フリーメールドメイン（組織として登録すべきでない）
      const freeDomains = new Set([
        'gmail.com', 'yahoo.co.jp', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'outlook.jp', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
        'protonmail.com', 'zoho.com', 'mail.com', 'yandex.com',
        'docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'au.com',
        'i.softbank.jp', 'nifty.com', 'biglobe.ne.jp', 'ocn.ne.jp',
      ]);

      // 2. 受信メッセージのfrom_addressからドメインを抽出・集計
      const { data: messages } = await sb
        .from('inbox_messages')
        .select('from_address, from_name, channel, metadata')
        .eq('direction', 'received')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!messages || messages.length === 0) return [];

      // ドメイン別にメッセージを集約
      const domainMap: Record<string, {
        addresses: Set<string>;
        names: string[];
        count: number;
        channels: Map<string, { serviceName: string; channelId: string; channelName: string }>;
      }> = {};

      for (const msg of messages) {
        const addr = msg.from_address || '';
        let domain = '';

        if (msg.channel === 'email' && addr.includes('@')) {
          domain = addr.split('@')[1]?.toLowerCase() || '';
        } else {
          // Slack/Chatworkの場合はメタデータからチャネル情報を取得（ドメインベースではない）
          continue; // メールドメインベースの組織検出に限定
        }

        if (!domain || freeDomains.has(domain) || registeredDomains.has(domain)) continue;

        if (!domainMap[domain]) {
          domainMap[domain] = { addresses: new Set(), names: [], count: 0, channels: new Map() };
        }
        domainMap[domain].addresses.add(addr);
        if (msg.from_name) domainMap[domain].names.push(msg.from_name);
        domainMap[domain].count++;

        // メールチャネル情報を追加
        const chKey = `email:${domain}`;
        if (!domainMap[domain].channels.has(chKey)) {
          domainMap[domain].channels.set(chKey, {
            serviceName: 'email',
            channelId: domain,
            channelName: domain,
          });
        }
      }

      // 3. 各ドメインのコンタクト情報を取得
      const candidates: OrgCandidate[] = [];

      for (const [domain, info] of Object.entries(domainMap)) {
        // メッセージが少なすぎるドメインはスキップ（ノイズ除去）
        if (info.count < 2) continue;

        // コンタクト検索（このドメインに属するcontact_channels.address）
        const addresses = Array.from(info.addresses);
        const { data: channelData } = await sb
          .from('contact_channels')
          .select('contact_id, address')
          .in('address', addresses);

        const contactIds = [...new Set((channelData || []).map(c => c.contact_id))];

        // コンタクトのcompany_nameから組織名を推定
        let suggestedName = '';
        if (contactIds.length > 0) {
          const { data: contacts } = await sb
            .from('contact_persons')
            .select('company_name')
            .in('id', contactIds)
            .not('company_name', 'is', null);

          if (contacts && contacts.length > 0) {
            // 最頻の会社名を採用
            const nameCounts: Record<string, number> = {};
            for (const c of contacts) {
              const name = c.company_name?.trim();
              if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
            }
            const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) suggestedName = sorted[0][0];
          }
        }

        // 会社名がまだ不明な場合、ドメインから推定
        if (!suggestedName) {
          suggestedName = this.guessNameFromDomain(domain);
        }

        // Slack/Chatworkチャネルの追加検出
        // inbox_messagesのmetadataから、このドメインのコンタクトが使っているチャネルを検出
        if (contactIds.length > 0) {
          const { data: slackMsgs } = await sb
            .from('inbox_messages')
            .select('metadata')
            .eq('channel', 'slack')
            .in('from_address', addresses)
            .limit(5);

          if (slackMsgs) {
            for (const m of slackMsgs) {
              const meta = m.metadata as Record<string, string> | null;
              if (meta?.slackChannel) {
                const chKey = `slack:${meta.slackChannel}`;
                if (!info.channels.has(chKey)) {
                  info.channels.set(chKey, {
                    serviceName: 'slack',
                    channelId: meta.slackChannel,
                    channelName: meta.slackChannelName || meta.slackChannel,
                  });
                }
              }
            }
          }

          const { data: cwMsgs } = await sb
            .from('inbox_messages')
            .select('metadata')
            .eq('channel', 'chatwork')
            .in('from_address', addresses)
            .limit(5);

          if (cwMsgs) {
            for (const m of cwMsgs) {
              const meta = m.metadata as Record<string, string> | null;
              if (meta?.chatworkRoomId) {
                const chKey = `chatwork:${meta.chatworkRoomId}`;
                if (!info.channels.has(chKey)) {
                  info.channels.set(chKey, {
                    serviceName: 'chatwork',
                    channelId: meta.chatworkRoomId,
                    channelName: meta.chatworkRoomName || meta.chatworkRoomId,
                  });
                }
              }
            }
          }
        }

        // 関係性の推定（送受信比率から判断）
        const suggestedRelationship = this.guessRelationship(info.count, contactIds.length);

        // 信頼度の計算
        const confidence = Math.min(1,
          (suggestedName ? 0.4 : 0) +
          (contactIds.length >= 2 ? 0.2 : contactIds.length >= 1 ? 0.1 : 0) +
          (info.count >= 10 ? 0.3 : info.count >= 5 ? 0.2 : 0.1) +
          (info.channels.size >= 2 ? 0.1 : 0)
        );

        candidates.push({
          domain,
          suggestedName,
          contactCount: contactIds.length || info.addresses.size,
          messageCount: info.count,
          contactIds,
          channels: Array.from(info.channels.values()),
          suggestedRelationship,
          confidence,
        });
      }

      // 信頼度＋メッセージ数で降順ソート
      return candidates
        .sort((a, b) => (b.confidence * 100 + b.messageCount) - (a.confidence * 100 + a.messageCount))
        .slice(0, 10);
    } catch (error) {
      console.error('[OrgRecommendation] detectUnregisteredOrgs エラー:', error);
      return [];
    }
  }

  /**
   * ドメインから組織名を推測
   */
  private static guessNameFromDomain(domain: string): string {
    // example.co.jp → Example
    const parts = domain.split('.');
    const name = parts[0] || domain;
    // キャメルケース化
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * 関係性を推定
   */
  private static guessRelationship(
    messageCount: number,
    contactCount: number,
  ): OrgCandidate['suggestedRelationship'] {
    // メッセージ数とコンタクト数から推定
    if (messageCount >= 10 && contactCount >= 2) return 'client';
    if (messageCount >= 5) return 'client';
    if (contactCount >= 2) return 'partner';
    return 'prospect';
  }
}
