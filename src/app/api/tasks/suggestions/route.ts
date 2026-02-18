import { NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';

// タスク提案取得
export async function GET() {
  try {
    const suggestions = await TaskService.getTaskSuggestions();
    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('タスク提案取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'タスク提案の取得に失敗しました' },
      { status: 500 }
    );
  }
}
