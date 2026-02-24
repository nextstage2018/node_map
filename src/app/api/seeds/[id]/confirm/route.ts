import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { getServerUserId } from '@/lib/serverAuth';

// 種をタスクに変換（AI構造化 → タスク生成）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: '種IDは必須です' },
        { status: 400 }
      );
    }

    // まず構造化プレビューを取得
    const structured = await TaskService.getSeedStructured(id);
    if (!structured) {
      return NextResponse.json(
        { success: false, error: '種が見つかりません' },
        { status: 404 }
      );
    }

    // 種をタスクに変換
    const task = await TaskService.confirmSeed(id);
    if (!task) {
      return NextResponse.json(
        { success: false, error: '種のタスク化に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('種確認エラー:', error);
    return NextResponse.json(
      { success: false, error: '種のタスク化に失敗しました' },
      { status: 500 }
    );
  }
}
