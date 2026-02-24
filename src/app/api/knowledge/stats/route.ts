// Phase 28: ナレッジ統計API
// 組織全体のナレッジマスタの統計情報を返す

import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const userId = await getServerUserId();
    const supabase = createServerClient();

    if (!supabase) {
      // デモモード
      return NextResponse.json({
        success: true,
        data: {
          totalDomains: 5,
          totalFields: 17,
          totalEntries: 30,
          totalNodes: 0,
          recentKeywords: [],
          domainDistribution: [],
          triggerDistribution: [],
        },
      });
    }

    // 並列で統計取得
    const [
      { count: domainCount },
      { count: fieldCount },
      { count: entryCount },
      { count: nodeCount },
      { data: recentEntries },
      { data: domains },
      { data: recentContexts },
    ] = await Promise.all([
      supabase.from('knowledge_domains').select('*', { count: 'exact', head: true }),
      supabase.from('knowledge_fields').select('*', { count: 'exact', head: true }),
      supabase.from('knowledge_master_entries').select('*', { count: 'exact', head: true }),
      supabase.from('user_nodes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('knowledge_master_entries')
        .select('label, field_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('knowledge_domains')
        .select(`
          id, name, color,
          knowledge_fields (
            id,
            knowledge_master_entries ( id )
          )
        `),
      supabase.from('node_source_contexts')
        .select('source_type, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    // ドメイン別分布
    const domainDistribution = (domains || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      entryCount: d.knowledge_fields?.reduce(
        (sum: number, f: any) => sum + (f.knowledge_master_entries?.length || 0),
        0
      ) || 0,
    }));

    // トリガー別分布
    const triggerMap: Record<string, number> = {};
    (recentContexts || []).forEach((ctx: any) => {
      triggerMap[ctx.source_type] = (triggerMap[ctx.source_type] || 0) + 1;
    });
    const triggerDistribution = Object.entries(triggerMap).map(([type, count]) => ({
      type,
      count,
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalDomains: domainCount || 0,
        totalFields: fieldCount || 0,
        totalEntries: entryCount || 0,
        totalNodes: nodeCount || 0,
        recentKeywords: (recentEntries || []).map((e: any) => ({
          label: e.label,
          createdAt: e.created_at,
        })),
        domainDistribution,
        triggerDistribution,
      },
    });
  } catch (error) {
    console.error('[Knowledge Stats] エラー:', error);
    return NextResponse.json(
      { success: false, error: '統計情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
