import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateTaskRequest, UpdateTaskRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

// タスク一覧取得（Phase 22: 認証ユーザーIDでフィルタリング）
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

// タスク作成（Phase 22: 認証ユーザーIDを付与）
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
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('タスク作成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスクの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク更新
export async function PUT(request: NextRequest) {
  try {
    const body: UpdateTaskRequest & { id: string } = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'タスクIDは必須です' },
        { status: 400 }
      );
    }

    const task = await TaskService.updateTask(id, updateData);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('タスク更新エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスクの更新に失敗しました' },
      { status: 500 }
    );
  }
}
