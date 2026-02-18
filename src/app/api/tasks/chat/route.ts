import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { generateTaskChat, generateTaskSummary } from '@/services/ai/aiClient.service';
import { TaskAiChatRequest } from '@/lib/types';

// タスクAI会話
export async function POST(request: NextRequest) {
  try {
    const body: TaskAiChatRequest = await request.json();

    if (!body.taskId || !body.message || !body.phase) {
      return NextResponse.json(
        { success: false, error: 'taskId, message, phaseは必須です' },
        { status: 400 }
      );
    }

    // タスク取得
    const task = await TaskService.getTask(body.taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // ユーザーメッセージを保存
    await TaskService.addConversation(body.taskId, {
      role: 'user',
      content: body.message,
      phase: body.phase,
    });

    // AI応答を生成
    const response = await generateTaskChat(
      task,
      body.message,
      body.phase,
      task.conversations
    );

    // AI応答を保存
    await TaskService.addConversation(body.taskId, {
      role: 'assistant',
      content: response.reply,
      phase: body.phase,
    });

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('タスクAI会話エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI会話の処理に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク要約生成（結果フェーズ）
export async function PUT(request: NextRequest) {
  try {
    const body: { taskId: string } = await request.json();

    const task = await TaskService.getTask(body.taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    const summary = await generateTaskSummary(task);

    // タスクに要約を保存
    await TaskService.updateTask(body.taskId, { resultSummary: summary });

    return NextResponse.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('要約生成エラー:', error);
    return NextResponse.json(
      { success: false, error: '要約の生成に失敗しました' },
      { status: 500 }
    );
  }
}
