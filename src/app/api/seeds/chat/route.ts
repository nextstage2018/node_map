// Phase 31: 種AI会話 API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: 種の内容をコンテキストにしたAI会話
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
    const { seedId, message, history } = body;

    if (!seedId || !message) {
      return NextResponse.json(
        { success: false, error: 'seedIdとmessageは必須です' },
        { status: 400 }
      );
    }

    // Claude APIキーの確認
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // デモモード: APIキー未設定時はデモ応答
      return NextResponse.json({
        success: true,
        data: {
          reply: `【デモ応答】「${message}」について考えてみましょう。\n\nこの種のアイデアを具体化するには、まず目的を明確にし、次に必要なステップを洗い出すことが重要です。何か気になる点はありますか？`,
        },
      });
    }

    // 会話履歴を構築（最新10件まで）
    const conversationHistory = (history || []).slice(-10).map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // 今回のユーザーメッセージを追加
    conversationHistory.push({ role: 'user' as const, content: message });

    // Phase 31: 種の内容をシステムプロンプトに含めてClaude APIで応答
    const systemPrompt = `あなたはアイデア整理の専門家です。ユーザーが記録した「種（アイデアのメモ）」を一緒に深掘りし、具体的なアクションに落とし込む手助けをします。

以下のルールに従ってください:
- 日本語で簡潔に回答する
- ユーザーのアイデアを否定せず、建設的にフィードバックする
- 必要に応じて以下の観点で整理を促す: 目的（何のために）、内容（何をするか）、懸念点（気になること）、期限（いつまでに）
- 質問は一度に1-2個にとどめる
- 回答は200文字以内を目安にする

種の内容: "${body.seedContent || '（未取得）'}"`;

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

    return NextResponse.json({
      success: true,
      data: { reply },
    });
  } catch (error) {
    console.error('[Seeds Chat API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI応答の生成に失敗しました' },
      { status: 500 }
    );
  }
}
