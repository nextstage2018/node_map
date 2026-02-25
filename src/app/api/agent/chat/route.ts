// Phase 32: パーソナル秘書エージェント チャットAPI
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST: 秘書エージェントとの会話
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'messageは必須です' },
        { status: 400 }
      );
    }

    // Phase 32: ユーザーのデータをSupabaseから取得してコンテキスト構築
    let contextSummary = '';
    const supabase = createServerClient();
    if (supabase && isSupabaseConfigured()) {
      const [tasksRes, seedsRes, nodesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('title, status, priority, due_date')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('seeds')
          .select('content, status, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('user_nodes')
          .select('label, type')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      const tasks = tasksRes.data || [];
      const seeds = seedsRes.data || [];
      const nodes = nodesRes.data || [];

      if (tasks.length > 0) {
        const taskLines = tasks.map(
          (t: { title: string; status: string; priority: string; due_date?: string }) =>
            `- [${t.status}] ${t.title}（優先度: ${t.priority}${t.due_date ? ', 期限: ' + t.due_date : ''}）`
        );
        contextSummary += `\n\n【タスク一覧（最新${tasks.length}件）】\n${taskLines.join('\n')}`;
      }

      if (seeds.length > 0) {
        const seedLines = seeds.map(
          (s: { content: string; status: string }) =>
            `- [${s.status}] ${s.content.slice(0, 80)}`
        );
        contextSummary += `\n\n【種（アイデアメモ）一覧（最新${seeds.length}件）】\n${seedLines.join('\n')}`;
      }

      if (nodes.length > 0) {
        const nodeLines = nodes.map(
          (n: { label: string; type: string }) => `- ${n.label}（${n.type}）`
        );
        contextSummary += `\n\n【ナレッジノード（最新${nodes.length}件）】\n${nodeLines.join('\n')}`;
      }
    }

    // Claude APIキーの確認
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // デモモード
      return NextResponse.json({
        success: true,
        data: {
          reply: `【デモ応答】「${message}」について確認しました。\n\n現在デモモードで動作しています。本番環境ではANTHROPIC_API_KEYを設定すると、タスク・種・ナレッジを踏まえた秘書応答が利用できます。`,
        },
      });
    }

    // 会話履歴を構築（最新15件まで）
    const conversationHistory = (history || []).slice(-15).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    );
    conversationHistory.push({ role: 'user' as const, content: message });

    // Phase 32: システムプロンプト（秘書エージェント用）
    const systemPrompt = `あなたはNodeMapのパーソナル秘書です。ユーザーのタスク・種・ナレッジを把握し、質問応答・タスク提案・情報整理をサポートします。

以下のルールに従ってください:
- 日本語で簡潔に回答する
- ユーザーのタスク状況やアイデアを踏まえた具体的なアドバイスをする
- タスクの優先順位付けや、次にやるべきことの提案ができる
- 種（アイデアメモ）の整理や具体化のサポートができる
- ナレッジの関連性を見つけて提案できる
- 回答は300文字以内を目安にする
- 必要に応じて箇条書きで整理する
${contextSummary}`;

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : '応答を生成できませんでした';

    return NextResponse.json({
      success: true,
      data: { reply },
    });
  } catch (error) {
    console.error('[Agent Chat API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '秘書応答の生成に失敗しました' },
      { status: 500 }
    );
  }
}
