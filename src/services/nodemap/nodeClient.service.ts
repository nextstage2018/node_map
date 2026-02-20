// ノード（点）管理サービス
// Phase 16: 能動的インタラクションに基づくノード登録・カウント管理
//
// 登録トリガー（5種類）：
//   1. reply — 自分が返信した
//   2. task_link — タスクに紐づけた
//   3. ai_conversation — AI会話の中でそのキーワードを使用した
//   4. seed — 「種にする」ボタンを押した
//   5. manual_mark — 手動で「認知マーク」をつけた
//
// 一方的受信（メルマガ等）はノード登録しない

import {
  NodeData,
  NodeType,
  NodeSourceContext,
  NodeFilter,
  UnderstandingLevel,
  NodeInteractionTrigger,
  KeywordExtractionRequest,
  ExtractedKeyword,
} from '@/lib/types';
import { extractKeywords } from '@/services/ai/keywordExtractor.service';
import { KnowledgeMasterService } from './knowledgeMaster.service';
import { ContactPersonService } from '@/services/contact/contactPerson.service';
import { getSupabase } from '@/lib/supabase';

// Phase 16: 能動的トリガー判定
const ACTIVE_TRIGGERS: NodeInteractionTrigger[] = [
  'reply', 'task_link', 'ai_conversation', 'seed', 'manual_mark',
];

/**
 * Phase 16: コンテキストが能動的インタラクションかを判定
 * 受信のみ（メルマガ等）はfalseを返す
 */
function isActiveInteraction(context: NodeSourceContext): boolean {
  // 明示的トリガーがあればそれを優先
  if (context.trigger) {
    return ACTIVE_TRIGGERS.includes(context.trigger);
  }
  // 後方互換：triggerが未設定の場合はdirectionで判定
  // sent / self = 能動的、received のみ = 受動的（登録しない）
  return context.direction !== 'received';
}

/**
 * Phase 16: interactionCount から色の濃淡レベルを導出
 * 後方互換のためUnderstandingLevel型を返す
 */
function deriveLevel(interactionCount: number): UnderstandingLevel {
  if (interactionCount >= 8) return 'mastery';
  if (interactionCount >= 3) return 'understanding';
  return 'recognition';
}

// インメモリストア（本番はSupabase）
let nodesStore: NodeData[] = [];
let contextStore: (NodeSourceContext & { nodeId: string })[] = [];

// ヘルパー：ノード生成
function makeNode(
  id: string, label: string, type: NodeType, userId: string,
  interactionCount: number,
  firstSeen: string
): NodeData {
  const now = new Date().toISOString();
  return {
    id, label, type, userId,
    frequency: interactionCount, // 後方互換
    interactionCount,
    understandingLevel: deriveLevel(interactionCount), // Phase 16: カウントから自動導出
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
    makeNode('node-1', 'マーケティング', 'keyword', 'user_self', 12, '2026-02-01T09:00:00Z'),
    makeNode('node-2', 'SEO対策', 'keyword', 'user_self', 8, '2026-02-05T10:00:00Z'),
    makeNode('node-3', 'コンテンツ戦略', 'keyword', 'user_self', 6, '2026-02-08T11:00:00Z'),
    makeNode('node-4', 'リスティング広告', 'keyword', 'user_self', 4, '2026-02-10T14:00:00Z'),
    makeNode('node-5', 'LTV分析', 'keyword', 'user_self', 3, '2026-02-12T09:30:00Z'),
    makeNode('node-6', '田中', 'person', 'user_self', 15, '2026-02-01T09:00:00Z'),
    makeNode('node-7', '鈴木', 'person', 'user_self', 10, '2026-02-02T10:00:00Z'),
    makeNode('node-8', '佐藤', 'person', 'user_self', 5, '2026-02-05T11:00:00Z'),
    makeNode('node-9', 'WebリニューアルPJ', 'project', 'user_self', 9, '2026-02-01T09:00:00Z'),
    makeNode('node-10', '新規顧客獲得施策', 'project', 'user_self', 7, '2026-02-03T14:00:00Z'),
    makeNode('node-11', 'ユーザーリサーチ', 'keyword', 'user_self', 5, '2026-02-06T10:00:00Z'),
    makeNode('node-12', 'コンバージョン率', 'keyword', 'user_self', 6, '2026-02-07T15:00:00Z'),
    makeNode('node-13', 'ブランディング', 'keyword', 'user_self', 3, '2026-02-14T10:00:00Z'),
    makeNode('node-14', 'SNS運用', 'keyword', 'user_self', 4, '2026-02-15T11:00:00Z'),
  ];

  // ===== user_tanaka（田中部長）のノード =====
  const tanakaNodes: NodeData[] = [
    makeNode('t-node-1', '経営戦略', 'keyword', 'user_tanaka', 20, '2026-01-15T09:00:00Z'),
    makeNode('t-node-2', 'マーケティング', 'keyword', 'user_tanaka', 15, '2026-01-20T10:00:00Z'),
    makeNode('t-node-3', 'KPI設計', 'keyword', 'user_tanaka', 12, '2026-01-22T11:00:00Z'),
    makeNode('t-node-4', '予算管理', 'keyword', 'user_tanaka', 10, '2026-01-25T14:00:00Z'),
    makeNode('t-node-5', 'SEO対策', 'keyword', 'user_tanaka', 6, '2026-02-01T09:00:00Z'),
    makeNode('t-node-6', 'コンバージョン率', 'keyword', 'user_tanaka', 8, '2026-02-03T10:00:00Z'),
    makeNode('t-node-7', 'LTV分析', 'keyword', 'user_tanaka', 7, '2026-02-05T11:00:00Z'),
    makeNode('t-node-8', '鈴木', 'person', 'user_tanaka', 12, '2026-01-15T09:00:00Z'),
    makeNode('t-node-9', '佐藤', 'person', 'user_tanaka', 8, '2026-01-20T10:00:00Z'),
    makeNode('t-node-10', 'WebリニューアルPJ', 'project', 'user_tanaka', 14, '2026-01-15T09:00:00Z'),
    makeNode('t-node-11', '新規顧客獲得施策', 'project', 'user_tanaka', 11, '2026-01-25T14:00:00Z'),
    makeNode('t-node-12', '競合分析', 'keyword', 'user_tanaka', 9, '2026-01-28T09:00:00Z'),
    makeNode('t-node-13', 'ROI', 'keyword', 'user_tanaka', 11, '2026-01-18T10:00:00Z'),
  ];

  // ===== user_sato（佐藤さん）のノード =====
  const satoNodes: NodeData[] = [
    makeNode('s-node-1', 'デザイン', 'keyword', 'user_sato', 14, '2026-01-20T09:00:00Z'),
    makeNode('s-node-2', 'UI/UX', 'keyword', 'user_sato', 12, '2026-01-22T10:00:00Z'),
    makeNode('s-node-3', 'プロトタイプ', 'keyword', 'user_sato', 8, '2026-02-01T11:00:00Z'),
    makeNode('s-node-4', 'ユーザーリサーチ', 'keyword', 'user_sato', 10, '2026-01-25T14:00:00Z'),
    makeNode('s-node-5', 'コンバージョン率', 'keyword', 'user_sato', 4, '2026-02-10T09:00:00Z'),
    makeNode('s-node-6', 'WebリニューアルPJ', 'project', 'user_sato', 11, '2026-01-20T09:00:00Z'),
    makeNode('s-node-7', 'フィグマ', 'keyword', 'user_sato', 9, '2026-01-20T09:00:00Z'),
    makeNode('s-node-8', '田中', 'person', 'user_sato', 7, '2026-02-01T10:00:00Z'),
    makeNode('s-node-9', 'アクセシビリティ', 'keyword', 'user_sato', 5, '2026-02-05T11:00:00Z'),
  ];

  // ===== user_yamada（山田さん）のノード =====
  const yamadaNodes: NodeData[] = [
    makeNode('y-node-1', 'バックエンド', 'keyword', 'user_yamada', 16, '2026-01-18T09:00:00Z'),
    makeNode('y-node-2', 'API設計', 'keyword', 'user_yamada', 12, '2026-01-20T10:00:00Z'),
    makeNode('y-node-3', 'データベース', 'keyword', 'user_yamada', 10, '2026-01-22T11:00:00Z'),
    makeNode('y-node-4', 'セキュリティ', 'keyword', 'user_yamada', 7, '2026-02-01T14:00:00Z'),
    makeNode('y-node-5', 'WebリニューアルPJ', 'project', 'user_yamada', 9, '2026-02-01T09:00:00Z'),
    makeNode('y-node-6', 'CI/CD', 'keyword', 'user_yamada', 8, '2026-01-25T10:00:00Z'),
    makeNode('y-node-7', 'パフォーマンス最適化', 'keyword', 'user_yamada', 5, '2026-02-08T11:00:00Z'),
    makeNode('y-node-8', '鈴木', 'person', 'user_yamada', 6, '2026-02-01T10:00:00Z'),
  ];

  nodesStore = [...selfNodes, ...tanakaNodes, ...satoNodes, ...yamadaNodes];

  // Phase 9: 人物ノードにコンタクトIDと関係属性を紐付け
  const contactMapping: Record<string, { contactId: string; relationshipType: 'internal' | 'client' | 'partner' }> = {
    'node-6':  { contactId: 'contact-tanaka', relationshipType: 'internal' },
    'node-7':  { contactId: 'contact-suzuki', relationshipType: 'client' },
    'node-8':  { contactId: 'contact-sato', relationshipType: 'internal' },
    't-node-8': { contactId: 'contact-suzuki', relationshipType: 'client' },
    't-node-9': { contactId: 'contact-sato', relationshipType: 'internal' },
    's-node-8': { contactId: 'contact-tanaka', relationshipType: 'internal' },
    'y-node-8': { contactId: 'contact-suzuki', relationshipType: 'client' },
  };
  for (const node of nodesStore) {
    if (node.type === 'person' && contactMapping[node.id]) {
      node.contactId = contactMapping[node.id].contactId;
      node.relationshipType = contactMapping[node.id].relationshipType;
    }
  }
}

// ===== CRUD操作 =====

export class NodeService {
  /**
   * ノード一覧を取得
   */
  static async getNodes(filter?: NodeFilter): Promise<NodeData[]> {
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb.from('user_nodes').select('*');

        if (filter?.userId) {
          query = query.eq('user_id', filter.userId);
        }
        if (filter?.type) {
          query = query.eq('type', filter.type);
        }
        if (filter?.understandingLevel) {
          query = query.eq('understanding_level', filter.understandingLevel);
        }
        if (filter?.minFrequency) {
          query = query.gte('frequency', filter.minFrequency);
        }
        if (filter?.minInteractionCount) {
          query = query.gte('interaction_count', filter.minInteractionCount);
        }
        if (filter?.searchQuery) {
          query = query.ilike('label', `%${filter.searchQuery}%`);
        }

        const { data, error } = await query.order('frequency', { ascending: false });
        if (error) throw error;

        return (data || []).map((row) => ({
          id: row.id,
          label: row.label,
          type: row.type as NodeType,
          userId: row.user_id,
          frequency: row.frequency,
          interactionCount: row.interaction_count ?? row.frequency,
          understandingLevel: deriveLevel(row.interaction_count ?? row.frequency),
          domainId: row.domain_id,
          fieldId: row.field_id,
          relationshipType: row.relationship_type as any,
          contactId: row.contact_id,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          sourceContexts: [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      } catch (error) {
        console.error('Error fetching nodes from Supabase:', error);
      }
    }

    // Fallback to demo data
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

    return result.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * ノードをIDで取得
   */
  static async getNodeById(id: string): Promise<NodeData | null> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('user_nodes')
          .select('*')
          .eq('id', id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (data) {
          return {
            id: data.id,
            label: data.label,
            type: data.type as NodeType,
            userId: data.user_id,
            frequency: data.frequency,
            interactionCount: data.interaction_count ?? data.frequency,
            understandingLevel: deriveLevel(data.interaction_count ?? data.frequency),
            domainId: data.domain_id,
            fieldId: data.field_id,
            relationshipType: data.relationship_type as any,
            contactId: data.contact_id,
            firstSeenAt: data.first_seen_at,
            lastSeenAt: data.last_seen_at,
            sourceContexts: [],
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (error) {
        console.error('Error fetching node from Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    return nodesStore.find((n) => n.id === id) || null;
  }

  /**
   * ノードを追加または更新
   * Phase 16: 能動的インタラクションのみ登録。interactionCountを加算。
   */
  static async upsertNode(
    label: string,
    type: NodeType,
    userId: string,
    context: NodeSourceContext
  ): Promise<NodeData | null> {
    // Phase 16: 受動的インタラクション（受信のみ）はノード登録しない
    if (!isActiveInteraction(context)) {
      return null;
    }

    const sb = getSupabase();
    if (sb) {
      try {
        const now = new Date().toISOString();

        // Upsert on (user_id, label, type) conflict
        const { data, error } = await sb
          .from('user_nodes')
          .upsert(
            {
              label,
              type,
              user_id: userId,
              frequency: 1,
              interaction_count: 1,
              understanding_level: 'recognition',
              first_seen_at: now,
              last_seen_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id,label,type' }
          )
          .select()
          .single();

        if (error) throw error;

        // Increment interaction_count and frequency
        if (data) {
          const { data: current } = await sb
            .from('user_nodes')
            .select('frequency, interaction_count')
            .eq('id', data.id)
            .single();

          const newCount = (current?.interaction_count ?? current?.frequency ?? 0) + 1;
          const newFreq = (current?.frequency ?? 0) + 1;

          await sb
            .from('user_nodes')
            .update({
              frequency: newFreq,
              interaction_count: newCount,
              understanding_level: deriveLevel(newCount),
              last_seen_at: now,
              updated_at: now,
            })
            .eq('id', data.id);

          // Insert context record with trigger
          await sb.from('node_source_contexts').insert({
            node_id: data.id,
            source_type: context.sourceType,
            source_id: context.sourceId,
            direction: context.direction,
            trigger: context.trigger || null,
            phase: context.phase,
            timestamp: context.timestamp,
          });

          return {
            id: data.id,
            label: data.label,
            type: data.type as NodeType,
            userId: data.user_id,
            frequency: newFreq,
            interactionCount: newCount,
            understandingLevel: deriveLevel(newCount),
            domainId: data.domain_id,
            fieldId: data.field_id,
            firstSeenAt: data.first_seen_at,
            lastSeenAt: now,
            sourceContexts: [context],
            createdAt: data.created_at,
            updatedAt: now,
          };
        }
      } catch (error) {
        console.error('Error upserting node to Supabase:', error);
      }
    }

    // Fallback to demo data
    initDemoData();
    const now = new Date().toISOString();

    const existing = nodesStore.find(
      (n) => n.label === label && n.type === type && n.userId === userId
    );

    if (existing) {
      existing.interactionCount = (existing.interactionCount || existing.frequency) + 1;
      existing.frequency = existing.interactionCount;
      existing.understandingLevel = deriveLevel(existing.interactionCount);
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.sourceContexts.push(context);

      contextStore.push({ ...context, nodeId: existing.id });

      return existing;
    }

    const newNode: NodeData = {
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      label,
      type,
      userId,
      frequency: 1,
      interactionCount: 1,
      understandingLevel: 'recognition',
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

    // キーワードをノードに蓄積（Phase 16: 能動的インタラクションのみ）
    for (const kw of extraction.keywords) {
      if (kw.confidence >= 0.5) {
        const node = await this.upsertNode(kw.label, 'keyword', request.userId, context);
        if (node) upsertedNodes.push(node);
      }
    }

    // 人名をノードに蓄積
    for (const person of extraction.persons) {
      if (person.confidence >= 0.5) {
        const node = await this.upsertNode(person.label, 'person', request.userId, context);
        if (node) upsertedNodes.push(node);
      }
    }

    // プロジェクト名をノードに蓄積
    for (const project of extraction.projects) {
      if (project.confidence >= 0.5) {
        const node = await this.upsertNode(project.label, 'project', request.userId, context);
        if (node) upsertedNodes.push(node);
      }
    }

    // Phase 8: ナレッジマスタ自動分類
    // キーワード・プロジェクトノードをマスタに紐付け
    for (const node of upsertedNodes) {
      if (node.type === 'keyword' || node.type === 'project') {
        try {
          const classification = await KnowledgeMasterService.classifyKeyword(node.label);
          if (classification) {
            await KnowledgeMasterService.linkNodeToMaster(
              node.id,
              classification.masterEntryId || '',
              classification.confidence
            );
            // ノードに分類結果をキャッシュ
            node.domainId = classification.domainId;
            node.fieldId = classification.fieldId;
            node.masterEntryId = classification.masterEntryId;
          }
        } catch {
          // 分類失敗はサイレントに無視（ノード蓄積は継続）
        }
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
    byLevel: Record<UnderstandingLevel, number>; // Phase 16: interactionCountから導出
    topKeywords: NodeData[];
  }> {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('user_nodes')
          .select('*')
          .eq('user_id', userId)
          .order('frequency', { ascending: false });

        if (error) throw error;

        const nodes = (data || []).map((row) => ({
          id: row.id,
          label: row.label,
          type: row.type as NodeType,
          userId: row.user_id,
          frequency: row.frequency,
          interactionCount: row.interaction_count ?? row.frequency,
          understandingLevel: deriveLevel(row.interaction_count ?? row.frequency),
          domainId: row.domain_id,
          fieldId: row.field_id,
          relationshipType: row.relationship_type as any,
          contactId: row.contact_id,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          sourceContexts: [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        return {
          totalNodes: nodes.length,
          byType: {
            keyword: nodes.filter((n) => n.type === 'keyword').length,
            person: nodes.filter((n) => n.type === 'person').length,
            project: nodes.filter((n) => n.type === 'project').length,
          },
          byLevel: {
            recognition: nodes.filter((n) => n.understandingLevel === 'recognition').length,
            understanding: nodes.filter((n) => n.understandingLevel === 'understanding').length,
            mastery: nodes.filter((n) => n.understandingLevel === 'mastery').length,
          },
          topKeywords: nodes.slice(0, 10),
        };
      } catch (error) {
        console.error('Error fetching stats from Supabase:', error);
      }
    }

    // Fallback to demo data
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
