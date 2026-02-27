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
    memoId?: string;        // Phase Restructure: メモID（メモ会話の場合）
    phase: string;          // seed / ideation / progress / result
    conversationId?: string; // 会話ターンのID
  }): Promise<ExtractAndLinkResult> {
    const { text, userId, taskId, seedId, memoId, phase, conversationId } = params;

    const result: ExtractAndLinkResult = {
      extractedKeywords: [],
      linkedNodes: [],
      edges: [],
      newMasterEntries: [],
    };

    try {
      console.log(`[ThoughtNode] extractAndLink開始: userId=${userId}, seedId=${seedId}, taskId=${taskId}, textLength=${text.length}`);

      // 1. テキストからキーワードを抽出（既存のextractKeywordsを再利用）
      const extraction = await extractKeywords({
        text,
        sourceType: seedId ? 'seed' as any : 'task_conversation' as any,
        sourceId: taskId || seedId || '',
        direction: 'self',
        userId,
        phase,
      });

      console.log(`[ThoughtNode] extractKeywords結果: keywords=${extraction.keywords.length}, persons=${extraction.persons.length}, projects=${extraction.projects.length}`);
      console.log(`[ThoughtNode] keywords詳細:`, extraction.keywords.map(k => `${k.label}(${k.confidence})`).join(', '));

      // keywords + projects を統合（personsは除外 — 人名はナレッジマスタの対象外）
      // Phase D: 信頼度閾値を0.7に引き上げ（名詞特化の品質改善）
      const allKeywords = [
        ...extraction.keywords.filter(k => k.confidence >= 0.7),
        ...extraction.projects.filter(p => p.confidence >= 0.7),
      ];

      result.extractedKeywords = allKeywords;

      if (allKeywords.length === 0) {
        console.log(`[ThoughtNode] 信頼度0.7以上のキーワードなし → スキップ`);
        return result;
      }

      console.log(`[ThoughtNode] 対象キーワード(${allKeywords.length}件): ${allKeywords.map(k => k.label).join(', ')}`);

      // 2. 各キーワードについて ナレッジマスタへの登録 + thought_task_nodes への紐づけ
      const sb = getServerSupabase() || getSupabase();
      if (!sb) {
        console.log(`[ThoughtNode] Supabaseクライアントなし → スキップ`);
        return result;
      }

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
            memoId,
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
      const { data: exactMatch, error: exactError } = await sb
        .from('knowledge_master_entries')
        .select('id')
        .ilike('label', normalizedLabel)
        .limit(1)
        .maybeSingle();

      if (exactError) {
        console.error(`[ThoughtNode] ensureMasterEntry exactMatch検索エラー:`, exactError);
      }

      if (exactMatch) {
        console.log(`[ThoughtNode] "${normalizedLabel}" → 既存マスタ発見: ${exactMatch.id}`);
        return exactMatch.id;
      }

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
      let classification = null;
      try {
        classification = await KnowledgeMasterService.classifyKeyword(normalizedLabel);
      } catch (classifyErr) {
        console.error(`[ThoughtNode] classifyKeywordエラー:`, classifyErr);
      }

      if (classification?.masterEntryId) {
        console.log(`[ThoughtNode] "${normalizedLabel}" → ルールベース分類マッチ: ${classification.masterEntryId}`);
        return classification.masterEntryId;
      }

      // Step 4: マッチなし → 新規エントリを作成
      // knowledge_master_entries の id は TEXT型（自動生成なし）→ 手動で生成
      const fieldId = classification?.fieldId || null;
      const now = new Date().toISOString();
      const entryId = `me_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.log(`[ThoughtNode] "${normalizedLabel}" → 新規マスタエントリ作成: id=${entryId}, fieldId=${fieldId || 'なし(未分類)'}`);

      const insertData: Record<string, unknown> = {
        id: entryId,
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
            id: entryId,
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
      memoId?: string;       // Phase Restructure: メモID
      nodeId: string;
      userId: string;
      appearOrder: number;
      appearPhase: string;
      conversationId?: string;
    }
  ): Promise<Omit<ThoughtNode, 'nodeLabel'> | null> {
    const { taskId, seedId, memoId, nodeId, userId, appearOrder, appearPhase, conversationId } = params;
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
      if (memoId) insertData.memo_id = memoId;

      // まず既存レコードをチェック（UNIQUE制約がない場合でも重複を防ぐ）
      let existQuery = sb
        .from('thought_task_nodes')
        .select('id, node_id, appear_order, appear_phase, created_at')
        .eq('node_id', nodeId);
      if (taskId) existQuery = existQuery.eq('task_id', taskId);
      if (seedId) existQuery = existQuery.eq('seed_id', seedId);
      if (memoId) existQuery = existQuery.eq('memo_id', memoId);
      const { data: existing } = await existQuery.maybeSingle();

      if (existing) {
        // 既に紐づけ済み → そのまま返す
        return {
          id: existing.id,
          taskId,
          seedId,
          nodeId,
          userId,
          appearOrder: existing.appear_order,
          appearPhase: existing.appear_phase,
          createdAt: existing.created_at,
        };
      }

      // 新規INSERT
      const { data, error } = await sb
        .from('thought_task_nodes')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        // テーブルが存在しない場合
        if (error.message?.includes('relation') || error.code === '42P01') {
          console.warn('[ThoughtNode] thought_task_nodes テーブルが未作成です。マイグレーション 023 を実行してください。');
          return null;
        }
        // UNIQUE制約違反はOK（既存ノード＝レースコンディション）
        if (error.code === '23505') {
          return {
            id: 'existing',
            taskId, seedId, nodeId, userId, appearOrder, appearPhase, createdAt: now,
          };
        }
        console.error('[ThoughtNode] linkToTaskOrSeed エラー:', error);
        return null;
      }

      console.log(`[ThoughtNode] ノード紐づけ成功: nodeId=${nodeId}, id=${data?.id}`);
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
   * Phase 42b: メッセージからキーワードを抽出してナレッジマスタに登録・紐づけ
   * Cronバッチから呼ばれる。エッジは作成しない（メッセージは「思考の流れ」ではないため）
   */
  static async extractAndLinkFromMessage(params: {
    messageId: string;
    subject: string;
    body: string;
    userId: string;
    channel: string;
  }): Promise<{ extractedCount: number; linkedCount: number }> {
    const { messageId, subject, body, userId, channel } = params;
    const result = { extractedCount: 0, linkedCount: 0 };

    try {
      const text = [subject, body].filter(Boolean).join('\n\n');
      if (!text || text.trim().length < 10) return result;

      // キーワード抽出
      const extraction = await extractKeywords({
        text,
        sourceType: 'message' as any,
        sourceId: messageId,
        direction: 'received',
        userId,
        phase: 'progress',
      });

      // Phase D: 信頼度閾値を0.7に引き上げ（名詞特化の品質改善）
      const allKeywords = [
        ...extraction.keywords.filter(k => k.confidence >= 0.7),
        ...extraction.projects.filter(p => p.confidence >= 0.7),
      ];

      result.extractedCount = allKeywords.length;
      if (allKeywords.length === 0) return result;

      const sb = getServerSupabase() || getSupabase();
      if (!sb) return result;

      let order = 0;
      for (const kw of allKeywords) {
        try {
          // ナレッジマスタに登録
          const masterEntryId = await ThoughtNodeService.ensureMasterEntry(
            sb, kw.label, userId, 'progress', messageId, undefined
          );
          if (!masterEntryId) continue;

          // thought_task_nodes に message_id で紐づけ
          order++;
          const linked = await ThoughtNodeService.linkToMessage(sb, {
            messageId,
            nodeId: masterEntryId,
            userId,
            appearOrder: order,
          });
          if (linked) result.linkedCount++;
        } catch (e) {
          console.error(`[ThoughtNode] メッセージキーワード "${kw.label}" 処理失敗:`, e);
        }
      }

      return result;
    } catch (error) {
      console.error('[ThoughtNode] extractAndLinkFromMessage エラー:', error);
      return result;
    }
  }

  /**
   * Phase 42b: メッセージとノードの紐づけ（thought_task_nodes に message_id で登録）
   */
  private static async linkToMessage(
    sb: any,
    params: {
      messageId: string;
      nodeId: string;
      userId: string;
      appearOrder: number;
    }
  ): Promise<boolean> {
    const { messageId, nodeId, userId, appearOrder } = params;

    try {
      // 重複チェック
      const { data: existing } = await sb
        .from('thought_task_nodes')
        .select('id')
        .eq('message_id', messageId)
        .eq('node_id', nodeId)
        .maybeSingle();

      if (existing) return true; // 既に紐づけ済み

      const { error } = await sb
        .from('thought_task_nodes')
        .insert({
          message_id: messageId,
          node_id: nodeId,
          user_id: userId,
          appear_order: appearOrder,
          appear_phase: 'progress', // メッセージは進行フェーズ扱い
          created_at: new Date().toISOString(),
        });

      if (error) {
        // UNIQUE制約違反は無視
        if (error.code === '23505') return true;
        console.error('[ThoughtNode] linkToMessage エラー:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[ThoughtNode] linkToMessage 例外:', error);
      return false;
    }
  }

  // ========================================
  // Phase 42e: スナップショット（出口想定・着地点）
  // ========================================

  /**
   * Phase 42e: スナップショットを記録する
   * タスク作成時（initial_goal）またはタスク完了時（final_landing）に呼ばれる
   */
  static async captureSnapshot(params: {
    taskId: string;
    userId: string;
    snapshotType: 'initial_goal' | 'final_landing';
    summary: string;
    seedId?: string; // initial_goal 時に種のノードも含める場合
  }): Promise<{ id: string; nodeIds: string[] } | null> {
    const { taskId, userId, snapshotType, summary, seedId } = params;

    try {
      const sb = getServerSupabase() || getSupabase();
      if (!sb) return null;

      // 現在のノード群を取得
      let nodeIds: string[] = [];

      // タスクに紐づくノード
      const taskNodes = await ThoughtNodeService.getLinkedNodes({ taskId });
      nodeIds = taskNodes.map(n => n.nodeId);

      // initial_goal の場合、種のノードも含める
      if (seedId && snapshotType === 'initial_goal') {
        const seedNodes = await ThoughtNodeService.getLinkedNodes({ seedId });
        const seedNodeIds = seedNodes.map(n => n.nodeId);
        // 重複排除して統合
        nodeIds = [...new Set([...seedNodeIds, ...nodeIds])];
      }

      // スナップショットを記録
      const { data, error } = await sb
        .from('thought_snapshots')
        .insert({
          task_id: taskId,
          user_id: userId,
          snapshot_type: snapshotType,
          node_ids: nodeIds,
          summary: summary || '',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        // テーブル未作成の場合のフォールバック
        if (error.message?.includes('relation') || error.code === '42P01') {
          console.warn('[ThoughtNode] thought_snapshots テーブルが未作成です。マイグレーション 029 を実行してください。');
          return null;
        }
        console.error('[ThoughtNode] captureSnapshot エラー:', error);
        return null;
      }

      console.log(`[ThoughtNode] スナップショット記録: type=${snapshotType}, taskId=${taskId}, nodes=${nodeIds.length}`);
      return { id: data?.id, nodeIds };
    } catch (error) {
      console.error('[ThoughtNode] captureSnapshot 例外:', error);
      return null;
    }
  }

  /**
   * Phase 42e: タスクのスナップショットを取得
   */
  static async getSnapshots(params: {
    taskId: string;
  }): Promise<{
    initialGoal: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
    finalLanding: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
  }> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) return { initialGoal: null, finalLanding: null };

    try {
      const { data, error } = await sb
        .from('thought_snapshots')
        .select('*')
        .eq('task_id', params.taskId)
        .order('created_at', { ascending: true });

      if (error) {
        if (error.message?.includes('relation') || error.code === '42P01') {
          return { initialGoal: null, finalLanding: null };
        }
        console.error('[ThoughtNode] getSnapshots エラー:', error);
        return { initialGoal: null, finalLanding: null };
      }

      const result: {
        initialGoal: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
        finalLanding: { id: string; nodeIds: string[]; summary: string; createdAt: string } | null;
      } = { initialGoal: null, finalLanding: null };

      for (const row of (data || [])) {
        const snapshot = {
          id: row.id,
          nodeIds: row.node_ids || [],
          summary: row.summary || '',
          createdAt: row.created_at,
        };
        if (row.snapshot_type === 'initial_goal') {
          result.initialGoal = snapshot;
        } else if (row.snapshot_type === 'final_landing') {
          result.finalLanding = snapshot;
        }
      }

      return result;
    } catch {
      return { initialGoal: null, finalLanding: null };
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

  // ========================================
  // Phase 42g: 関連タスク検索
  // ========================================

  /**
   * Phase 42g: ノード重なりで関連タスク/種を検索する
   * 指定されたノードIDと共通ノードを持つ他のタスク/種をスコア順に返す
   */
  static async searchRelatedTasks(params: {
    nodeIds: string[];
    userId?: string;
    excludeTaskId?: string;
    excludeSeedId?: string;
    limit?: number;
  }): Promise<{
    taskId?: string;
    seedId?: string;
    type: 'task' | 'seed';
    title: string;
    phase: string;
    status: string;
    overlapScore: number;
    matchedNodeLabels: string[];
    totalNodeCount: number;
    createdAt: string;
  }[]> {
    const { nodeIds, userId, excludeTaskId, excludeSeedId, limit = 10 } = params;
    if (nodeIds.length === 0) return [];

    const sb = getServerSupabase() || getSupabase();
    if (!sb) return [];

    try {
      // 1. 指定ノードIDに一致する thought_task_nodes を取得
      const { data: matchedRows, error: matchErr } = await sb
        .from('thought_task_nodes')
        .select('task_id, seed_id, node_id, knowledge_master_entries(label)')
        .in('node_id', nodeIds);

      if (matchErr || !matchedRows) {
        console.error('[ThoughtNode] searchRelatedTasks マッチ取得エラー:', matchErr);
        return [];
      }

      // 2. task_id / seed_id でグループ化
      const taskMap = new Map<string, { type: 'task' | 'seed'; id: string; matchedNodes: Set<string>; matchedLabels: Set<string> }>();

      for (const row of matchedRows) {
        const key = row.task_id ? `task:${row.task_id}` : row.seed_id ? `seed:${row.seed_id}` : null;
        if (!key) continue;

        // 除外チェック
        if (row.task_id && row.task_id === excludeTaskId) continue;
        if (row.seed_id && row.seed_id === excludeSeedId) continue;

        if (!taskMap.has(key)) {
          taskMap.set(key, {
            type: row.task_id ? 'task' : 'seed',
            id: row.task_id || row.seed_id,
            matchedNodes: new Set(),
            matchedLabels: new Set(),
          });
        }
        const entry = taskMap.get(key)!;
        entry.matchedNodes.add(row.node_id);
        const label = (row as any).knowledge_master_entries?.label;
        if (label) entry.matchedLabels.add(label);
      }

      if (taskMap.size === 0) return [];

      // 3. 各タスク/種の総ノード数を取得
      const taskIds = [...taskMap.values()].filter(e => e.type === 'task').map(e => e.id);
      const seedIds = [...taskMap.values()].filter(e => e.type === 'seed').map(e => e.id);

      // タスクの総ノード数
      const taskNodeCounts = new Map<string, number>();
      if (taskIds.length > 0) {
        const { data: counts } = await sb
          .from('thought_task_nodes')
          .select('task_id')
          .in('task_id', taskIds);
        if (counts) {
          for (const row of counts) {
            taskNodeCounts.set(row.task_id, (taskNodeCounts.get(row.task_id) || 0) + 1);
          }
        }
      }

      // 種の総ノード数
      const seedNodeCounts = new Map<string, number>();
      if (seedIds.length > 0) {
        const { data: counts } = await sb
          .from('thought_task_nodes')
          .select('seed_id')
          .in('seed_id', seedIds);
        if (counts) {
          for (const row of counts) {
            seedNodeCounts.set(row.seed_id, (seedNodeCounts.get(row.seed_id) || 0) + 1);
          }
        }
      }

      // 4. タスク/種の詳細を取得
      const taskDetails = new Map<string, { title: string; phase: string; status: string; createdAt: string }>();
      if (taskIds.length > 0) {
        const { data: tasks } = await sb
          .from('tasks')
          .select('id, title, phase, status, created_at')
          .in('id', taskIds);
        if (tasks) {
          for (const t of tasks) {
            taskDetails.set(t.id, { title: t.title, phase: t.phase, status: t.status, createdAt: t.created_at });
          }
        }
      }

      const seedDetails = new Map<string, { title: string; status: string; createdAt: string }>();
      if (seedIds.length > 0) {
        const { data: seeds } = await sb
          .from('seeds')
          .select('id, content, status, created_at')
          .in('id', seedIds);
        if (seeds) {
          for (const s of seeds) {
            seedDetails.set(s.id, {
              title: (s.content || '').slice(0, 50) + (s.content?.length > 50 ? '...' : ''),
              status: s.status,
              createdAt: s.created_at,
            });
          }
        }
      }

      // 5. スコア計算＋結果構築
      const results: {
        taskId?: string;
        seedId?: string;
        type: 'task' | 'seed';
        title: string;
        phase: string;
        status: string;
        overlapScore: number;
        matchedNodeLabels: string[];
        totalNodeCount: number;
        createdAt: string;
      }[] = [];

      for (const entry of taskMap.values()) {
        const matchedCount = entry.matchedNodes.size;
        const totalCount = entry.type === 'task'
          ? (taskNodeCounts.get(entry.id) || matchedCount)
          : (seedNodeCounts.get(entry.id) || matchedCount);

        const overlapScore = matchedCount / Math.max(nodeIds.length, totalCount);

        // 詳細を取得
        let title = '不明';
        let phase = 'seed';
        let status = 'unknown';
        let createdAt = '';

        if (entry.type === 'task') {
          const detail = taskDetails.get(entry.id);
          if (detail) {
            title = detail.title;
            phase = detail.phase;
            status = detail.status;
            createdAt = detail.createdAt;
          }
        } else {
          const detail = seedDetails.get(entry.id);
          if (detail) {
            title = detail.title;
            phase = 'seed';
            status = detail.status;
            createdAt = detail.createdAt;
          }
        }

        results.push({
          taskId: entry.type === 'task' ? entry.id : undefined,
          seedId: entry.type === 'seed' ? entry.id : undefined,
          type: entry.type,
          title,
          phase,
          status,
          overlapScore: Math.round(overlapScore * 100) / 100,
          matchedNodeLabels: [...entry.matchedLabels],
          totalNodeCount: totalCount,
          createdAt,
        });
      }

      // スコア降順ソート
      results.sort((a, b) => b.overlapScore - a.overlapScore);

      return results.slice(0, limit);
    } catch (error) {
      console.error('[ThoughtNode] searchRelatedTasks エラー:', error);
      return [];
    }
  }
}
