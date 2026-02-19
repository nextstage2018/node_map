// コンタクト情報サービス
// メッセージの送受信者を統合し、関係属性（自社/クライアント/パートナー）を管理
// メインチャネル自動判定、AI推定シミュレーション

import type {
  ContactPerson,
  PersonRelationshipType,
  ContactFilter,
  ContactStats,
  ChannelType,
} from '@/lib/types';

// ===== インメモリストア（本番はSupabase） =====
let contactsStore: ContactPerson[] = [];

// ===== デモデータ初期化 =====
function initDemoData(): void {
  if (contactsStore.length > 0) return;

  const now = new Date().toISOString();

  contactsStore = [
    // --- Email 経由 ---
    {
      id: 'contact-tanaka',
      name: '田中太郎',
      channels: [
        { channel: 'email', address: 'tanaka@example.com', frequency: 42 },
        { channel: 'slack', address: 'U_TANAKA', frequency: 18 },
      ],
      relationshipType: 'internal',
      confidence: 0.95,
      confirmed: true,
      mainChannel: 'email',
      associatedNodeIds: ['node-6', 't-node-8', 's-node-8'], // 各ユーザーの「田中」ノード
      messageCount: 60,
      lastContactAt: '2026-02-19T09:30:00Z',
      createdAt: '2026-01-15T09:00:00Z',
      updatedAt: now,
    },
    {
      id: 'contact-sato',
      name: '佐藤花子',
      channels: [
        { channel: 'email', address: 'sato@example.com', frequency: 28 },
      ],
      relationshipType: 'internal',
      confidence: 0.93,
      confirmed: true,
      mainChannel: 'email',
      associatedNodeIds: ['node-8', 't-node-9'],
      messageCount: 28,
      lastContactAt: '2026-02-18T14:00:00Z',
      createdAt: '2026-01-20T10:00:00Z',
      updatedAt: now,
    },
    {
      id: 'contact-suzuki',
      name: '鈴木一郎',
      channels: [
        { channel: 'email', address: 'suzuki@client.co.jp', frequency: 35 },
      ],
      relationshipType: 'client',
      confidence: 0.88,
      confirmed: true,
      mainChannel: 'email',
      associatedNodeIds: ['node-7', 't-node-8', 'y-node-8'],
      messageCount: 35,
      lastContactAt: '2026-02-19T11:00:00Z',
      createdAt: '2026-01-18T09:00:00Z',
      updatedAt: now,
    },

    // --- Slack 経由 ---
    {
      id: 'contact-yamada',
      name: '山田次郎',
      channels: [
        { channel: 'slack', address: 'U001', frequency: 22 },
      ],
      relationshipType: 'internal',
      confidence: 0.92,
      confirmed: true,
      mainChannel: 'slack',
      associatedNodeIds: [],
      messageCount: 22,
      lastContactAt: '2026-02-19T10:15:00Z',
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    {
      id: 'contact-ito',
      name: '伊藤美咲',
      channels: [
        { channel: 'slack', address: 'U003', frequency: 15 },
      ],
      relationshipType: 'internal',
      confidence: 0.90,
      confirmed: false,
      mainChannel: 'slack',
      associatedNodeIds: [],
      messageCount: 15,
      lastContactAt: '2026-02-17T16:45:00Z',
      createdAt: '2026-02-05T11:00:00Z',
      updatedAt: now,
    },

    // --- Chatwork 経由 ---
    {
      id: 'contact-nakamura',
      name: '中村四郎',
      channels: [
        { channel: 'chatwork', address: '4001', frequency: 18 },
      ],
      relationshipType: 'partner',
      confidence: 0.82,
      confirmed: false,
      mainChannel: 'chatwork',
      associatedNodeIds: [],
      messageCount: 18,
      lastContactAt: '2026-02-18T09:30:00Z',
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: now,
    },
    {
      id: 'contact-kobayashi',
      name: '小林五郎',
      channels: [
        { channel: 'chatwork', address: '4002', frequency: 12 },
      ],
      relationshipType: 'client',
      confidence: 0.78,
      confirmed: false,
      mainChannel: 'chatwork',
      associatedNodeIds: [],
      messageCount: 12,
      lastContactAt: '2026-02-16T11:00:00Z',
      createdAt: '2026-02-03T14:00:00Z',
      updatedAt: now,
    },
    {
      id: 'contact-watanabe',
      name: '渡辺六子',
      channels: [
        { channel: 'chatwork', address: '4003', frequency: 20 },
        { channel: 'email', address: 'watanabe@example.com', frequency: 5 },
      ],
      relationshipType: 'internal',
      confidence: 0.91,
      confirmed: true,
      mainChannel: 'chatwork',
      associatedNodeIds: [],
      messageCount: 25,
      lastContactAt: '2026-02-19T08:00:00Z',
      createdAt: '2026-01-25T09:00:00Z',
      updatedAt: now,
    },
  ];
}

// ===== サービスクラス =====

export class ContactPersonService {
  /**
   * コンタクト一覧を取得（フィルター対応）
   */
  static async getContacts(filter?: ContactFilter): Promise<ContactPerson[]> {
    initDemoData();
    let result = [...contactsStore];

    if (filter) {
      if (filter.relationshipType) {
        result = result.filter((c) => c.relationshipType === filter.relationshipType);
      }
      if (filter.channel) {
        result = result.filter((c) =>
          c.channels.some((ch) => ch.channel === filter.channel)
        );
      }
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        result = result.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.channels.some((ch) => ch.address.toLowerCase().includes(q))
        );
      }
    }

    // 通信回数降順
    return result.sort((a, b) => b.messageCount - a.messageCount);
  }

  /**
   * コンタクトをIDで取得
   */
  static async getContactById(id: string): Promise<ContactPerson | null> {
    initDemoData();
    return contactsStore.find((c) => c.id === id) || null;
  }

  /**
   * 関係属性を更新（ユーザー確認）
   */
  static async updateRelationship(
    id: string,
    relationshipType: PersonRelationshipType
  ): Promise<ContactPerson | null> {
    initDemoData();
    const contact = contactsStore.find((c) => c.id === id);
    if (!contact) return null;

    contact.relationshipType = relationshipType;
    contact.confirmed = true;
    contact.confidence = 1.0;
    contact.updatedAt = new Date().toISOString();
    return contact;
  }

  /**
   * メッセージ履歴からコンタクトを自動抽出（シミュレーション）
   * 本番ではメッセージDBを走査して from/to を集計
   */
  static async extractFromMessages(): Promise<{
    newContacts: number;
    updatedContacts: number;
  }> {
    initDemoData();
    // デモではすでにデータが入っているので、0件の差分を返す
    return { newContacts: 0, updatedContacts: 0 };
  }

  /**
   * メールアドレス/IDからドメインベースで関係属性を推定
   */
  static predictRelationship(
    address: string
  ): { type: PersonRelationshipType; confidence: number } {
    const lower = address.toLowerCase();

    // ドメインベース推定
    if (lower.includes('@example.com') || lower.includes('@example.co.jp')) {
      return { type: 'internal', confidence: 0.9 };
    }
    if (lower.includes('@client') || lower.includes('@customer')) {
      return { type: 'client', confidence: 0.85 };
    }
    if (lower.includes('@partner') || lower.includes('@agency')) {
      return { type: 'partner', confidence: 0.8 };
    }

    // Slack UID / Chatwork AIDの場合はワークスペース所属で判断
    if (/^U[0-9A-Z_]+$/.test(address)) {
      return { type: 'internal', confidence: 0.85 }; // 同一ワークスペースはinternal推定
    }
    if (/^[0-9]+$/.test(address)) {
      return { type: 'partner', confidence: 0.6 }; // Chatworkは外部の可能性
    }

    // 不明
    return { type: 'partner', confidence: 0.5 };
  }

  /**
   * コンタクト統計
   */
  static async getStats(): Promise<ContactStats> {
    initDemoData();

    return {
      total: contactsStore.length,
      byRelationship: {
        internal: contactsStore.filter((c) => c.relationshipType === 'internal').length,
        client: contactsStore.filter((c) => c.relationshipType === 'client').length,
        partner: contactsStore.filter((c) => c.relationshipType === 'partner').length,
      },
      byChannel: {
        email: contactsStore.filter((c) => c.channels.some((ch) => ch.channel === 'email')).length,
        slack: contactsStore.filter((c) => c.channels.some((ch) => ch.channel === 'slack')).length,
        chatwork: contactsStore.filter((c) => c.channels.some((ch) => ch.channel === 'chatwork')).length,
      },
      unconfirmedCount: contactsStore.filter((c) => !c.confirmed).length,
    };
  }

  /**
   * コンタクトIDでノードIDを取得（人物ノード↔コンタクト逆引き）
   */
  static async getContactByNodeId(nodeId: string): Promise<ContactPerson | null> {
    initDemoData();
    return contactsStore.find((c) => c.associatedNodeIds.includes(nodeId)) || null;
  }
}
