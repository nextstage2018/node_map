// Phase 28: タスクAPI — ナレッジパイプライン統合
// タスク作成時にパイプラインを呼び出してキーワード抽出→ナレッジ登録

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateTaskRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

// タスク一覧取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    const tasks = await TaskService.getTasks(userId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    console.error('タスク取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスクの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク作成 + ナレッジパイプライン
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body: CreateTaskRequest = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const task = await TaskService.createTask({ ...body, userId });

    // Phase 28: ナレッジパイプライン実行
    let knowledgeResult = null;
    try {
      const text = `${task.title} ${task.description || ''}`;
      knowledgeResult = await triggerKnowledgePipeline({
        text,
        trigger: 'task_create',
        sourceId: task.id,
        sourceType: 'task',
        direction: 'self',
        userId,
      });
    } catch (e) {
      console.error('[Tasks API] ナレッジパイプラインエラー（タスク作成は成功）:', e);
    }

    return NextResponse.json({
      success: true,
      data: task,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
        nodeCount: knowledgeResult.nodeCount,
      } : null,
    });
  } catch (error) {
    console.error('タスク作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスクの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク更新 + 完了時にナレッジパイプライン
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'IDは必須です' },
        { status: 400 }
      );
    }

    const task = await TaskService.updateTask(body.id, body);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // Phase 28: タスク完了時にナレッジパイプライン実行
    let knowledgeResult = null;
    if (body.status === 'done' && task.resultSummary) {
      try {
        const text = `${task.title} ${task.resultSummary}`;
        knowledgeResult = await triggerKnowledgePipeline({
          text,
          trigger: 'task_complete',
          sourceId: task.id,
          sourceType: 'task',
          direction: 'self',
          userId,
        });
      } catch (e) {
        console.error('[Tasks API] ナレッジパイプラインエラー（タスク完了は成功）:', e);
      }
    }

    return NextResponse.json({
      success: true,
      data: task,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
      } : null,
    });
  } catch (error) {
    console.error('タスク更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスクの更新に失敗しました' },
      { status: 500 }
    );
  }
}
