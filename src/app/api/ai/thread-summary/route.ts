import { NextRequest, NextResponse } from 'next/server';
import { ThreadMessage } from '@/lib/types';
import { generateThreadSummary } from '@/services/ai/aiClient.service';

export async function POST(request: NextRequest) {
  try {
    const body: { subject: string; threadMessages: ThreadMessage[] } = await request.json();
    const { subject, threadMessages } = body;

    if (!threadMessages || threadMessages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'スレッドメッセージが空です' },
        { status: 400 }
      );
    }

    const summary = await generateThreadSummary(subject, threadMessages);

    return NextResponse.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    console.error('スレッド要約エラー:', error);
    return NextResponse.json(
      { success: false, error: 'スレッド要約の生成に失敗しました' },
      { status: 500 }
    );
  }
}
