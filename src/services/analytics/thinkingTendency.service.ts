/**
 * Phase 61: 思考傾向分析サービス
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface TendencyAnalysisResult {
  tendencySummary: string;
  thinkingPatterns: string[];
  decisionStyle: string;
  riskTolerance: string;
  collaborationStyle: string;
  ownerPolicyText?: string;
  sourceStats: Record<string, number>;
}

export class ThinkingTendencyService {
  static async analyzeUser(userId: string): Promise<TendencyAnalysisResult> {
    const sb = getServerSupabase() || getSupabase();
    if (!sb) throw new Error('DB not available');

    const [nodeStats, edgeStats, snapshotStats, convStats, taskStats] = await Promise.all([
      this.getNodeStats(sb, userId),
      this.getEdgeStats(sb, userId),
      this.getSnapshotStats(sb, userId),
      this.getConversationStats(sb, userId),
      this.getTaskStats(sb, userId),
    ]);

    const sourceStats = {
      totalNodes: nodeStats.totalNodes, uniqueKeywords: nodeStats.uniqueKeywords,
      totalEdges: edgeStats.totalEdges, totalSnapshots: snapshotStats.totalSnapshots,
      totalConversations: convStats.totalTurns, totalTasks: taskStats.totalTasks,
      completedTasks: taskStats.completedTasks,
    };

    if (nodeStats.totalNodes < 3 && convStats.totalTurns < 5) {
      return {
        tendencySummary: 'データ蓄積中です。タスクやAI会話を進めることで、より正確な分析が可能になります。',
        thinkingPatterns: [], decisionStyle: '分析中', riskTolerance: '分析中',
        collaborationStyle: '分析中', sourceStats,
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) return this.buildFallback(nodeStats, edgeStats, taskStats, sourceStats);

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const isOwner = userId === (process.env.ENV_TOKEN_OWNER_ID || '');

      const prompt = `以下のユーザーデータから思考傾向を分析してください。

## 統計データ
### キーワード
- 総ノード数: ${nodeStats.totalNodes}, ユニーク: ${nodeStats.uniqueKeywords}
- TOP10: ${nodeStats.topKeywords.join('、')}
- フェーズ別: 種=${nodeStats.phaseDist.seed || 0}, 構想=${nodeStats.phaseDist.ideation || 0}, 進行=${nodeStats.phaseDist.progress || 0}, 結果=${nodeStats.phaseDist.result || 0}

### 思考フロー
- エッジ数: ${edgeStats.totalEdges}, 平均順序: ${edgeStats.avgOrder}
${edgeStats.note}

### ゴール⇔着地
${snapshotStats.note}

### 会話
- ターン数: ${convStats.totalTurns} (構想${convStats.ideation}/進行${convStats.progress}/結果${convStats.result})
- 平均長: ${convStats.avgLen}文字

### タスク
- 総数: ${taskStats.totalTasks}, 完了: ${taskStats.completedTasks}, 進行中: ${taskStats.inProgress}

## 出力（JSON）
{
  "tendency_summary": "3-5行。二人称で書く。",
  "thinking_patterns": ["タグ3-5個"],
  "decision_style": "データ重視/直感重視/合意形成重視/迅速判断",
  "risk_tolerance": "慎重派/バランス型/挑戦派",
  "collaboration_style": "独立型/委任型/協調型"${isOwner ? `,
  "owner_policy_text": "マネジャーの判断基準・価値観を3-5行で具体的に。"` : ''}
}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929', max_tokens: 1000,
        system: 'ユーザーの行動データから思考パターンを分析する専門家。出力はJSON形式のみ。',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        tendencySummary: parsed.tendency_summary || '',
        thinkingPatterns: parsed.thinking_patterns || [],
        decisionStyle: parsed.decision_style || '',
        riskTolerance: parsed.risk_tolerance || '',
        collaborationStyle: parsed.collaboration_style || '',
        ownerPolicyText: parsed.owner_policy_text || undefined,
        sourceStats,
      };
    } catch (err) {
      console.error('[ThinkingTendency] AI分析エラー:', err);
      return this.buildFallback(nodeStats, edgeStats, taskStats, sourceStats);
    }
  }

  static async getUserTendencyText(userId: string): Promise<string> {
    try {
      const sb = getServerSupabase() || getSupabase();
      if (!sb) return '';
      const { data } = await sb.from('user_thinking_tendencies')
        .select('tendency_summary').eq('user_id', userId)
        .order('analysis_date', { ascending: false }).limit(1).single();
      return data?.tendency_summary || '';
    } catch { return ''; }
  }

  static async getOwnerPolicyText(): Promise<string> {
    try {
      const ownerId = process.env.ENV_TOKEN_OWNER_ID || '';
      if (!ownerId) return '';
      const sb = getServerSupabase() || getSupabase();
      if (!sb) return '';
      const { data } = await sb.from('user_thinking_tendencies')
        .select('owner_policy_text').eq('user_id', ownerId)
        .not('owner_policy_text', 'is', null)
        .order('analysis_date', { ascending: false }).limit(1).single();
      return data?.owner_policy_text || '';
    } catch { return ''; }
  }

  // ===== Private helpers =====

  private static async getNodeStats(sb: any, userId: string) {
    const { data: nodes } = await sb.from('thought_task_nodes')
      .select('node_id, appear_phase').eq('user_id', userId);
    if (!nodes?.length) return { totalNodes: 0, uniqueKeywords: 0, topKeywords: [] as string[], phaseDist: {} as Record<string, number> };

    const nodeIds = [...new Set(nodes.map((n: any) => n.node_id))];
    const phaseDist: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      phaseDist[n.appear_phase || 'unknown'] = (phaseDist[n.appear_phase || 'unknown'] || 0) + 1;
      counts[n.node_id] = (counts[n.node_id] || 0) + 1;
    }
    const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    let topKeywords: string[] = [];
    if (topIds.length) {
      const { data: entries } = await sb.from('knowledge_master_entries').select('id, label').in('id', topIds);
      if (entries) {
        const m = new Map(entries.map((e: any) => [e.id, e.label]));
        topKeywords = topIds.map(id => m.get(id) || id).filter(Boolean);
      }
    }
    return { totalNodes: nodes.length, uniqueKeywords: nodeIds.length, topKeywords, phaseDist };
  }

  private static async getEdgeStats(sb: any, userId: string) {
    const { data: edges } = await sb.from('thought_edges').select('edge_order, edge_type').eq('user_id', userId);
    if (!edges?.length) return { totalEdges: 0, avgOrder: 0, note: '- エッジデータなし' };
    const avg = edges.reduce((s: number, e: any) => s + (e.edge_order || 0), 0) / edges.length;
    const mainR = edges.filter((e: any) => e.edge_type === 'main').length / edges.length;
    const note = mainR > 0.7 ? '- 直線的な思考フロー' : mainR > 0.4 ? '- バランス型の思考フロー' : '- 探索的な思考フロー';
    return { totalEdges: edges.length, avgOrder: Math.round(avg * 10) / 10, note };
  }

  private static async getSnapshotStats(sb: any, userId: string) {
    const { data: ss } = await sb.from('thought_snapshots').select('snapshot_type').eq('user_id', userId);
    if (!ss?.length) return { totalSnapshots: 0, note: '- スナップショットなし' };
    const pairs = Math.min(
      ss.filter((s: any) => s.snapshot_type === 'initial_goal').length,
      ss.filter((s: any) => s.snapshot_type === 'final_landing').length
    );
    return { totalSnapshots: ss.length, note: pairs > 0 ? `- ${pairs}組のゴール⇔着地データ` : '- 比較データ少' };
  }

  private static async getConversationStats(sb: any, userId: string) {
    const { data: tasks } = await sb.from('tasks').select('id').eq('user_id', userId);
    if (!tasks?.length) return { totalTurns: 0, ideation: 0, progress: 0, result: 0, avgLen: 0 };
    const ids = tasks.map((t: any) => t.id).slice(0, 50);
    const { data: convs } = await sb.from('task_conversations').select('phase, content')
      .in('task_id', ids).eq('role', 'user').order('created_at', { ascending: false }).limit(100);
    if (!convs?.length) return { totalTurns: 0, ideation: 0, progress: 0, result: 0, avgLen: 0 };
    const avg = convs.reduce((s: number, c: any) => s + (c.content?.length || 0), 0) / convs.length;
    return {
      totalTurns: convs.length,
      ideation: convs.filter((c: any) => c.phase === 'ideation').length,
      progress: convs.filter((c: any) => c.phase === 'progress').length,
      result: convs.filter((c: any) => c.phase === 'result').length,
      avgLen: Math.round(avg),
    };
  }

  private static async getTaskStats(sb: any, userId: string) {
    const { data: tasks } = await sb.from('tasks').select('status').eq('user_id', userId);
    if (!tasks) return { totalTasks: 0, completedTasks: 0, inProgress: 0 };
    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t: any) => t.status === 'done').length,
      inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
    };
  }

  private static buildFallback(ns: any, es: any, ts: any, ss: Record<string, number>): TendencyAnalysisResult {
    const p: string[] = [];
    if (ns.uniqueKeywords > 20) p.push('多角的');
    if (es.totalEdges > 10) p.push('体系的');
    if (ts.completedTasks > 3) p.push('実行力');
    if (!p.length) p.push('蓄積中');
    return {
      tendencySummary: `キーワード${ns.uniqueKeywords}個、完了タスク${ts.completedTasks}個。データ蓄積で詳細分析が可能になります。`,
      thinkingPatterns: p, decisionStyle: '分析中', riskTolerance: 'バランス型',
      collaborationStyle: '分析中', sourceStats: ss,
    };
  }
}
