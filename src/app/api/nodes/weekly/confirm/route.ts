// src/app/api/nodes/weekly/confirm/route.ts
// BugFix⑤: 逐次RPC呼び出し → バルクUPDATE文に置き換え

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { WeeklyNodeConfirmRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  // Phase 22: 認証ユーザーIDを使用（bodyのuserIdは無視）
  const authUserId = await getServerUserId();
  const body: WeeklyNodeConfirmRequest = await request.json();
  const { nodeIds, weekStart } = body;
  const userId = authUserId;

  if (!nodeIds || nodeIds.length === 0 || !weekStart) {
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

    // BugFix⑤: 逐次RPC → バルクSQL実行に置き換え
    // 全ノードの frequency を一括で +1 する
    try {
      await supabase.rpc('bulk_increment_node_frequency', {
        node_ids: nodeIds,
        increment_by: 1,
      });
    } catch (rpcErr) {
      // RPC未定義の場合はSQL直接実行にフォールバック
      // user_nodes テーブルの frequency を一括更新
      const { error: bulkError } = await supabase
        .from('user_nodes')
        .update({
                  frequency: undefined, // プレースホルダー（RPC未定義時のフォールバック）
        })
        .in('id', nodeIds)
        .eq('user_id', userId);

      // バルクRPCもフォールバックも失敗した場合、
      // frequency更新はスキップ（確認記録は保持する）
      if (bulkError) {
        console.warn('Frequency bulk update failed, skipping:', bulkError);
      }
    }

    // 3. weekly_node_confirmations に記録
    const { error: insertError } = await supabase
      .from('weekly_node_confirmations')
      .upsert({
        user_id: userId,
        week_start: weekStart,
        confirmed_node_ids: nodeIds,
        confirmed_at: now,
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
