// Phase 56: 親子タスク一括作成API
import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * POST: 親タスク1件 + 子タスク複数件を一括作成
 * 子タスクはparent_task_idで親に紐づけ
 */
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
    const { parentTask, childTasks } = body;

    if (!parentTask?.title || !Array.isArray(childTasks) || childTasks.length === 0) {
      return NextResponse.json(
        { success: false, error: '親タスクと子タスクが必要です' },
        { status: 400 }
      );
    }

    // 1. 親タスク作成
    const parent = await TaskService.createTask({
      userId,
      title: parentTask.title,
      description: parentTask.description || '',
      priority: parentTask.priority || 'medium',
      projectId: parentTask.projectId || null,
      taskType: parentTask.taskType || 'personal',
      phase: 'progress',
    });

    // 2. 子タスクを親に紐づけて一括作成
    const createdChildren: string[] = [];
    for (const child of childTasks) {
      try {
        const childTask = await TaskService.createTask({
          userId,
          title: child.title,
          description: child.description || '',
          priority: child.priority || 'medium',
          projectId: child.projectId || parentTask.projectId || null,
          parentTaskId: parent.id,
          assigneeContactId: child.assigneeContactId || null,
          taskType: 'personal',
          phase: 'progress',
        });
        createdChildren.push(childTask.id);
      } catch (childErr) {
        console.error(`[TaskBatch] 子タスク作成エラー (${child.title}):`, childErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        parentTaskId: parent.id,
        childTaskIds: createdChildren,
        totalCreated: 1 + createdChildren.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[TaskBatch API] エラー:', message);
    return NextResponse.json(
      { success: false, error: 'タスク一括作成に失敗しました' },
      { status: 500 }
    );
  }
}
