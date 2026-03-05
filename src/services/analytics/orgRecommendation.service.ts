// Phase 52 + Phase 60: 未登録組織の自動検出 + レコメンドサービス
// メール（ドメイン）/ Slack・Chatwork（チャネル）/ 会社名 の3方式で検出
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface OrgCandidate {
  domain: string; // メールドメイン or チャネルキー（例: slack:C12345）or company:会社名
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
  source: 'email' | 'slack' | 'chatwork' | 'company_name'; // 検出元
}

// フリーメールドメイン（組織として登録すべきでない）
const FREE_DOMAINS = new Set([
  'gmail.com', 'yahoo.co.jp', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'outlook.jp', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'protonmail.com', 'zoho.com', 'mail.com', 'yandex.com',
  'docomo.ne.jp', 'ezweb.ne.jp', 'softbank.ne.jp', 'au.com',
  'i.softbank.jp', 'nifty.com', 'biglobe.ne.jp', 'ocn.ne.jp',
]);

export class OrgRecommendationService {
  /**
   * 未登録組織を検出してレコメンド候補を返す（全チャネル対応）
   */
  static async detectUnregisteredOrgs(userId: string): Promise<OrgCandidate[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      // 1. 既存組織情報を取得
      const { data: existingOrgs } = await sb
        .from('organizations')
        .select('id, name, domain')
        .eq('user_id', userId);

      const registeredDomains = new Set(
        (existingOrgs || []).map(o => o.domain?.toLowerCase()).filter(Boolean)
      );
      const registeredOrgNames = new Set(
        (existingOrgs || []).map(o => o.name?.toLowerCase()).filter(Boolean)
      );
      // 既に組織に所属しているコンタクトのIDを取得
      const { data: orgContacts } = await sb
        .from('contact_persons')
        .select('id')
        .not('organization_id', 'is', null);
      const orgContactIds = new Set((orgContacts || []).map(c => c.id));

      // 2. 全チャネルのメッセージを取得
      const { data: messages } = await sb
        .from('inbox_messages')
        .select('from_address, from_name, channel, metadata')
        .eq('direction', 'received')
        .order('created_at', { ascending: false })
        .limit(500);

      // 3つの検出方式を並行実行
      const [emailCandidates, channelCandidates, companyNameCandidates] = await Promise.all([
        this.detectFromEmail(sb, messages || [], registeredDomains),
        this.detectFromChannels(sb, messages || [], registeredOrgNames, orgContactIds),
        this.detectFromCompanyName(sb, userId, registeredOrgNames, orgContactIds),
      ]);

      // 4. 統合・重複排除・ソート
      const allCandidates = [...emailCandidates, ...channelCandidates, ...companyNameCandidates];

      // suggestedNameの重複排除（同じ組織名の候補は信頼度が高い方を採用）
      const nameMap = new Map<string, OrgCandidate>();
      for (const c of allCandidates) {
        const key = c.suggestedName.toLowerCase();
        const existing = nameMap.get(key);
        if (!existing || c.confidence > existing.confidence) {
          // 既存候補とマージ（コンタクトID・チャネルを統合）
          if (existing) {
            c.contactIds = [...new Set([...c.contactIds, ...existing.contactIds])];
            c.contactCount = c.contactIds.length;
            c.messageCount = Math.max(c.messageCount, existing.messageCount);
            const existingChKeys = new Set(existing.channels.map(ch => `${ch.serviceName}:${ch.channelId}`));
            for (const ch of existing.channels) {
              if (!c.channels.some(ec => `${ec.serviceName}:${ec.channelId}` === `${ch.serviceName}:${ch.channelId}`)) {
                c.channels.push(ch);
              }
            }
          }
          nameMap.set(key, c);
        } else if (existing) {
          // 信頼度が低い方のデータもマージ
          existing.contactIds = [...new Set([...existing.contactIds, ...c.contactIds])];
          existing.contactCount = existing.contactIds.length;
          existing.messageCount = Math.max(existing.messageCount, c.messageCount);
          for (const ch of c.channels) {
            if (!existing.channels.some(ec => `${ec.serviceName}:${ec.channelId}` === `${ch.serviceName}:${ch.channelId}`)) {
              existing.channels.push(ch);
            }
          }
        }
      }

      return Array.from(nameMap.values())
        .sort((a, b) => (b.confidence * 100 + b.messageCount) - (a.confidence * 100 + a.messageCount))
        .slice(0, 15);
    } catch (error) {
      console.error('[OrgRecommendation] detectUnregisteredOrgs エラー:', error);
      return [];
    }
  }

  /**
   * 方式1: メールドメインから組織を検出（既存ロジック）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async detectFromEmail(sb: any, messages: any[], registeredDomains: Set<string>): Promise<OrgCandidate[]> {
    const domainMap: Record<string, {
      addresses: Set<string>;
      names: string[];
      count: number;
    }> = {};

    for (const msg of messages) {
      const addr = msg.from_address || '';
      if (msg.channel !== 'email' || !addr.includes('@')) continue;

      const domain = addr.split('@')[1]?.toLowerCase() || '';
      if (!domain || FREE_DOMAINS.has(domain) || registeredDomains.has(domain)) continue;

      if (!domainMap[domain]) {
        domainMap[domain] = { addresses: new Set(), names: [], count: 0 };
      }
      domainMap[domain].addresses.add(addr);
      if (msg.from_name) domainMap[domain].names.push(msg.from_name);
      domainMap[domain].count++;
    }

    const candidates: OrgCandidate[] = [];

    for (const [domain, info] of Object.entries(domainMap)) {
      if (info.count < 2) continue;

      const addresses = Array.from(info.addresses);
      const { data: channelData } = await sb
        .from('contact_channels')
        .select('contact_id')
        .in('address', addresses);

      const contactIds = [...new Set((channelData || []).map((c: { contact_id: string }) => c.contact_id))];

      let suggestedName = '';
      if (contactIds.length > 0) {
        const { data: contacts } = await sb
          .from('contact_persons')
          .select('company_name')
          .in('id', contactIds)
          .not('company_name', 'is', null);

        if (contacts && contacts.length > 0) {
          const nameCounts: Record<string, number> = {};
          for (const c of contacts) {
            const name = c.company_name?.trim();
            if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
          }
          const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) suggestedName = sorted[0][0];
        }
      }

      if (!suggestedName) {
        suggestedName = this.guessNameFromDomain(domain);
      }

      const confidence = Math.min(1,
        (suggestedName && suggestedName !== this.guessNameFromDomain(domain) ? 0.4 : 0.1) +
        (contactIds.length >= 2 ? 0.2 : contactIds.length >= 1 ? 0.1 : 0) +
        (info.count >= 10 ? 0.3 : info.count >= 5 ? 0.2 : 0.1)
      );

      candidates.push({
        domain,
        suggestedName,
        contactCount: contactIds.length || info.addresses.size,
        messageCount: info.count,
        contactIds,
        channels: [{ serviceName: 'email', channelId: domain, channelName: domain }],
        suggestedRelationship: this.guessRelationship(info.count, contactIds.length),
        confidence,
        source: 'email',
      });
    }

    return candidates;
  }

  /**
   * 方式2: Slack/Chatworkチャネルから組織を検出
   * 同じチャネル/ルームで複数のコンタクトがやり取り → 組織候補
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async detectFromChannels(sb: any, messages: any[], registeredOrgNames: Set<string>, orgContactIds: Set<string>): Promise<OrgCandidate[]> {
    // チャネル別にコンタクト（from_address）を集約
    const channelMap: Record<string, {
      serviceName: string;
      channelId: string;
      channelName: string;
      addresses: Set<string>;
      names: string[];
      count: number;
    }> = {};

    for (const msg of messages) {
      const meta = msg.metadata as Record<string, string> | null;
      let channelKey = '';
      let serviceName = '';
      let channelId = '';
      let channelName = '';

      if (msg.channel === 'slack' && meta?.slackChannel) {
        channelKey = `slack:${meta.slackChannel}`;
        serviceName = 'slack';
        channelId = meta.slackChannel;
        channelName = meta.slackChannelName || meta.slackChannel;
      } else if (msg.channel === 'chatwork' && meta?.chatworkRoomId) {
        channelKey = `chatwork:${meta.chatworkRoomId}`;
        serviceName = 'chatwork';
        channelId = meta.chatworkRoomId;
        channelName = meta.chatworkRoomName || meta.chatworkRoomId;
      } else {
        continue;
      }

      if (!channelMap[channelKey]) {
        channelMap[channelKey] = { serviceName, channelId, channelName, addresses: new Set(), names: [], count: 0 };
      }
      if (msg.from_address) channelMap[channelKey].addresses.add(msg.from_address);
      if (msg.from_name) channelMap[channelKey].names.push(msg.from_name);
      channelMap[channelKey].count++;
    }

    const candidates: OrgCandidate[] = [];

    for (const [channelKey, info] of Object.entries(channelMap)) {
      // コンタクトが2人以上いるチャネルのみ対象
      if (info.addresses.size < 2 || info.count < 3) continue;

      // コンタクト検索
      const addresses = Array.from(info.addresses);
      const { data: channelData } = await sb
        .from('contact_channels')
        .select('contact_id')
        .in('address', addresses);

      let contactIds = [...new Set((channelData || []).map((c: { contact_id: string }) => c.contact_id))];
      // 既に組織所属のコンタクトを除外
      contactIds = contactIds.filter(id => !orgContactIds.has(id));

      if (contactIds.length < 1) continue;

      // 会社名の推定
      let suggestedName = '';
      if (contactIds.length > 0) {
        const { data: contacts } = await sb
          .from('contact_persons')
          .select('company_name')
          .in('id', contactIds)
          .not('company_name', 'is', null);

        if (contacts && contacts.length > 0) {
          const nameCounts: Record<string, number> = {};
          for (const c of contacts) {
            const name = c.company_name?.trim();
            if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
          }
          const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) suggestedName = sorted[0][0];
        }
      }

      // 会社名が不明な場合、チャネル名から推定
      if (!suggestedName) {
        suggestedName = info.channelName || channelKey;
      }

      // 既に登録済みの組織名ならスキップ
      if (registeredOrgNames.has(suggestedName.toLowerCase())) continue;

      const confidence = Math.min(1,
        (suggestedName ? 0.3 : 0) +
        (contactIds.length >= 3 ? 0.3 : contactIds.length >= 2 ? 0.2 : 0.1) +
        (info.count >= 10 ? 0.2 : info.count >= 5 ? 0.1 : 0.05) +
        0.1 // チャネルベースは一定の信頼度付与
      );

      candidates.push({
        domain: channelKey,
        suggestedName,
        contactCount: contactIds.length,
        messageCount: info.count,
        contactIds,
        channels: [{ serviceName: info.serviceName, channelId: info.channelId, channelName: info.channelName }],
        suggestedRelationship: this.guessRelationship(info.count, contactIds.length),
        confidence,
        source: info.serviceName as 'slack' | 'chatwork',
      });
    }

    return candidates;
  }

  /**
   * 方式3: コンタクトの会社名から組織を検出
   * company_nameが設定済みだがorganization_id未設定のコンタクトをグルーピング
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async detectFromCompanyName(sb: any, userId: string, registeredOrgNames: Set<string>, orgContactIds: Set<string>): Promise<OrgCandidate[]> {
    // organization_id が NULL で company_name があるコンタクトを取得
    const { data: unlinkedContacts } = await sb
      .from('contact_persons')
      .select('id, name, company_name, main_channel')
      .is('organization_id', null)
      .not('company_name', 'is', null)
      .not('company_name', 'eq', '');

    if (!unlinkedContacts || unlinkedContacts.length === 0) return [];

    // 会社名でグルーピング
    const companyMap: Record<string, {
      contactIds: string[];
      names: string[];
      channels: Set<string>;
    }> = {};

    for (const c of unlinkedContacts) {
      const companyName = c.company_name?.trim();
      if (!companyName) continue;
      // 既登録組織名はスキップ
      if (registeredOrgNames.has(companyName.toLowerCase())) continue;
      // 既に組織所属のコンタクトはスキップ
      if (orgContactIds.has(c.id)) continue;

      if (!companyMap[companyName]) {
        companyMap[companyName] = { contactIds: [], names: [], channels: new Set() };
      }
      companyMap[companyName].contactIds.push(c.id);
      if (c.name) companyMap[companyName].names.push(c.name);
      if (c.main_channel) companyMap[companyName].channels.add(c.main_channel);
    }

    const candidates: OrgCandidate[] = [];

    for (const [companyName, info] of Object.entries(companyMap)) {
      // 1人以上あれば候補にする（会社名が明示的に設定されているため信頼度は高い）
      if (info.contactIds.length < 1) continue;

      // メッセージ数を取得
      const { data: msgCount } = await sb
        .from('inbox_messages')
        .select('id', { count: 'exact', head: true })
        .in('from_name', info.names)
        .eq('direction', 'received');

      const messageCount = msgCount?.length || 0;

      // メールドメインの推定（コンタクトのチャネルから）
      const { data: contactChannels } = await sb
        .from('contact_channels')
        .select('address, channel')
        .in('contact_id', info.contactIds)
        .eq('channel', 'email');

      let emailDomain = '';
      const channelsList: OrgCandidate['channels'] = [];

      if (contactChannels && contactChannels.length > 0) {
        // メールアドレスからドメイン抽出
        for (const cc of contactChannels) {
          if (cc.address?.includes('@')) {
            const d = cc.address.split('@')[1]?.toLowerCase();
            if (d && !FREE_DOMAINS.has(d)) {
              emailDomain = d;
              break;
            }
          }
        }
        if (emailDomain) {
          channelsList.push({ serviceName: 'email', channelId: emailDomain, channelName: emailDomain });
        }
      }

      const confidence = Math.min(1,
        0.5 + // 会社名が明示的→ 高い基本信頼度
        (info.contactIds.length >= 3 ? 0.2 : info.contactIds.length >= 2 ? 0.15 : 0.05) +
        (emailDomain ? 0.1 : 0) +
        (messageCount >= 5 ? 0.1 : 0)
      );

      candidates.push({
        domain: emailDomain || `company:${companyName}`,
        suggestedName: companyName,
        contactCount: info.contactIds.length,
        messageCount: messageCount,
        contactIds: info.contactIds,
        channels: channelsList,
        suggestedRelationship: this.guessRelationship(messageCount, info.contactIds.length),
        confidence,
        source: 'company_name',
      });
    }

    return candidates;
  }

  /**
   * ドメインから組織名を推測
   */
  private static guessNameFromDomain(domain: string): string {
    const parts = domain.split('.');
    const name = parts[0] || domain;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * 関係性を推定
   */
  private static guessRelationship(
    messageCount: number,
    contactCount: number,
  ): OrgCandidate['suggestedRelationship'] {
    if (messageCount >= 10 && contactCount >= 2) return 'client';
    if (messageCount >= 5) return 'client';
    if (contactCount >= 2) return 'partner';
    return 'prospect';
  }
}
