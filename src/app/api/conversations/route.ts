// Phase 42f残り: 会話ジャンプ用の会話取得API
// GET ?turnId=xxx → seed_conversations / task_conversations から該当ターンの前後を返す
// GET ?seedId=xxx&around=timestamp → 指定時刻付近の会話を返す（フォールバック）
// GET ?taskId=xxx&around=timestamp → 同上

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const viewerId = await getServerUserId();
    if (!viewerId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const turnId = searchParams.get('turnId');
    const seedId = searchParams.get('seedId');
    const taskId = searchParams.get('taskId');
    const around = searchParams.get('around'); // ISO timestamp

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ success: false, error: 'DB接続エラー' }, { status: 500 });
    }

    // turnId 指定: seed_conversations と task_conversations の両方を探索
    if (turnId) {
      // まず seed_conversations を検索
      const { data: seedConvs } = await sb
        .from('seed_conversations')
        .select('*')
        .eq('turn_id', turnId)
        .order('created_at', { ascending: true });

      if (seedConvs && seedConvs.length > 0) {
        // 同じ seed_id の前後の会話も取得（コンテキスト用）
        const targetSeedId = seedConvs[0].seed_id;
        const targetTime = seedConvs[0].created_at;

        const { data: context } = await sb
          .from('seed_conversations')
          .select('*')
          .eq('seed_id', targetSeedId)
          .order('created_at', { ascending: true });

        return NextResponse.json({
          success: true,
          data: {
            source: 'seed',
            sourceId: targetSeedId,
            targetTurnId: turnId,
            targetTime,
            conversations: (context || []).map(formatConversation),
          },
        });
      }

      // task_conversations を検索
      const { data: taskConvs } = await sb
        .from('task_conversations')
        .select('*')
        .eq('turn_id', turnId)
        .order('created_at', { ascending: true });

      if (taskConvs && taskConvs.length > 0) {
        const targetTaskId = taskConvs[0].task_id;
        const targetTime = taskConvs[0].created_at;

        const { data: context } = await sb
          .from('task_conversations')
          .select('*')
          .eq('task_id', targetTaskId)
          .order('created_at', { ascending: true });

        return NextResponse.json({
          success: true,
          data: {
            source: 'task',
            sourceId: targetTaskId,
            targetTurnId: turnId,
            targetTime,
            conversations: (context || []).map(formatConversation),
          },
        });
      }

      return NextResponse.json({
        success: false,
        error: '指定された会話ターンが見つかりません',
      }, { status: 404 });
    }

    // seedId + around: 時刻ベースのフォールバック検索
    if (seedId && around) {
      const { data } = await sb
        .from('seed_conversations')
        .select('*')
        .eq('seed_id', seedId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        success: true,
        data: {
          source: 'seed',
          sourceId: seedId,
          targetTime: around,
          conversations: (data || []).map(formatConversation),
        },
      });
    }

    // taskId + around: 時刻ベースのフォールバック検索
    if (taskId && around) {
      const { data } = await sb
        .from('task_conversations')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        success: true,
        data: {
          source: 'task',
          sourceId: taskId,
          targetTime: around,
          conversations: (data || []).map(formatConversation),
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'turnId または seedId/taskId + around パラメータが必要です' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Conversations API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '会話の取得に失敗しました' },
      { status: 500 }
    );
  }
}

function formatConversation(row: any) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    turnId: row.turn_id || null,
    phase: row.phase || null,
    conversationTag: row.conversation_tag || null,
    createdAt: row.created_at,
  };
}
