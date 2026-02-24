import { NextRequest, NextResponse } from 'next/server';
import { AiDraftRequest } from '@/lib/types';
import { generateReplyDraft } from '@/services/ai/aiClient.service';
import { getServerUserId } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const body: AiDraftRequest = await request.json();
    const { originalMessage, instruction } = body;

    const result = await generateReplyDraft(originalMessage, instruction);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('AI下書き生成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI下書きの生成に失敗しました' },
      { status: 500 }
    );
  }
}
