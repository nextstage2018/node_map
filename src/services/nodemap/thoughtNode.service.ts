// Phase 42a: 思考ノードサービス
// AI会話からキーワードを自動抽出 → ナレッジマスタへ登録 → thought_task_nodes で紐づけ
//
// 設計書(DESIGN_THOUGHT_MAP.md)のPhase 42aに対応:
//   - 種・タスクのAI会話の毎ターンでキーワード自動抽出
//   - knowledge_master_entries へのノード自動登録
//   - thought_task_nodes テーブルでタスク/種との紐づけ

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { extractKeywords } from '@/services/ai/keywordExtractor.service';
import { KnowledgeMasterService } from './knowledgeMaster.service';
import type { KeywordExtractionRequest, ExtractedKeyword } from '@/lib/types';

// ========================================
// 型定義
// ========================================

export interface ThoughtNode {
  id: string;
  taskId?: string;
  seedId?: string;
  nodeId: string;       // knowledge_master_entries の id
  nodeLabel: string;    // ラベル（表示用）
  userId: string;
  appearOrder: number;
  isMainRoute?: boolean;
  appearPhase: string;  // seed / ideation / progress / result
  sourceConversationId?: string;
  createdAt: string;
}

export interface ThoughtEdge {
  id: string;
  taskId?: string;
  seedId?: string;
  fromNodeId: string;
  fromNodeLabel?: string;
  toNodeId: string;
  toNodeLabel?: string;
  userId: string;
  edgeType: 'main' | 'detour';
  edgeOrder: number;
  createdAt: string;
}

export interface ExtractAndLinkResult {
  extractedKeywords: ExtractedKeyword[];
  linkedNodes: ThoughtNode[];
  edges: ThoughtEdge[];            // Phase 42d: 生成された思考動線
  newMasterEntries: string[];  // 新規作成されたマスタエントリのID
}

// ========================================
// サービスクラス
// ========================================

export class ThoughtNodeService {

  /**
   * AI会話のテキストからキーワードを抽出し、ナレッジマスタに登録して紐づける
   * 種(seed)またはタスク(task)のAI会話の毎ターンで呼ばれる
   */
  static async extractAndLink(params: {
    text: string;           // ユーザーメッセージ + AI応答を結合したテキスト
    userId: string;
    taskId?: string;        // タスクID（タスク会話の場合）
    seedId?: string;        // 種ID（種会話の場合）
    phase: string;          // seed / ideation / progress / result
    conversationId?: string; // 会話ターンのID
  }): Promise<ExtractAndLinkResult> {
    const { text, userId, taskId, seedId, phase, conversationId } = params;

    const result: ExtractAndLinkResult = {
      extractedKeywords: [],
      linkedNodes: [],
      edges: [],
      newMasterEntries: [],
    };

    try {
      // 1. テキストからキーワードを抽出（既存のextractKeywordsを再利用）
      const extraction = await extractKeywords({
        text,
        sourceType: seedId ? 'seed' as any : 'task_conversation' as any,
        sourceId: taskId || seedId || '',
        direction: 'self',
        userId,
        phase,
      });

      // keywords + projects を統合（personsは除外 — 人名はナレッジマスタの対象外）
      const allKeywords = [
        ...extraction.keywords.filter(k => k.confidence >= 0.6),
        ...extraction.projects.filter(p => p.confidence >= 0.6),
      ];

      result.extractedKeywords = allKeywords;

      if (allKeywords.length === 0) return result;

      // 2. 各キーワードについて ナレッジマスタへの登録 + thought_task_nodes への紐づけ
      const sb = getServerSupabase() || getSupabase();
      if (!sb) return result; // DBなしの場合はスキップ

      // 現在の紐づけ数を取得（appear_order の算出用）
      let currentOrder = 0;
      try {
        const countQuery = sb
          .from('thought_task_nodes')
          .select('id', { count: 'exact', head: true });
        if (taskId) countQuery.eq('task_id', taskId);
        else if (seedId) countQuery.eq('seed_id', seedId);
        const { count } = await countQuery;
        currentOrder = count || 0;
      } catch { /* 初回はカウント0 */ }

      for (const kw of allKeywords) {
        try {
          // 2a. ナレッジマスタに存在するかチェック → なければ新規作成
          const masterEntryId = await ThoughtNodeService.ensureMasterEntry(
            sb, kw.label, userId, phase, taskId || seedId, conversationId
          );
          if (!masterEntryId) continue;

          // 2b. thought_task_nodes に紐づけ（UPSERT）
          currentOrder++;
          const linkedNode = await ThoughtNodeService.linkToTaskOrSeed(sb, {
            taskId,
            seedId,
            nodeId: masterEntryId,
            userId,
            appearOrder: currentOrder,
            appearPhase: phase,
            conversationId,
          });

          if (linkedNode) {
            result.linkedNodes.push({
              ...linkedNode,
              nodeLabel: kw.label,
            });
          }
        } catch (e) {
          console.error(`[ThoughtNode] キーワード "${kw.label}" の処理失敗:`, e);
        }
      }

      // 3. Phase 42d: 思考動線（エッジ）を生成
      // 今回抽出されたノード群の間に順序エッジを記録
      if (result.linkedNodes.length >= 2) {
        try {
          const edges = await ThoughtNodeService.createThoughtEdges(sb, {
            taskId,
            seedId,
            nodeIds: result.linkedNodes.map(n => n.nodeId),
            userId,
          });
          result.edges = edges;
        } catch (e) {
          console.error('[ThoughtNode] エッジ生成エラー（ノード紐づけは正常）:', e);
        }
      }

      return result;
    } catch (error) {
      console.error('[ThoughtNode] extractAndLink エラー:', error);
      return result;
    }
  }

  /**
   * Phase 42d: 思考動線（エッジ）を生成
   * 今回のターンで抽出されたノード群を順に繋ぐ + 既存の最後のノードとも接続
   */
  private static async createThoughtEdges(
    sb: any,
    params: {
      taskId?: string;
      seedId?: string;
      nodeIds: string[];
      userId: string;
    }
  ): Promise<ThoughtEdge[]> {
    const { taskId, seedId, nodeIds, userId } = params;
    const edges: ThoughtEdge[] = [];

    try {
      // 既存エッジ数を取得（edge_order の算出用）
      let currentEdgeOrder = 0;
      try {
        const countQuery = sb
          .from('thought_edges')
          .select('id', { count: 'exact', head: true });
        if (taskId) countQuery.eq('task_id', taskId);
        else if (seedId) countQuery.eq('seed_id', seedId);
        const { count } = await countQuery;
        currentEdgeOrder = count || 0;
      } catch { /* 初回は0 */ }

      // 前回の最後のノードを取得（既存ノードと今回のノードを繋ぐため）
      let previousLastNodeId: string | null = null;
      try {
        const lastNodeQuery = sb
          .from('thought_task_nodes')
          .select('node_id')
          .order('appear_order', { ascending: false })
          .limit(1);
        if (taskId) lastNodeQuery.eq('task_id', taskId);
        else if (seedId) lastNodeQuery.eq('seed_id', seedId);

        // 今回のノード以外で最新のものを取得
        lastNodeQuery.not('node_id', 'in', `(${nodeIds.join(',')})`);
        const { data } = await lastNodeQuery;
        if (data && data.length > 0) {
          previousLastNodeId = data[0].node_id;
        }
      } catch { /* 初回は前回ノードなし */ }

      // エッジを生成: 前回の最後 → 今回の最初、今回のノード群を順に接続
      const orderedIds = previousLastNodeId
        ? [previousLastNodeId, ...nodeIds]
        : nodeIds;

      for (let i = 0; i < orderedIds.length - 1; i++) {
        const fromId = orderedIds[i];
        const toId = orderedIds[i + 1];

        // 同じノード同士のエッジは作らない
        if (fromId === toId) continue;

        currentEdgeOrder++;
        const insertData: Record<string, unknown> = {
          from_node_id: fromId,
          to_node_id: toId,
          user_id: userId,
          edge_type: 'main',
          edge_order: currentEdgeOrder,
        };
        if (taskId) insertData.task_id = taskId;
        if (seedId) insertData.seed_id = seedId;

        const { data, error } = await sb
          .from('thought_edges')
          .upsert(insertData, {
            onConflict: taskId ? 'task_id,from_node_id,to_node_id' : 'seed_id,from_node_id,to_node_id',
            ignoreDuplicates: true,
          })
          .select()
          .single();

        if (!error && data) {
          edges.push({
            id: data.id,
            taskId: data.task_id,
            seedId: data.seed_id,
            fromNodeId: data.from_node_id,
            toNodeId: data.to_node_id,
            userId: data.user_id,
            edgeType: data.edge_type,
            edgeOrder: data.edge_order,
            createdAt: data.created_at,
          });
        }
        // UNIQUE制約違反は無視（既存エッジ）
      }
    } catch (error) {
      // テーブル未作成の場合のフォールバック
      if (String(error).includes('relation') || String(error).includes('42P01')) {
        console.warn('[ThoughtNode] thought_edges テーブルが未作成です。マイグレーション 024 を実行してください。');
      } else {
        console.error('[ThoughtNode] createThoughtEdges エラー:', error);
      }
    }

    return edges;
  }

  /**
   * タスクまたは種の思考動線（エッジ）を取得
   */
  static async getEdges(params: {
    taskId?: string;
    seedId?: string;
  }): Promise<ThoughtEdge[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      let query = sb
        .from('thought_edges')
        .select('*')
        .order('edge_order', { ascending: true });

      if (params.taskId) query = query.eq('task_id', params.taskId);
      if (params.seedId) query = query.eq('seed_id', params.seedId);

      const { data, error } = await query;

      if (error) {
        if (error.message?.includes('relation') || error.code === '42P01') return [];
        console.error('[ThoughtNode] getEdges エラー:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        taskId: row.task_id,
        seedId: row.seed_id,
        fromNodeId: row.from_node_id,
        toNodeId: row.to_node_id,
        userId: row.user_id,
        edgeType: row.edge_type,
        edgeOrder: row.edge_order,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * ナレッジマスタにキーワードが存在するか確認し、なければ新規作成する
   * 既存のマスタエントリのシノニムマッチングも行う
   */
  private static async ensureMasterEntry(
    sb: any,
    label: string,
    userId: string,
    sourceType: string,
    sourceId?: string,
    conversationId?: string,
  ): Promise<string | null> {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return null;

    try {
      // Step 1: 既存エントリの完全一致を検索
      const { data: exactMatch } = await sb
        .from('knowledge_master_entries')
        .select('id')
        .ilike('label', normalizedLabel)
        .limit(1)
        .maybeSingle();

      if (exactMatch) return exactMatch.id;

      // Step 2: シノニムで検索（synonyms配列にlabelが含まれるか）
      // PostgreSQLの配列検索: any()
      const { data: synonymMatch } = await sb
        .from('knowledge_master_entries')
        .select('id')
        .contains('synonyms', [normalizedLabel])
        .limit(1)
        .maybeSingle();

      if (synonymMatch) return synonymMatch.id;

      // Step 3: 既存のルールベース分類を試す
      const classification = await KnowledgeMasterService.classifyKeyword(normalizedLabel);

      if (classification?.masterEntryId) {
        return classification.masterEntryId;
      }

      // Step 4: マッチなし → 新規エントリを作成
      // field_id は分類結果があればそれを使い、なければ未分類
      const fieldId = classification?.fieldId || null;
      const now = new Date().toISOString();

      const insertData: Record<string, unknown> = {
        label: normalizedLabel,
        synonyms: [],
        source_type: sourceType === 'seed' ? 'seed' : 'task',
        source_id: sourceId || null,
        source_conversation_id: conversationId || null,
        extracted_at: now,
        is_confirmed: false,
        created_at: now,
      };

      // field_id がある場合のみ設定（外部キー制約対応）
      if (fieldId) {
        insertData.field_id = fieldId;
      }

      const { data: newEntry, error: insertError } = await sb
        .from('knowledge_master_entries')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) {
        // source_type 等の新カラムがまだない場合のフォールバック
        if (insertError.message?.includes('column')) {
          const fallbackData: Record<string, unknown> = {
            label: normalizedLabel,
            synonyms: [],
            created_at: now,
          };
          if (fieldId) fallbackData.field_id = fieldId;

          const { data: fallbackEntry, error: fallbackError } = await sb
            .from('knowledge_master_entries')
            .insert(fallbackData)
            .select('id')
            .single();

          if (fallbackError) {
            console.error('[ThoughtNode] マスタエントリ作成失敗(fallback):', fallbackError);
            return null;
          }
          return fallbackEntry?.id || null;
        }
        console.error('[ThoughtNode] マスタエントリ作成失敗:', insertError);
        return null;
      }

      return newEntry?.id || null;
    } catch (error) {
      console.error('[ThoughtNode] ensureMasterEntry エラー:', error);
      return null;
    }
  }

  /**
   * thought_task_nodes にノードを紐づける（UPSERT）
   */
  private static async linkToTaskOrSeed(
    sb: any,
    params: {
      taskId?: string;
      seedId?: string;
      nodeId: string;
      userId: string;
      appearOrder: number;
      appearPhase: string;
      conversationId?: string;
    }
  ): Promise<Omit<ThoughtNode, 'nodeLabel'> | null> {
    const { taskId, seedId, nodeId, userId, appearOrder, appearPhase, conversationId } = params;
    const now = new Date().toISOString();

    try {
      const insertData: Record<string, unknown> = {
        node_id: nodeId,
        user_id: userId,
        appear_order: appearOrder,
        appear_phase: appearPhase,
        source_conversation_id: conversationId || null,
        created_at: now,
      };
      if (taskId) insertData.task_id = taskId;
      if (seedId) insertData.seed_id = seedId;

      // UPSERT: 同じtask+nodeまたはseed+nodeの組み合わせは更新のみ
      // appear_orderは最初の出現順序を保持したいのでINSERT時のみ
      const { data, error } = await sb
        .from('thought_task_nodes')
        .upsert(insertData, {
          onConflict: taskId ? 'task_id,node_id' : 'seed_id,node_id',
          ignoreDuplicates: true, // 既存のものは更新しない（出現順を保持）
        })
        .select()
        .single();

      if (error) {
        // テーブルが存在しない場合のフォールバック（マイグレーション未実行）
        if (error.message?.includes('relation') || error.code === '42P01') {
          console.warn('[ThoughtNode] thought_task_nodes テーブルが未作成です。マイグレーション 023 を実行してください。');
          return null;
        }
        // UNIQUE制約違反はOK（既存ノード）
        if (error.code === '23505') {
          return {
            id: 'existing',
            taskId,
            seedId,
            nodeId,
            userId,
            appearOrder,
            appearPhase,
            createdAt: now,
          };
        }
        console.error('[ThoughtNode] linkToTaskOrSeed エラー:', error);
        return null;
      }

      return {
        id: data?.id || '',
        taskId: data?.task_id,
        seedId: data?.seed_id,
        nodeId: data?.node_id,
        userId: data?.user_id,
        appearOrder: data?.appear_order,
        isMainRoute: data?.is_main_route,
        appearPhase: data?.appear_phase,
        sourceConversationId: data?.source_conversation_id,
        createdAt: data?.created_at,
      };
    } catch (error) {
      console.error('[ThoughtNode] linkToTaskOrSeed 例外:', error);
      return null;
    }
  }

  /**
   * タスクまたは種に紐づくthought_task_nodesを取得
   */
  static async getLinkedNodes(params: {
    taskId?: string;
    seedId?: string;
    userId?: string;
  }): Promise<ThoughtNode[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      let query = sb
        .from('thought_task_nodes')
        .select('*, knowledge_master_entries(label)')
        .order('appear_order', { ascending: true });

      if (params.taskId) query = query.eq('task_id', params.taskId);
      if (params.seedId) query = query.eq('seed_id', params.seedId);
      if (params.userId) query = query.eq('user_id', params.userId);

      const { data, error } = await query;

      if (error) {
        // テーブル未作成のフォールバック
        if (error.message?.includes('relation') || error.code === '42P01') {
          return [];
        }
        console.error('[ThoughtNode] getLinkedNodes エラー:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        taskId: row.task_id,
        seedId: row.seed_id,
        nodeId: row.node_id,
        nodeLabel: row.knowledge_master_entries?.label || '',
        userId: row.user_id,
        appearOrder: row.appear_order,
        isMainRoute: row.is_main_route,
        appearPhase: row.appear_phase,
        sourceConversationId: row.source_conversation_id,
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error('[ThoughtNode] getLinkedNodes 例外:', error);
      return [];
    }
  }

  /**
   * ユーザーの未確認ノードを取得（週次振り返り用）
   */
  static async getUnconfirmedNodes(userId: string): Promise<{
    id: string;
    label: string;
    sourceType: string;
    extractedAt: string;
  }[]> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      // thought_task_nodes 経由で、そのユーザーに関連するナレッジマスタの未確認ノードを取得
      const { data, error } = await sb
        .from('knowledge_master_entries')
        .select('id, label, source_type, extracted_at')
        .eq('is_confirmed', false)
        .not('extracted_at', 'is', null)
        .order('extracted_at', { ascending: false })
        .limit(50);

      if (error) {
        // 新カラムがない場合のフォールバック
        if (error.message?.includes('column')) return [];
        console.error('[ThoughtNode] getUnconfirmedNodes エラー:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        label: row.label,
        sourceType: row.source_type || 'unknown',
        extractedAt: row.extracted_at || row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * ノードを承認する（is_confirmed = true）
   */
  static async confirmNode(entryId: string): Promise<boolean> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return false;

    try {
      const now = new Date().toISOString();
      const { error } = await sb
        .from('knowledge_master_entries')
        .update({
          is_confirmed: true,
          confirmed_at: now,
        })
        .eq('id', entryId);

      if (error) {
        console.error('[ThoughtNode] confirmNode エラー:', error);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
