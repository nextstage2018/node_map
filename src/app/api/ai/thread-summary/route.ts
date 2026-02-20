import { NextRequest, NextResponse } from 'next/server';
import { ThreadMessage } from '@/lib/types';
import { generateThreadSummary } from '@/services/ai/aiClient.service';
import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const body: { messageId: string; subject: string; threadMessages: ThreadMessage[] } = await request.json();
    const { messageId, subject, threadMessages } = body;

    if (!threadMessages || threadMessages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'スレッドメッセージが空です' },
        { status: 400 }
      );
    }

    // キャッシュチェック
    if (messageId) {
      const cached = cache.get<string>(CACHE_KEYS.threadSummary(messageId));
      if (cached) {
        return NextResponse.json({
          success: true,
          data: { summary: cached, cached: true },
        });
      }
    }

    const summary = await generateThreadSummary(subject, threadMessages);

    // キャッシュに保存
    if (messageId) {
      cache.set(CACHE_KEYS.threadSummary(messageId), summary, CACHE_TTL.threadSummary);
    }

    return NextResponse.json({
      success: true,
      data: { summary, cached: false },
    });
  } catch (error) {
    console.error('スレッド要約エラー:', error);
    return NextResponse.json(
      { success: false, error: 'スレッド要約の生成に失敗しました' },
      { status: 500 }
    );
  }
}
