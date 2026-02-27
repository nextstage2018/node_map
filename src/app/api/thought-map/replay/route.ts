// Phase 42h: リプレイ（AI対話）モードAPI
// 完了済みタスクの思考を再現し、過去の意思決定についてAIに質問できる
//
// POST /api/thought-map/replay
// body: { taskId, message, conversationHistory }
// → { success: true, data: { reply: string } }

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const viewerId = await getServerUserId();
    if (!viewerId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { taskId, message, conversationHistory } = body;

    if (!taskId || !message) {
      return NextResponse.json(
        { success: false, error: 'taskId と message が必要です' },
        { status: 400 }
      );
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json(
        { success: false, error: 'DB接続エラー' },
        { status: 500 }
      );
    }

    // タスク情報を取得
    const { data: task } = await sb
      .from('tasks')
      .select('id, title, description, status, phase, goal, ideation_summary, result_summary, created_at, updated_at')
      .eq('id', taskId)
      .maybeSingle();

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // タスクの会話履歴を取得
    const { data: conversations } = await sb
      .from('task_conversations')
      .select('role, content, phase, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
      .limit(50);

    // スナップショットを取得
    const { data: snapshots } = await sb
      .from('thought_snapshots')
      .select('snapshot_type, summary, node_ids, created_at')
      .eq('task_id', taskId);

    // ノード情報を取得
    const { data: nodeRows } = await sb
      .from('thought_task_nodes')
      .select('node_id, appear_phase, appear_order, is_main_route, knowledge_master_entries(label)')
      .eq('task_id', taskId)
      .order('appear_order', { ascending: true });

    // コンテキストの構築
    const taskContext = buildTaskContext(task, conversations || [], snapshots || [], nodeRows || []);

    // Claude APIで応答生成
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'AI APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const systemPrompt = `あなたは「思考リプレイ」のガイドです。
以下は、あるユーザーが過去に取り組んだタスクの記録です。
この記録を元に、ユーザーの過去の思考プロセスや意思決定について質問に答えてください。

## タスクの記録
${taskContext}

## あなたの役割
- ユーザーの過去の思考プロセスを分析し、質問に対して洞察を提供する
- 「なぜこの判断をしたのか」「他にどんな選択肢があったか」などの振り返りを支援する
- 思考の変遷（初期ゴール→着地点）について説明する
- 会話の流れから読み取れるパターンや気づきを共有する
- 簡潔で具体的に回答する（日本語で）`;

    // 会話履歴をメッセージ形式に変換
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }
    messages.push({ role: 'user', content: message });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('');

    return NextResponse.json({
      success: true,
      data: { reply },
    });
  } catch (error) {
    console.error('[Replay API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'リプレイ応答の生成に失敗しました' },
      { status: 500 }
    );
  }
}

function buildTaskContext(
  task: any,
  conversations: any[],
  snapshots: any[],
  nodeRows: any[]
): string {
  const parts: string[] = [];

  // タスク基本情報
  parts.push(`### タスク: ${task.title}`);
  if (task.description) parts.push(`説明: ${task.description}`);
  if (task.goal) parts.push(`ゴール: ${task.goal}`);
  parts.push(`状態: ${task.status} / フェーズ: ${task.phase}`);
  parts.push(`作成: ${task.created_at} / 更新: ${task.updated_at}`);

  // 構想メモ・結果サマリー
  if (task.ideation_summary) parts.push(`\n### 構想メモ\n${task.ideation_summary}`);
  if (task.result_summary) parts.push(`\n### 結果サマリー\n${task.result_summary}`);

  // スナップショット
  const initialGoal = snapshots.find(s => s.snapshot_type === 'initial_goal');
  const finalLanding = snapshots.find(s => s.snapshot_type === 'final_landing');
  if (initialGoal) {
    parts.push(`\n### 出口想定（タスク作成時）\n${initialGoal.summary}\nノード数: ${initialGoal.node_ids?.length || 0}`);
  }
  if (finalLanding) {
    parts.push(`\n### 着地点（タスク完了時）\n${finalLanding.summary}\nノード数: ${finalLanding.node_ids?.length || 0}`);
  }

  // ノード情報
  if (nodeRows.length > 0) {
    const nodeLabels = nodeRows
      .map((r: any) => `${r.appear_order}. ${r.knowledge_master_entries?.label || r.node_id} (${r.appear_phase}${r.is_main_route ? ', メインルート' : ''})`)
      .join('\n');
    parts.push(`\n### 思考ノード（キーワード）\n${nodeLabels}`);
  }

  // 会話履歴（要約版）
  if (conversations.length > 0) {
    const convSummary = conversations
      .slice(0, 30) // 最大30件
      .map(c => `[${c.phase || '?'}] ${c.role}: ${c.content.slice(0, 200)}${c.content.length > 200 ? '...' : ''}`)
      .join('\n');
    parts.push(`\n### 会話履歴\n${convSummary}`);
  }

  return parts.join('\n');
}
