// Phase 47: ナレッジ自動構造化サービス
// 蓄積されたキーワードをAIでクラスタリングし、領域/分野構造を自動提案

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { KnowledgeMasterService } from './knowledgeMaster.service';

// ========================================
// 型定義
// ========================================

interface ProposedField {
  label: string;
  description: string;
  entries: { id: string; label: string; confidence: number }[];
}

interface ProposedDomain {
  label: string;
  description: string;
  color: string;
  fields: ProposedField[];
}

export interface ClusteringProposal {
  id: string;
  userId: string;
  status: string;
  proposedStructure: { domains: ProposedDomain[] };
  clusteringConfidence: number;
  aiReasoning: string;
  entryIds: string[];
  entryCount: number;
  proposalWeek: string;
  createdAt: string;
}

interface ClusteringAIResponse {
  clusters: {
    domainLabel: string;
    domainDescription: string;
    color: string;
    confidence: number;
    fields: {
      fieldLabel: string;
      fieldDescription: string;
      entries: { entryLabel: string; entryId: string; confidence: number }[];
    }[];
  }[];
  overallConfidence: number;
  reasoning: string;
}

// ========================================
// AIクラスタリングのシステムプロンプト
// ========================================
const CLUSTERING_SYSTEM_PROMPT = `あなたはナレッジ構造化の専門家です。
ビジネスの会話やメッセージから自動抽出されたキーワード群を分析し、
「領域」（Domain）→「分野」（Field）→「キーワード」（Entry）の3階層に整理してください。

【ルール】
1. 意味的に近いキーワードをグループ化し、適切な「領域」と「分野」の名前をつける
2. 既存の領域/分野がある場合は、可能な限りそれに合わせる
3. 各グループの信頼度を 0.0-1.0 で評価する
4. 2個以上のキーワードがないグループは作らない
5. 必ず日本語で名前をつける
6. colorは領域ごとにTailwindのカラークラス形式（例: "bg-blue-50 text-blue-800"）で指定

【出力】JSON形式で以下の構造を返してください:
{
  "clusters": [
    {
      "domainLabel": "マーケティング",
      "domainDescription": "顧客獲得・分析・ブランド戦略に関する知識",
      "color": "bg-blue-50 text-blue-800",
      "confidence": 0.92,
      "fields": [
        {
          "fieldLabel": "SEO・検索最適化",
          "fieldDescription": "検索エンジン対策に関するキーワード",
          "entries": [
            { "entryLabel": "キーワードリサーチ", "entryId": "me_auto_xxx", "confidence": 0.95 }
          ]
        }
      ]
    }
  ],
  "overallConfidence": 0.89,
  "reasoning": "マーケティング関連のキーワード群から明確な分野を検出しました..."
}`;

// ========================================
// カラーパレット（自動割り当て用）
// ========================================
const DOMAIN_COLORS = [
  'bg-blue-50 text-blue-800',
  'bg-green-50 text-green-800',
  'bg-purple-50 text-purple-800',
  'bg-amber-50 text-amber-800',
  'bg-rose-50 text-rose-800',
  'bg-cyan-50 text-cyan-800',
  'bg-indigo-50 text-indigo-800',
  'bg-orange-50 text-orange-800',
];

// ========================================
// サービスクラス
// ========================================

export class KnowledgeClusteringService {

  /**
   * ISO週番号を取得
   */
  static getISOWeek(date: Date = new Date()): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * 未確認キーワードを取得
   */
  static async getUnconfirmedEntries(userId: string): Promise<{ id: string; label: string; category?: string; source_type?: string }[]> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return [];

    // thought_task_nodes経由でユーザーのエントリを取得
    const { data: nodeLinks } = await supabase
      .from('thought_task_nodes')
      .select('node_id')
      .eq('user_id', userId);

    if (!nodeLinks || nodeLinks.length === 0) return [];

    const nodeIds = [...new Set(nodeLinks.map((n: { node_id: string }) => n.node_id))];

    const { data: entries } = await supabase
      .from('knowledge_master_entries')
      .select('id, label, category, source_type, field_id, is_confirmed')
      .in('id', nodeIds)
      .eq('is_confirmed', false);

    return entries || [];
  }

  /**
   * 既存の領域/分野構造を取得（AIにコンテキストとして渡す）
   */
  static async getExistingStructure(): Promise<{ domains: { label: string; fields: { label: string }[] }[] }> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return { domains: [] };

    const [domainsRes, fieldsRes] = await Promise.all([
      supabase.from('knowledge_domains').select('id, name').order('sort_order'),
      supabase.from('knowledge_fields').select('id, name, domain_id'),
    ]);

    if (!domainsRes.data) return { domains: [] };

    const domains = domainsRes.data.map((d: { id: string; name: string }) => ({
      label: d.name,
      fields: (fieldsRes.data || [])
        .filter((f: { domain_id: string }) => f.domain_id === d.id)
        .map((f: { name: string }) => ({ label: f.name })),
    }));

    return { domains };
  }

  /**
   * Claude APIでキーワードをクラスタリング
   */
  static async clusterWithAI(
    entries: { id: string; label: string; category?: string }[],
    existingStructure: { domains: { label: string; fields: { label: string }[] }[] }
  ): Promise<ClusteringAIResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // APIキーなし → キーワードベースフォールバック
      return this.fallbackClustering(entries);
    }

    const userPrompt = `以下のキーワード群を分析して、領域/分野の構造を提案してください。

【対象キーワード（${entries.length}個）】
${entries.map(e => `- ${e.label} (ID: ${e.id}${e.category ? `, カテゴリ: ${e.category}` : ''})`).join('\n')}

${existingStructure.domains.length > 0 ? `
【既存の領域構造（参考）】
${existingStructure.domains.map(d => `- ${d.label}: ${d.fields.map(f => f.label).join(', ')}`).join('\n')}
` : '（既存の領域構造はありません。新しく提案してください。）'}

上記キーワードを意味的にグループ化し、JSON形式で返してください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: CLUSTERING_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        console.error('[KnowledgeClustering] API error:', response.status);
        return this.fallbackClustering(entries);
      }

      const result = await response.json();
      const text = result.content?.[0]?.text || '';

      // JSONを抽出（```json ... ``` ブロックを除去）
      const jsonMatch = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(jsonMatch) as ClusteringAIResponse;
      return parsed;
    } catch (error) {
      console.error('[KnowledgeClustering] AI clustering error:', error);
      return this.fallbackClustering(entries);
    }
  }

  /**
   * APIキーなし時のフォールバッククラスタリング
   * カテゴリベースで簡易グルーピング
   */
  static fallbackClustering(
    entries: { id: string; label: string; category?: string }[]
  ): ClusteringAIResponse {
    const groups = new Map<string, typeof entries>();

    for (const entry of entries) {
      const cat = entry.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(entry);
    }

    const categoryLabels: Record<string, string> = {
      concept: 'コンセプト・概念',
      person: '人物・組織',
      place: '場所・地域',
      method: '手法・プロセス',
      tool: 'ツール・技術',
      other: 'その他',
    };

    const clusters = Array.from(groups.entries())
      .filter(([, items]) => items.length >= 2)
      .map(([cat, items], idx) => ({
        domainLabel: categoryLabels[cat] || cat,
        domainDescription: `${categoryLabels[cat] || cat}に関するキーワード群`,
        color: DOMAIN_COLORS[idx % DOMAIN_COLORS.length],
        confidence: 0.6,
        fields: [{
          fieldLabel: categoryLabels[cat] || cat,
          fieldDescription: `自動分類: ${cat}`,
          entries: items.map(e => ({
            entryLabel: e.label,
            entryId: e.id,
            confidence: 0.6,
          })),
        }],
      }));

    return {
      clusters,
      overallConfidence: 0.5,
      reasoning: 'APIキーが設定されていないため、カテゴリベースの簡易分類を行いました。',
    };
  }

  /**
   * 週次クラスタリング提案を生成
   */
  static async proposeWeeklyClustering(userId: string): Promise<ClusteringProposal | null> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return null;

    const proposalWeek = this.getISOWeek();

    // 同じ週の提案が既にあるかチェック
    const { data: existing } = await supabase
      .from('knowledge_clustering_proposals')
      .select('id')
      .eq('user_id', userId)
      .eq('proposal_week', proposalWeek)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[KnowledgeClustering] Week ${proposalWeek} already has a proposal for user ${userId}`);
      return null;
    }

    // 未確認エントリを取得
    const entries = await this.getUnconfirmedEntries(userId);
    if (entries.length < 5) {
      console.log(`[KnowledgeClustering] Not enough entries (${entries.length}) for user ${userId}`);
      return null;
    }

    // 最大100個に制限
    const targetEntries = entries.slice(0, 100);

    // 既存構造を取得
    const existingStructure = await this.getExistingStructure();

    // AIクラスタリング
    const aiResult = await this.clusterWithAI(targetEntries, existingStructure);

    // 提案をDB保存
    const proposedStructure = {
      domains: aiResult.clusters.map(c => ({
        label: c.domainLabel,
        description: c.domainDescription,
        color: c.color,
        fields: c.fields.map(f => ({
          label: f.fieldLabel,
          description: f.fieldDescription,
          entries: f.entries.map(e => ({
            id: e.entryId,
            label: e.entryLabel,
            confidence: e.confidence,
          })),
        })),
      })),
    };

    const entryIds = targetEntries.map(e => e.id);

    const { data, error } = await supabase
      .from('knowledge_clustering_proposals')
      .insert({
        user_id: userId,
        status: 'pending',
        proposed_structure: proposedStructure,
        clustering_confidence: aiResult.overallConfidence,
        ai_reasoning: aiResult.reasoning,
        entry_ids: entryIds,
        entry_count: entryIds.length,
        proposal_week: proposalWeek,
      })
      .select()
      .single();

    if (error) {
      console.error('[KnowledgeClustering] Insert error:', error);
      return null;
    }

    return this.mapProposal(data);
  }

  /**
   * 待機中の提案一覧を取得
   */
  static async getPendingProposals(userId: string): Promise<ClusteringProposal[]> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('knowledge_clustering_proposals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(this.mapProposal);
  }

  /**
   * 提案を承認して適用
   * 領域/分野を自動作成し、キーワードをconfirmed=trueに更新
   */
  static async applyProposal(proposalId: string, userId: string): Promise<{
    createdDomains: number;
    createdFields: number;
    confirmedEntries: number;
  }> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) throw new Error('Supabase not configured');

    // 提案を取得
    const { data: proposal, error } = await supabase
      .from('knowledge_clustering_proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('user_id', userId)
      .single();

    if (error || !proposal) throw new Error('提案が見つかりません');
    if (proposal.status !== 'pending') throw new Error('この提案は既に処理済みです');

    const structure = proposal.proposed_structure as { domains: ProposedDomain[] };
    let createdDomains = 0;
    let createdFields = 0;
    let confirmedEntries = 0;

    for (const domain of structure.domains) {
      // 領域を作成
      const newDomain = await KnowledgeMasterService.addDomain(
        domain.label,
        domain.description,
        domain.color
      );
      createdDomains++;

      for (const field of domain.fields) {
        // 分野を作成
        const newField = await KnowledgeMasterService.addField(
          newDomain.id,
          field.label,
          field.description
        );
        createdFields++;

        // キーワードのfield_idを更新＋confirmed
        for (const entry of field.entries) {
          await supabase
            .from('knowledge_master_entries')
            .update({
              field_id: newField.id,
              is_confirmed: true,
              confirmed_at: new Date().toISOString(),
              created_via: 'auto_proposal',
            })
            .eq('id', entry.id);
          confirmedEntries++;
        }
      }
    }

    // 提案ステータスを更新
    await supabase
      .from('knowledge_clustering_proposals')
      .update({
        status: 'approved',
        applied_at: new Date().toISOString(),
        approved_entries: proposal.entry_ids,
      })
      .eq('id', proposalId);

    return { createdDomains, createdFields, confirmedEntries };
  }

  /**
   * 提案を却下
   */
  static async rejectProposal(proposalId: string, userId: string): Promise<void> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) throw new Error('Supabase not configured');

    await supabase
      .from('knowledge_clustering_proposals')
      .update({
        status: 'rejected',
        rejected_entries: [],
      })
      .eq('id', proposalId)
      .eq('user_id', userId);
  }

  /**
   * 提案履歴を取得
   */
  static async getProposalHistory(userId: string, limit: number = 10): Promise<ClusteringProposal[]> {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return [];

    const { data } = await supabase
      .from('knowledge_clustering_proposals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapProposal);
  }

  /**
   * DB行をClusteringProposal型にマッピング
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static mapProposal(row: any): ClusteringProposal {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      proposedStructure: row.proposed_structure || { domains: [] },
      clusteringConfidence: row.clustering_confidence || 0,
      aiReasoning: row.ai_reasoning || '',
      entryIds: row.entry_ids || [],
      entryCount: row.entry_count || 0,
      proposalWeek: row.proposal_week || '',
      createdAt: row.created_at,
    };
  }
}
