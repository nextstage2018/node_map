// Phase 57: 今週のノード API
// ログインユーザーが今週関わったキーワードをタグクラウド用に返す
import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getServerSupabase() || getSupabase();
  if (!sb) {
    return NextResponse.json({ success: true, data: { weekStart: '', weekEnd: '', nodes: [] } });
  }

  try {
    // 今週の月曜日を計算（ISO 8601: 月曜=1）
    const now = new Date();
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜日は-6、それ以外は1-dayOfWeek
    weekStart.setDate(now.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    // 今週のthought_task_nodesを取得
    const { data: nodeRows, error: nodeError } = await sb
      .from('thought_task_nodes')
      .select('node_id, task_id, seed_id, knowledge_master_entries(id, label, field_id)')
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString());

    if (nodeError) {
      console.error('[ThisWeek] ノード取得エラー:', nodeError);
      return NextResponse.json({ success: true, data: { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), nodes: [] } });
    }

    if (!nodeRows || nodeRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), nodes: [] },
      });
    }

    // node_idで集約（同じキーワードの出現回数をカウント）
    const nodeFrequencyMap = new Map<string, {
      id: string;
      label: string;
      fieldId: string | null;
      frequency: number;
      taskIds: Set<string>;
      seedIds: Set<string>;
    }>();

    for (const row of nodeRows) {
      const entry = (row as any).knowledge_master_entries;
      if (!entry || !entry.label) continue;

      const nodeId = row.node_id;
      if (!nodeFrequencyMap.has(nodeId)) {
        nodeFrequencyMap.set(nodeId, {
          id: entry.id,
          label: entry.label,
          fieldId: entry.field_id || null,
          frequency: 0,
          taskIds: new Set(),
          seedIds: new Set(),
        });
      }

      const node = nodeFrequencyMap.get(nodeId)!;
      node.frequency++;
      if (row.task_id) node.taskIds.add(row.task_id);
      if (row.seed_id) node.seedIds.add(row.seed_id);
    }

    // field_id → domain情報を取得
    const fieldIds = [...new Set(
      Array.from(nodeFrequencyMap.values())
        .map(n => n.fieldId)
        .filter(Boolean) as string[]
    )];

    let fieldDomainMap = new Map<string, { domainName: string; domainColor: string }>();
    if (fieldIds.length > 0) {
      const { data: fieldRows } = await sb
        .from('knowledge_fields')
        .select('id, domain_id, knowledge_domains(name, color)')
        .in('id', fieldIds);

      if (fieldRows) {
        for (const f of fieldRows) {
          const domain = (f as any).knowledge_domains;
          if (domain) {
            fieldDomainMap.set(f.id, {
              domainName: domain.name || '未分類',
              domainColor: domain.color || '#94a3b8',
            });
          }
        }
      }
    }

    // レスポンスデータ構築
    const nodes = Array.from(nodeFrequencyMap.values())
      .map(n => {
        const domainInfo = n.fieldId ? fieldDomainMap.get(n.fieldId) : null;
        return {
          id: n.id,
          label: n.label,
          frequency: n.frequency,
          relatedTaskIds: Array.from(n.taskIds),
          relatedSeedIds: Array.from(n.seedIds),
          category: domainInfo?.domainName || '未分類',
          color: domainInfo?.domainColor || '#94a3b8',
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    return NextResponse.json({
      success: true,
      data: {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        nodes,
      },
    });
  } catch (error) {
    console.error('[ThisWeek] エラー:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
