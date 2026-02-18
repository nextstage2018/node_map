// ノード（点）管理サービス
// ユーザーのノードの蓄積・頻出度カウント・理解度更新を担う

import {
  NodeData,
  NodeType,
  NodeSourceContext,
  NodeFilter,
  UnderstandingLevel,
  KeywordExtractionRequest,
  ExtractedKeyword,
} from '@/lib/types';
import { extractKeywords, assessUnderstandingLevel } from '@/services/ai/keywordExtractor.service';

// インメモリストア（本番はSupabase）
let nodesStore: NodeData[] = [];
let contextStore: (NodeSourceContext & { nodeId: string })[] = [];

// デモ用初期データ
function initDemoData(): void {
  if (nodesStore.length > 0) return;

  const now = new Date().toISOString();
  const userId = 'demo-user';

  const demoNodes: NodeData[] = [
    {
      id: 'node-1',
      label: 'マーケティング',
      type: 'keyword',
      userId,
      frequency: 12,
      understandingLevel: 'mastery',
      firstSeenAt: '2026-02-01T09:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-2',
      label: 'SEO対策',
      type: 'keyword',
      userId,
      frequency: 8,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-05T10:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-05T10:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-3',
      label: 'コンテンツ戦略',
      type: 'keyword',
      userId,
      frequency: 6,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-08T11:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-08T11:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-4',
      label: 'リスティング広告',
      type: 'keyword',
      userId,
      frequency: 4,
      understandingLevel: 'recognition',
      firstSeenAt: '2026-02-10T14:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-10T14:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-5',
      label: 'LTV分析',
      type: 'keyword',
      userId,
      frequency: 3,
      understandingLevel: 'recognition',
      firstSeenAt: '2026-02-12T09:30:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-12T09:30:00Z',
      updatedAt: now,
    },
    {
      id: 'node-6',
      label: '田中',
      type: 'person',
      userId,
      frequency: 15,
      understandingLevel: 'mastery',
      firstSeenAt: '2026-02-01T09:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-7',
      label: '鈴木',
      type: 'person',
      userId,
      frequency: 10,
      understandingLevel: 'mastery',
      firstSeenAt: '2026-02-02T10:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-02T10:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-8',
      label: '佐藤',
      type: 'person',
      userId,
      frequency: 5,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-05T11:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-05T11:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-9',
      label: 'WebリニューアルPJ',
      type: 'project',
      userId,
      frequency: 9,
      understandingLevel: 'mastery',
      firstSeenAt: '2026-02-01T09:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-10',
      label: '新規顧客獲得施策',
      type: 'project',
      userId,
      frequency: 7,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-03T14:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-03T14:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-11',
      label: 'ユーザーリサーチ',
      type: 'keyword',
      userId,
      frequency: 5,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-06T10:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-06T10:00:00Z',
      updatedAt: now,
    },
    {
      id: 'node-12',
      label: 'コンバージョン率',
      type: 'keyword',
      userId,
      frequency: 6,
      understandingLevel: 'understanding',
      firstSeenAt: '2026-02-07T15:00:00Z',
      lastSeenAt: now,
      sourceContexts: [],
      createdAt: '2026-02-07T15:00:00Z',
      updatedAt: now,
    },
  ];

  nodesStore = demoNodes;
}

// ===== CRUD操作 =====

export class NodeService {
  /**
   * ノード一覧を取得
   */
  static async getNodes(filter?: NodeFilter): Promise<NodeData[]> {
    initDemoData();
    let result = [...nodesStore];

    if (filter) {
      if (filter.userId) {
        result = result.filter((n) => n.userId === filter.userId);
      }
      if (filter.type) {
        result = result.filter((n) => n.type === filter.type);
      }
      if (filter.understandingLevel) {
        result = result.filter((n) => n.understandingLevel === filter.understandingLevel);
      }
      if (filter.minFrequency) {
        result = result.filter((n) => n.frequency >= filter.minFrequency!);
      }
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        result = result.filter((n) => n.label.toLowerCase().includes(q));
      }
    }

    // 頻出度降順で返す
    return result.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * ノードをIDで取得
   */
  static async getNodeById(id: string): Promise<NodeData | null> {
    initDemoData();
    return nodesStore.find((n) => n.id === id) || null;
  }

  /**
   * ノードを追加または更新（同一ラベル・タイプが存在すれば頻出度を加算）
   */
  static async upsertNode(
    label: string,
    type: NodeType,
    userId: string,
    context: NodeSourceContext
  ): Promise<NodeData> {
    initDemoData();
    const now = new Date().toISOString();

    // 既存ノードを検索
    const existing = nodesStore.find(
      (n) => n.label === label && n.type === type && n.userId === userId
    );

    if (existing) {
      // 頻出度を加算
      existing.frequency += 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.sourceContexts.push(context);

      // 理解度を再判定
      const allContexts = contextStore
        .filter((c) => c.nodeId === existing.id)
        .map((c) => ({ direction: c.direction, sourceType: c.sourceType }));
      allContexts.push({ direction: context.direction, sourceType: context.sourceType });
      existing.understandingLevel = assessUnderstandingLevel(allContexts);

      // コンテキスト記録
      contextStore.push({ ...context, nodeId: existing.id });

      return existing;
    }

    // 新規ノード作成
    const newNode: NodeData = {
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      label,
      type,
      userId,
      frequency: 1,
      understandingLevel: assessUnderstandingLevel([
        { direction: context.direction, sourceType: context.sourceType },
      ]),
      firstSeenAt: now,
      lastSeenAt: now,
      sourceContexts: [context],
      createdAt: now,
      updatedAt: now,
    };

    nodesStore.push(newNode);
    contextStore.push({ ...context, nodeId: newNode.id });

    return newNode;
  }

  /**
   * テキストからキーワードを抽出してノードに蓄積する
   */
  static async processText(request: KeywordExtractionRequest): Promise<NodeData[]> {
    const extraction = await extractKeywords(request);
    const upsertedNodes: NodeData[] = [];

    const context: NodeSourceContext = {
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      direction: request.direction,
      phase: request.phase,
      timestamp: new Date().toISOString(),
    };

    // キーワードをノードに蓄積
    for (const kw of extraction.keywords) {
      if (kw.confidence >= 0.5) {
        const node = await this.upsertNode(kw.label, 'keyword', request.userId, context);
        upsertedNodes.push(node);
      }
    }

    // 人名をノードに蓄積
    for (const person of extraction.persons) {
      if (person.confidence >= 0.5) {
        const node = await this.upsertNode(person.label, 'person', request.userId, context);
        upsertedNodes.push(node);
      }
    }

    // プロジェクト名をノードに蓄積
    for (const project of extraction.projects) {
      if (project.confidence >= 0.5) {
        const node = await this.upsertNode(project.label, 'project', request.userId, context);
        upsertedNodes.push(node);
      }
    }

    return upsertedNodes;
  }

  /**
   * ノード統計を取得
   */
  static async getStats(userId: string): Promise<{
    totalNodes: number;
    byType: Record<NodeType, number>;
    byLevel: Record<UnderstandingLevel, number>;
    topKeywords: NodeData[];
  }> {
    initDemoData();
    const userNodes = nodesStore.filter((n) => n.userId === userId);

    return {
      totalNodes: userNodes.length,
      byType: {
        keyword: userNodes.filter((n) => n.type === 'keyword').length,
        person: userNodes.filter((n) => n.type === 'person').length,
        project: userNodes.filter((n) => n.type === 'project').length,
      },
      byLevel: {
        recognition: userNodes.filter((n) => n.understandingLevel === 'recognition').length,
        understanding: userNodes.filter((n) => n.understandingLevel === 'understanding').length,
        mastery: userNodes.filter((n) => n.understandingLevel === 'mastery').length,
      },
      topKeywords: userNodes
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10),
    };
  }
}
