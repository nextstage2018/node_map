// Phase 28: 種（Seed）API — ナレッジパイプライン統合
// POST時にパイプラインを呼び出してキーワード抽出→ナレッジ登録
// Phase 40: PUT/DELETE追加、createSeed引数修正

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

// 種一覧取得
export async function GET() {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const seeds = await TaskService.getSeeds(userId);
    return NextResponse.json({ success: true, data: seeds });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の取得エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 種作成 + ナレッジパイプライン
export async function POST(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json(
        { success: false, error: '内容は必須です' },
        { status: 400 }
      );
    }

    // Phase 40: オブジェクト引数で渡す（createSeedのシグネチャに合わせる）
    const seed = await TaskService.createSeed({
      content: body.content,
      sourceChannel: body.sourceChannel,
      sourceMessageId: body.sourceMessageId,
      userId,
    });

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
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の作成エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の作成に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40: 種の更新
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const body = await request.json();
    if (!body.seedId || !body.content) {
      return NextResponse.json(
        { success: false, error: 'seedId と content は必須です' },
        { status: 400 }
      );
    }

    const updated = await TaskService.updateSeed(body.seedId, body.content, body.tags);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の更新エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 40: 種の削除
export async function DELETE(request: NextRequest) {
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
        { success: false, error: 'seedId は必須です' },
        { status: 400 }
      );
    }

    const deleted = await TaskService.deleteSeed(seedId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Seeds API] 種の削除エラー:', message);
    return NextResponse.json(
      { success: false, error: '種の削除に失敗しました' },
      { status: 500 }
    );
  }
}
