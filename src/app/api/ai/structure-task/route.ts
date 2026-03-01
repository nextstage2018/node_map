import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/ai/structure-task
 * インボックスメッセージの内容からAIがタスク情報を構造化する
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel, from, subject, body, timestamp } = await request.json();
    if (!body) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }

    const anthropic = new Anthropic();
    const messageContent = `
チャネル: ${channel || '不明'}
送信者: ${from || '不明'}
件名: ${subject || 'なし'}
日時: ${timestamp || '不明'}
本文:
${body.slice(0, 2000)}
`.trim();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: `あなたはビジネスメッセージからタスク情報を構造化するアシスタントです。
メッセージの内容を分析し、タスクとして登録するための情報をJSON形式で返してください。

必ず以下のJSON形式で返してください（他のテキストは不要）:
{
  "title": "タスクのタイトル（30文字以内、具体的に）",
  "goal": "このタスクのゴール（何を達成すべきか）",
  "description": "タスクの詳細（メッセージの要点を整理）",
  "priority": "high | medium | low",
  "deadline": "推定期限（YYYY-MM-DD形式、不明なら空文字）",
  "concerns": "懸念事項や確認が必要なこと（なければ空文字）"
}`,
      messages: [
        {
          role: 'user',
          content: `以下のメッセージからタスク情報を構造化してください:\n\n${messageContent}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // JSONパース（コードブロック除去）
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let structured;
    try {
      structured = JSON.parse(cleaned);
    } catch {
      structured = {
        title: subject || body.slice(0, 50),
        goal: '',
        description: body.slice(0, 500),
        priority: 'medium',
        deadline: '',
        concerns: '',
      };
    }

    return NextResponse.json({ success: true, data: structured });
  } catch (error) {
    console.error('AI構造化エラー:', error);
    return NextResponse.json(
      { error: 'タスクの構造化に失敗しました' },
      { status: 500 }
    );
  }
}
