import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/ai/structure-job
 * インボックスメッセージの内容からAIがジョブ情報を構造化する
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channel, from, subject, body, jobType } = await request.json();
    if (!body) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }

    const anthropic = new Anthropic();
    const jobTypeLabel: Record<string, string> = {
      schedule: '日程調整',
      reply_later: 'あとで返信',
      check: '要確認',
      other: 'その他',
    };

    const messageContent = `
チャネル: ${channel || '不明'}
送信者: ${from || '不明'}
件名: ${subject || 'なし'}
本文:
${body.slice(0, 1000)}
`.trim();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 512,
      system: `あなたはビジネスメッセージからジョブ（簡易タスク）を作成するアシスタントです。
ジョブの種別は「${jobTypeLabel[jobType] || 'その他'}」です。

メッセージの内容を分析し、ジョブのタイトルと説明を生成してください。
必ず以下のJSON形式で返してください:
{
  "title": "ジョブのタイトル（簡潔に、20文字以内）",
  "description": "やるべきことの要約（50文字以内）"
}

種別ごとのタイトル例:
- 日程調整: 「○○さんと日程調整」
- あとで返信: 「○○さんへ返信」
- 要確認: 「○○の件を確認」
- その他: メッセージの要点`,
      messages: [
        {
          role: 'user',
          content: `以下のメッセージからジョブ情報を生成してください:\n\n${messageContent}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let structured;
    try {
      structured = JSON.parse(cleaned);
    } catch {
      const senderName = from || '送信者';
      const titles: Record<string, string> = {
        schedule: `${senderName}と日程調整`,
        reply_later: `${senderName}へ返信`,
        check: `${subject || 'メッセージ'}を確認`,
        other: subject || body.slice(0, 20),
      };
      structured = {
        title: titles[jobType] || body.slice(0, 20),
        description: body.slice(0, 50),
      };
    }

    return NextResponse.json({ success: true, data: structured });
  } catch (error) {
    console.error('AIジョブ構造化エラー:', error);
    return NextResponse.json(
      { error: 'ジョブの構造化に失敗しました' },
      { status: 500 }
    );
  }
}
