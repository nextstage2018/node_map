// src/app/api/nodes/weekly/route.ts
// Phase 20: 週次ノード取得API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { NodeData, WeeklyNodesResponse } from '@/lib/types';

// デモモード用のノードデータ
const demoNodes: NodeData[] = [
  {
    id: 'demo-node-1',
    label: 'プロジェクト管理',
    type: 'keyword',
    userId: 'demo-user',
    frequency: 8,
    understandingLevel: 'understanding',
    firstSeenAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-node-2',
    label: '田中太郎',
    type: 'person',
    userId: 'demo-user',
    frequency: 5,
    understandingLevel: 'recognition',
    firstSeenAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-node-3',
    label: 'API設計',
    type: 'keyword',
    userId: 'demo-user',
    frequency: 12,
    understandingLevel: 'mastery',
    firstSeenAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    lastSeenAt: new Date().toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-node-4',
    label: 'NodeMap開発',
    type: 'project',
    userId: 'demo-user',
    frequency: 15,
    understandingLevel: 'understanding',
    firstSeenAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    lastSeenAt: new Date().toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-node-5',
    label: 'TypeScript',
    type: 'keyword',
    userId: 'demo-user',
    frequency: 20,
    understandingLevel: 'mastery',
    firstSeenAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-node-6',
    label: 'Supabase',
    type: 'keyword',
    userId: 'demo-user',
    frequency: 7,
    understandingLevel: 'understanding',
    firstSeenAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-node-7',
    label: '佐藤花子',
    type: 'person',
    userId: 'demo-user',
    frequency: 3,
    understandingLevel: 'recognition',
    firstSeenAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    sourceContexts: [],
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const weekStart = searchParams.get('weekStart');

  if (!weekStart) {
    return NextResponse.json(
      { success: false, error: 'weekStart is required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  // デモモード
  if (!supabase) {
    // デモ用: localStorageの代わりにセッション内で未確認扱い
    const response: WeeklyNodesResponse = {
      nodes: demoNodes,
      weekStart,
      alreadyConfirmed: false,
    };
    return NextResponse.json({ success: true, data: response });
  }

  try {
    // 1. 今週すでに確認済みかチェック
    const { data: confirmation } = await supabase
      .from('weekly_node_confirmations')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .single();

    if (confirmation) {
      const response: WeeklyNodesResponse = {
        nodes: [],
        weekStart,
        alreadyConfirmed: true,
      };
      return NextResponse.json({ success: true, data: response });
    }

    // 2. 今週触れたノードを取得（last_seen_at >= weekStart）
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data: nodes, error } = await supabase
      .from('user_nodes')
      .select('*')
      .eq('user_id', userId)
      .gte('last_seen_at', weekStart)
      .lt('last_seen_at', weekEnd.toISOString().split('T')[0])
      .order('frequency', { ascending: false })
      .limit(30); // 最大30件

    if (error) throw error;

    // snake_case → camelCase変換
    const mappedNodes: NodeData[] = (nodes || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      label: row.label as string,
      type: row.type as NodeData['type'],
      userId: row.user_id as string,
      frequency: row.frequency as number,
      understandingLevel: row.understanding_level as NodeData['understandingLevel'],
      firstSeenAt: row.first_seen_at as string,
      lastSeenAt: row.last_seen_at as string,
      sourceContexts: [],
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      masterEntryId: row.master_entry_id as string | undefined,
      domainId: row.domain_id as string | undefined,
      fieldId: row.field_id as string | undefined,
      contactId: row.contact_id as string | undefined,
      relationshipType: row.relationship_type as NodeData['relationshipType'],
      userConfirmed: row.user_confirmed as boolean | undefined,
      confirmedAt: row.confirmed_at as string | undefined,
    }));

    const response: WeeklyNodesResponse = {
      nodes: mappedNodes,
      weekStart,
      alreadyConfirmed: false,
    };
    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    console.error('Weekly nodes fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weekly nodes' },
      { status: 500 }
    );
  }
}
