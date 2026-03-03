// Phase 51a: メモ→種変換API
// メモの内容 + AI会話履歴を種に引き継ぎ

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { TaskService } from '@/services/task/taskClient.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: memoId } = await params;
    const body = await request.json();
    const { projectId } = body;

    const sb = getServerSupabase() || getSupabase();

    // 1. メモ本体を取得
    const { data: memo, error: memoError } = await sb
      .from('idea_memos')
      .select('*')
      .eq('id', memoId)
      .eq('user_id', userId)
      .single();

    if (memoError || !memo) {
      return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 });
    }

    // 2. メモのAI会話履歴を取得
    const { data: conversations } = await sb
      .from('memo_conversations')
      .select('role, content, created_at')
      .eq('memo_id', memoId)
      .order('created_at', { ascending: true });

    // 3. 会話履歴からコンテキストを構築
    let seedContent = memo.content;
    if (conversations && conversations.length > 0) {
      const conversationSummary = conversations
        .map((c: { role: string; content: string }) =>
          `${c.role === 'user' ? 'ユーザー' : 'AI'}: ${c.content.slice(0, 200)}`
        )
        .join('\n');

      // AI要約を試みる
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 400,
            system: `あなたはアイデアメモの内容をアクション可能な「種」に変換する専門家です。
メモの内容とAI会話の履歴を踏まえて、以下のフォーマットで種を生成してください:

【アイデア概要】1行で何のアイデアか
【深掘りで得た洞察】AI会話で明らかになったポイント（2-3行）
【次のアクション】具体的なTODO（箇条書き）

ルール: 日本語で簡潔に、合計200文字以内`,
            messages: [{
              role: 'user',
              content: `メモ:\n${memo.content}\n\nAI会話:\n${conversationSummary}`,
            }],
          });
          const text = response.content[0]?.type === 'text' ? response.content[0].text : null;
          if (text) seedContent = text;
        } catch (e) {
          console.error('[Memo Convert] AI要約エラー（フォールバック）:', e);
          seedContent = `${memo.content}\n\n--- AI会話からの洞察 ---\n${conversationSummary.slice(0, 500)}`;
        }
      } else {
        seedContent = `${memo.content}\n\n--- AI会話からの洞察 ---\n${conversationSummary.slice(0, 500)}`;
      }
    }

    // 4. 種を作成（memo_id付き）
    const seed = await TaskService.createSeed({
      content: seedContent,
      sourceFrom: 'アイデアメモ',
      projectId: projectId || null,
      userId,
    });

    // 5. memo_id をバックリンクとして設定
    await sb
      .from('seeds')
      .update({ memo_id: memoId })
      .eq('id', seed.id);

    return NextResponse.json({
      success: true,
      data: { seed, memoId },
    });
  } catch (error) {
    console.error('[Memo Convert] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
