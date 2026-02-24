// Phase 28: 種（Seed）API — ナレッジパイプライン統合
// POST時にパイプラインを呼び出してキーワード抽出→ナレッジ登録

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

// 種一覧取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    const seeds = await TaskService.getSeeds(userId);
    return NextResponse.json({ success: true, data: seeds });
  } catch (error) {
    console.error('種の取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '種の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 種作成 + ナレッジパイプライン
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json(
        { success: false, error: '内容は必須です' },
        { status: 400 }
      );
    }

    // 種を作成
    const seed = await TaskService.createSeed(
      body.content,
      body.sourceChannel,
      body.sourceMessageId,
      userId
    );

    // Phase 28: ナレッジパイプライン実行（await で確実に完了させる）
    let knowledgeResult = null;
    try {
      knowledgeResult = await triggerKnowledgePipeline({
        text: body.content,
        trigger: 'seed',
        sourceId: seed.id,
        sourceType: 'seed',
        direction: 'self',
        userId,
      });
    } catch (e) {
      console.error('[Seeds API] ナレッジパイプラインエラー（種作成は成功）:', e);
    }

    return NextResponse.json({
      success: true,
      data: seed,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
        nodeCount: knowledgeResult.nodeCount,
      } : null,
    });
  } catch (error) {
    console.error('種の作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '種の作成に失敗しました' },
      { status: 500 }
    );
  }
}
