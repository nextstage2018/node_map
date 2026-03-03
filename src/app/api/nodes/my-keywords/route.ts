// Phase 57: マイナレッジ API
// ログインユーザーのキーワードをカテゴリ別に集約して返す
// period=week|month|all で期間フィルタ
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getServerSupabase() || getSupabase();
  if (!sb) {
    return NextResponse.json({ success: true, data: { nodes: [], domainStats: [], totalNodes: 0 } });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'all'; // week | month | all

  try {
    // 期間フィルタ計算
    let sinceDate: Date | null = null;
    const now = new Date();

    if (period === 'week') {
      sinceDate = new Date(now);
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      sinceDate.setDate(now.getDate() + diff);
      sinceDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // thought_task_nodes を取得（ユーザーのノード）
    let query = sb
      .from('thought_task_nodes')
      .select('node_id, task_id, seed_id, message_id, knowledge_master_entries(id, label, field_id)')
      .eq('user_id', userId);

    if (sinceDate) {
      query = query.gte('created_at', sinceDate.toISOString());
    }

    const { data: nodeRows, error: nodeError } = await query;

    if (nodeError) {
      console.error('[MyKeywords] ノード取得エラー:', nodeError);
      return NextResponse.json({ success: true, data: { nodes: [], domainStats: [], totalNodes: 0 } });
    }

    if (!nodeRows || nodeRows.length === 0) {
      return NextResponse.json({ success: true, data: { nodes: [], domainStats: [], totalNodes: 0 } });
    }

    // node_idで重複排除＋集計（getUserOverviewMapパターン参考）
    const nodeAggMap = new Map<string, {
      id: string;
      label: string;
      fieldId: string | null;
      taskIds: Set<string>;
      seedIds: Set<string>;
      messageIds: Set<string>;
    }>();

    for (const row of nodeRows) {
      const entry = (row as any).knowledge_master_entries;
      if (!entry || !entry.label) continue;

      const nodeId = row.node_id;
      if (!nodeAggMap.has(nodeId)) {
        nodeAggMap.set(nodeId, {
          id: entry.id,
          label: entry.label,
          fieldId: entry.field_id || null,
          taskIds: new Set(),
          seedIds: new Set(),
          messageIds: new Set(),
        });
      }

      const agg = nodeAggMap.get(nodeId)!;
      if (row.task_id) agg.taskIds.add(row.task_id);
      if (row.seed_id) agg.seedIds.add(row.seed_id);
      if (row.message_id) agg.messageIds.add(row.message_id);
    }

    // field_id → domain情報を取得
    const fieldIds = [...new Set(
      Array.from(nodeAggMap.values())
        .map(n => n.fieldId)
        .filter(Boolean) as string[]
    )];

    // field → domain マッピング
    const fieldDomainMap = new Map<string, {
      fieldId: string;
      fieldName: string;
      domainId: string;
      domainName: string;
      domainColor: string;
    }>();

    if (fieldIds.length > 0) {
      const { data: fieldRows } = await sb
        .from('knowledge_fields')
        .select('id, name, domain_id, knowledge_domains(id, name, color)')
        .in('id', fieldIds);

      if (fieldRows) {
        for (const f of fieldRows) {
          const domain = (f as any).knowledge_domains;
          fieldDomainMap.set(f.id, {
            fieldId: f.id,
            fieldName: f.name || '不明',
            domainId: domain?.id || 'uncategorized',
            domainName: domain?.name || '未分類',
            domainColor: domain?.color || '#94a3b8',
          });
        }
      }
    }

    // ノードデータ構築
    const nodes = Array.from(nodeAggMap.values()).map(n => {
      const fieldInfo = n.fieldId ? fieldDomainMap.get(n.fieldId) : null;
      return {
        id: n.id,
        label: n.label,
        fieldId: n.fieldId,
        fieldName: fieldInfo?.fieldName || null,
        domainId: fieldInfo?.domainId || 'uncategorized',
        domainName: fieldInfo?.domainName || '未分類',
        domainColor: fieldInfo?.domainColor || '#94a3b8',
        relatedTaskCount: n.taskIds.size + n.seedIds.size,
        relatedMessageCount: n.messageIds.size,
      };
    });

    // ドメイン別集計
    const domainStatsMap = new Map<string, {
      domainId: string;
      domainName: string;
      domainColor: string;
      nodeCount: number;
      fields: Map<string, { fieldId: string; fieldName: string; nodeCount: number }>;
    }>();

    for (const node of nodes) {
      const dId = node.domainId;
      if (!domainStatsMap.has(dId)) {
        domainStatsMap.set(dId, {
          domainId: dId,
          domainName: node.domainName,
          domainColor: node.domainColor,
          nodeCount: 0,
          fields: new Map(),
        });
      }
      const ds = domainStatsMap.get(dId)!;
      ds.nodeCount++;

      // フィールド集計
      const fId = node.fieldId || 'uncategorized';
      const fName = node.fieldName || '未分類';
      if (!ds.fields.has(fId)) {
        ds.fields.set(fId, { fieldId: fId, fieldName: fName, nodeCount: 0 });
      }
      ds.fields.get(fId)!.nodeCount++;
    }

    // domainStats配列化（ノード数降順）
    const domainStats = Array.from(domainStatsMap.values())
      .map(ds => ({
        domainId: ds.domainId,
        domainName: ds.domainName,
        domainColor: ds.domainColor,
        nodeCount: ds.nodeCount,
        fields: Array.from(ds.fields.values()).sort((a, b) => b.nodeCount - a.nodeCount),
      }))
      .sort((a, b) => b.nodeCount - a.nodeCount);

    // ノードもタスク関連数降順でソート
    nodes.sort((a, b) => (b.relatedTaskCount + b.relatedMessageCount) - (a.relatedTaskCount + a.relatedMessageCount));

    return NextResponse.json({
      success: true,
      data: {
        nodes,
        domainStats,
        totalNodes: nodes.length,
        period,
      },
    });
  } catch (error) {
    console.error('[MyKeywords] エラー:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
