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

// ヘルパー：ノード生成
function makeNode(
  id: string, label: string, type: NodeType, userId: string,
  frequency: number, level: 'recognition' | 'understanding' | 'mastery',
  firstSeen: string
): NodeData {
  const now = new Date().toISOString();
  return {
    id, label, type, userId, frequency,
    understandingLevel: level,
    firstSeenAt: firstSeen, lastSeenAt: now,
    sourceContexts: [],
    createdAt: firstSeen, updatedAt: now,
  };
}

// デモ用初期データ
function initDemoData(): void {
  if (nodesStore.length > 0) return;

  // ===== user_self（自分）のノード =====
  const selfNodes: NodeData[] = [
    makeNode('node-1', 'マーケティング', 'keyword', 'user_self', 12, 'mastery', '2026-02-01T09:00:00Z'),
    makeNode('node-2', 'SEO対策', 'keyword', 'user_self', 8, 'understanding', '2026-02-05T10:00:00Z'),
    makeNode('node-3', 'コンテンツ戦略', 'keyword', 'user_self', 6, 'understanding', '2026-02-08T11:00:00Z'),
    makeNode('node-4', 'リスティング広告', 'keyword', 'user_self', 4, 'recognition', '2026-02-10T14:00:00Z'),
    makeNode('node-5', 'LTV分析', 'keyword', 'user_self', 3, 'recognition', '2026-02-12T09:30:00Z'),
    makeNode('node-6', '田中', 'person', 'user_self', 15, 'mastery', '2026-02-01T09:00:00Z'),
    makeNode('node-7', '鈴木', 'person', 'user_self', 10, 'mastery', '2026-02-02T10:00:00Z'),
    makeNode('node-8', '佐藤', 'person', 'user_self', 5, 'understanding', '2026-02-05T11:00:00Z'),
    makeNode('node-9', 'WebリニューアルPJ', 'project', 'user_self', 9, 'mastery', '2026-02-01T09:00:00Z'),
    makeNode('node-10', '新規顧客獲得施策', 'project', 'user_self', 7, 'understanding', '2026-02-03T14:00:00Z'),
    makeNode('node-11', 'ユーザーリサーチ', 'keyword', 'user_self', 5, 'understanding', '2026-02-06T10:00:00Z'),
    makeNode('node-12', 'コンバージョン率', 'keyword', 'user_self', 6, 'understanding', '2026-02-07T15:00:00Z'),
    makeNode('node-13', 'ブランディング', 'keyword', 'user_self', 3, 'recognition', '2026-02-14T10:00:00Z'),
    makeNode('node-14', 'SNS運用', 'keyword', 'user_self', 4, 'recognition', '2026-02-15T11:00:00Z'),
  ];

  // ===== user_tanaka（田中部長）のノード =====
  const tanakaNodes: NodeData[] = [
    makeNode('t-node-1', '経営戦略', 'keyword', 'user_tanaka', 20, 'mastery', '2026-01-15T09:00:00Z'),
    makeNode('t-node-2', 'マーケティング', 'keyword', 'user_tanaka', 15, 'mastery', '2026-01-20T10:00:00Z'),
    makeNode('t-node-3', 'KPI設計', 'keyword', 'user_tanaka', 12, 'mastery', '2026-01-22T11:00:00Z'),
    makeNode('t-node-4', '予算管理', 'keyword', 'user_tanaka', 10, 'mastery', '2026-01-25T14:00:00Z'),
    makeNode('t-node-5', 'SEO対策', 'keyword', 'user_tanaka', 6, 'understanding', '2026-02-01T09:00:00Z'),
    makeNode('t-node-6', 'コンバージョン率', 'keyword', 'user_tanaka', 8, 'understanding', '2026-02-03T10:00:00Z'),
    makeNode('t-node-7', 'LTV分析', 'keyword', 'user_tanaka', 7, 'understanding', '2026-02-05T11:00:00Z'),
    makeNode('t-node-8', '鈴木', 'person', 'user_tanaka', 12, 'mastery', '2026-01-15T09:00:00Z'),
    makeNode('t-node-9', '佐藤', 'person', 'user_tanaka', 8, 'mastery', '2026-01-20T10:00:00Z'),
    makeNode('t-node-10', 'WebリニューアルPJ', 'project', 'user_tanaka', 14, 'mastery', '2026-01-15T09:00:00Z'),
    makeNode('t-node-11', '新規顧客獲得施策', 'project', 'user_tanaka', 11, 'mastery', '2026-01-25T14:00:00Z'),
    makeNode('t-node-12', '競合分析', 'keyword', 'user_tanaka', 9, 'mastery', '2026-01-28T09:00:00Z'),
    makeNode('t-node-13', 'ROI', 'keyword', 'user_tanaka', 11, 'mastery', '2026-01-18T10:00:00Z'),
  ];

  // ===== user_sato（佐藤さん）のノード =====
  const satoNodes: NodeData[] = [
    makeNode('s-node-1', 'デザイン', 'keyword', 'user_sato', 14, 'mastery', '2026-01-20T09:00:00Z'),
    makeNode('s-node-2', 'UI/UX', 'keyword', 'user_sato', 12, 'mastery', '2026-01-22T10:00:00Z'),
    makeNode('s-node-3', 'プロトタイプ', 'keyword', 'user_sato', 8, 'understanding', '2026-02-01T11:00:00Z'),
    makeNode('s-node-4', 'ユーザーリサーチ', 'keyword', 'user_sato', 10, 'mastery', '2026-01-25T14:00:00Z'),
    makeNode('s-node-5', 'コンバージョン率', 'keyword', 'user_sato', 4, 'recognition', '2026-02-10T09:00:00Z'),
    makeNode('s-node-6', 'WebリニューアルPJ', 'project', 'user_sato', 11, 'mastery', '2026-01-20T09:00:00Z'),
    makeNode('s-node-7', 'フィグマ', 'keyword', 'user_sato', 9, 'mastery', '2026-01-20T09:00:00Z'),
    makeNode('s-node-8', '田中', 'person', 'user_sato', 7, 'understanding', '2026-02-01T10:00:00Z'),
    makeNode('s-node-9', 'アクセシビリティ', 'keyword', 'user_sato', 5, 'understanding', '2026-02-05T11:00:00Z'),
  ];

  // ===== user_yamada（山田さん）のノード =====
  const yamadaNodes: NodeData[] = [
    makeNode('y-node-1', 'バックエンド', 'keyword', 'user_yamada', 16, 'mastery', '2026-01-18T09:00:00Z'),
    makeNode('y-node-2', 'API設計', 'keyword', 'user_yamada', 12, 'mastery', '2026-01-20T10:00:00Z'),
    makeNode('y-node-3', 'データベース', 'keyword', 'user_yamada', 10, 'mastery', '2026-01-22T11:00:00Z'),
    makeNode('y-node-4', 'セキュリティ', 'keyword', 'user_yamada', 7, 'understanding', '2026-02-01T14:00:00Z'),
    makeNode('y-node-5', 'WebリニューアルPJ', 'project', 'user_yamada', 9, 'understanding', '2026-02-01T09:00:00Z'),
    makeNode('y-node-6', 'CI/CD', 'keyword', 'user_yamada', 8, 'mastery', '2026-01-25T10:00:00Z'),
    makeNode('y-node-7', 'パフォーマンス最適化', 'keyword', 'user_yamada', 5, 'understanding', '2026-02-08T11:00:00Z'),
    makeNode('y-node-8', '鈴木', 'person', 'user_yamada', 6, 'understanding', '2026-02-01T10:00:00Z'),
  ];

  nodesStore = [...selfNodes, ...tanakaNodes, ...satoNodes, ...yamadaNodes];
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
