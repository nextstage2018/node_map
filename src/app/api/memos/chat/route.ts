// アイデアメモ AI会話 API
// Phase Restructure: メモの深掘り会話 + ナレッジノード抽出

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';

// GET: メモの会話履歴を取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memoId = searchParams.get('memoId');
    if (!memoId) {
      return NextResponse.json({ error: 'memoId is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const { data, error } = await sb
      .from('memo_conversations')
      .select('*')
      .eq('memo_id', memoId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('メモ会話取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const conversations = (data || []).map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      turnId: row.turn_id,
      timestamp: row.created_at,
    }));

    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    console.error('メモ会話取得エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: メモAI会話（深掘り）
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { memoId, message, memoContent, history } = body;

    if (!memoId || !message) {
      return NextResponse.json({ error: 'memoId and message are required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // デモ応答
      const demoReply = `「${message}」について考えてみましょう。このアイデアをもう少し具体的にしてみませんか？`;
      return NextResponse.json({ success: true, data: { reply: demoReply } });
    }

    // 会話履歴を構築（最新10件まで）
    const conversationHistory = (history || []).slice(-10).map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    conversationHistory.push({ role: 'user' as const, content: message });

    const systemPrompt = `あなたはアイデア深掘りのパートナーです。ユーザーのメモ（断片的なアイデア）を一緒に掘り下げます。

以下のルールに従ってください:
- 日本語で簡潔に回答する
- ユーザーのアイデアを否定せず、別の角度や可能性を提示する
- 質問は一度に1-2個にとどめる
- 回答は200文字以内を目安にする
- タスク化を促す必要はない（メモはメモとして自由な場所）

メモの内容: "${memoContent || '（未取得）'}"`;

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const reply = response.content[0]?.type === 'text'
      ? response.content[0].text
      : '応答を生成できませんでした';

    // 会話をDB保存
    const turnId = crypto.randomUUID();
    if (sb) {
      try {
        await sb.from('memo_conversations').insert([
          { memo_id: memoId, role: 'user', content: message, turn_id: turnId },
          { memo_id: memoId, role: 'assistant', content: reply, turn_id: turnId },
        ]);
      } catch (e) {
        console.error('[Memos Chat] 会話保存エラー:', e);
      }
    }

    // ナレッジノード抽出（メモからも知識は抽出する）
    try {
      await ThoughtNodeService.extractAndLink({
        text: `${message}\n\n${reply}`,
        userId,
        memoId,
        phase: 'seed', // メモのフェーズは seed 相当
        conversationId: turnId,
      });
    } catch (e) {
      console.error('[Memos Chat] ナレッジ抽出エラー:', e);
    }

    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error('[Memos Chat] エラー:', error);
    return NextResponse.json({ error: 'AI応答の生成に失敗しました' }, { status: 500 });
  }
}
