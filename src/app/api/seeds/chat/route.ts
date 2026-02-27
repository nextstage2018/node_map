// Phase 31: 種AI会話 API
// Phase 40b: 会話ログのDB永続化（GET: 履歴取得、POST: 送信＋保存）
// Phase 42a: AI会話からのキーワード自動抽出 → ナレッジマスタ登録 → thought_task_nodes紐づけ
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { ThoughtNodeService } from '@/services/nodemap/thoughtNode.service';

export const dynamic = 'force-dynamic';

// GET: 種の会話履歴を取得
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const seedId = searchParams.get('seedId');
    if (!seedId) {
      return NextResponse.json(
        { success: false, error: 'seedIdは必須です' },
        { status: 400 }
      );
    }

    const sb = getServerSupabase() || getSupabase();
    if (!sb) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await sb
      .from('seed_conversations')
      .select('*')
      .eq('seed_id', seedId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Seeds Chat API] 履歴取得エラー:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    const messages = (data || []).map((row: any) => ({
      role: row.role,
      content: row.content,
    }));

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    console.error('[Seeds Chat API] GET エラー:', error);
    return NextResponse.json(
      { success: false, error: '会話履歴の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 種の内容をコンテキストにしたAI会話 + DB保存
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

    const sb = getServerSupabase() || getSupabase();

    // Claude APIキーの確認
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // デモモード: APIキー未設定時はデモ応答
      const demoReply = `【デモ応答】「${message}」について考えてみましょう。\n\nこの種のアイデアを具体化するには、まず目的を明確にし、次に必要なステップを洗い出すことが重要です。何か気になる点はありますか？`;

      // デモでもDB保存を試みる
      if (sb) {
        await sb.from('seed_conversations').insert([
          { seed_id: seedId, role: 'user', content: message, user_id: userId },
          { seed_id: seedId, role: 'assistant', content: demoReply, user_id: userId },
        ]).then(() => {});
      }

      return NextResponse.json({
        success: true,
        data: { reply: demoReply },
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

    // Phase 40b: 会話をDB保存（ユーザーメッセージ + AI応答）
    // Phase 42f残り: turn_id を生成して会話ジャンプに使えるようにする
    const turnId = crypto.randomUUID();
    if (sb) {
      try {
        await sb.from('seed_conversations').insert([
          { seed_id: seedId, role: 'user', content: message, user_id: userId, turn_id: turnId },
          { seed_id: seedId, role: 'assistant', content: reply, user_id: userId, turn_id: turnId },
        ]);
      } catch (e) {
        console.error('[Seeds Chat API] 会話保存エラー（応答は正常）:', e);
      }
    }

    // Phase 42a: AI会話からキーワード自動抽出 → ナレッジマスタ登録 → thought_task_nodes紐づけ
    // ※ Vercelではレスポンス後の非同期処理が打ち切られるためawaitで実行
    // Phase 42f残り: conversationId を渡して会話ジャンプを可能にする
    try {
      console.log(`[Seeds Chat] ThoughtNode抽出開始: seedId=${seedId}, userId=${userId}`);
      const thoughtResult = await ThoughtNodeService.extractAndLink({
        text: `${message}\n\n${reply}`,
        userId,
        seedId,
        phase: 'seed',
        conversationId: turnId,
      });
      console.log(`[Seeds Chat] ThoughtNode抽出完了: keywords=${thoughtResult.extractedKeywords.length}, nodes=${thoughtResult.linkedNodes.length}, edges=${thoughtResult.edges.length}, newEntries=${thoughtResult.newMasterEntries.length}`);
    } catch (e) {
      console.error('[Seeds Chat] キーワード抽出エラー（応答は正常）:', e);
    }

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
