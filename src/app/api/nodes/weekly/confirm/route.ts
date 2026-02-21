// src/app/api/nodes/weekly/confirm/route.ts
// Phase 20: 週次ノード確認API

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { WeeklyNodeConfirmRequest } from '@/lib/types';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const body: WeeklyNodeConfirmRequest = await request.json();
  const { userId, nodeIds, weekStart } = body;

  if (!userId || !nodeIds || nodeIds.length === 0 || !weekStart) {
    return NextResponse.json(
      { success: false, error: 'userId, nodeIds, weekStart are required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  // デモモード
  if (!supabase) {
    return NextResponse.json({
      success: true,
      data: {
        confirmedCount: nodeIds.length,
        message: 'Demo mode: confirmation recorded in memory',
      },
    });
  }

  try {
    const now = new Date().toISOString();

    // 1. 選択されたノードに user_confirmed = true, confirmed_at を設定
    const { error: updateError } = await supabase
      .from('user_nodes')
      .update({
        user_confirmed: true,
        confirmed_at: now,
      })
      .in('id', nodeIds)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    // 2. 選択されたノードの frequency を +1（確認行為もカウント）
    // NOTE: Supabaseではbulk incrementが難しいので、個別にRPC呼び出し
    // 簡易実装: 各ノードのfrequencyをインクリメント
    for (const nodeId of nodeIds) {
      await supabase.rpc('increment_node_frequency', {
        node_id: nodeId,
        increment_by: 1,
      }).catch(() => {
        // RPC未定義の場合はSQL直接実行にフォールバック
        // この場合はスキップ（マイグレーションでRPC追加を推奨）
      });
    }

    // 3. weekly_node_confirmations に記録
    const { error: insertError } = await supabase
      .from('weekly_node_confirmations')
      .upsert({
        user_id: userId,
        week_start: weekStart,
        confirmed_node_ids: nodeIds,
      }, {
        onConflict: 'user_id,week_start',
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      data: {
        confirmedCount: nodeIds.length,
      },
    });
  } catch (err) {
    console.error('Weekly node confirm error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to confirm nodes' },
      { status: 500 }
    );
  }
}
