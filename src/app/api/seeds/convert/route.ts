// Phase 31: 種の変換 API（ナレッジ or タスクに変換）
// Phase 40c: タスク変換時にTaskServiceを使用（RLS対応）
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

export const dynamic = 'force-dynamic';

// POST: 種をナレッジまたはタスクに変換
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { seedId, targetType, projectId } = body;

    if (!seedId || !targetType) {
      return NextResponse.json(
        { success: false, error: 'seedIdとtargetTypeは必須です' },
        { status: 400 }
      );
    }

    if (targetType !== 'knowledge' && targetType !== 'task') {
      return NextResponse.json(
        { success: false, error: 'targetTypeは knowledge または task を指定してください' },
        { status: 400 }
      );
    }

    // 種を取得
    const { data: seed, error: seedError } = await supabase
      .from('seeds')
      .select('*')
      .eq('id', seedId)
      .single();

    if (seedError || !seed) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    let result = null;

    if (targetType === 'knowledge') {
      // Phase 31: ナレッジパイプラインでキーワード抽出→ノード登録
      try {
        const knowledgeResult = await triggerKnowledgePipeline({
          text: seed.content,
          trigger: 'seed_convert',
          sourceId: seed.id,
          sourceType: 'seed',
          direction: 'self',
          userId,
        });
        result = {
          type: 'knowledge',
          keywords: knowledgeResult?.keywords || [],
          newKeywords: knowledgeResult?.newKeywords || [],
          nodeCount: knowledgeResult?.nodeCount || 0,
        };
      } catch (e) {
        console.error('[Seeds Convert API] ナレッジパイプラインエラー:', e);
        result = { type: 'knowledge', keywords: [], newKeywords: [], nodeCount: 0 };
      }
    } else {
      // Phase 40c: タスクに変換（TaskService経由 — RLS整合性を保証）
      const taskProjectId = projectId || seed.project_id;

      try {
        const task = await TaskService.createTask({
          title: seed.content.slice(0, 60),
          description: seed.content,
          priority: 'medium',
          seedId: seed.id,
          projectId: taskProjectId || undefined,
          userId,  // TaskService.createTask が (req as any).userId で取得
        } as any);

        result = { type: 'task', task };
      } catch (taskError) {
        console.error('[Seeds Convert API] タスク作成エラー:', taskError);
        return NextResponse.json(
          { success: false, error: 'タスクの作成に失敗しました' },
          { status: 500 }
        );
      }
    }

    // 種のステータスを confirmed に更新
    const { error: updateError } = await supabase
      .from('seeds')
      .update({ status: 'confirmed' })
      .eq('id', seedId);

    if (updateError) {
      console.error('[Seeds Convert API] 種ステータス更新エラー:', updateError);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Seeds Convert API] エラー:', error);
    return NextResponse.json(
      { success: false, error: '変換に失敗しました' },
      { status: 500 }
    );
  }
}
