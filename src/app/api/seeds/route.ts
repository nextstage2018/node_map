import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateSeedRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';

// 種一覧取得（pending のみ）
export async function GET() {
  try {
    // Phase 22: 認証確認
    await getServerUserId();
    const seeds = await TaskService.getSeeds();
    return NextResponse.json({ success: true, data: seeds });
  } catch (error) {
    console.error('種取得エラー:', error);
    return NextResponse.json(
      { success: false, error: '種の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 種を作成
export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証ユーザーIDを付与
    const userId = await getServerUserId();
    const body: CreateSeedRequest = await request.json();
    if (!body.content || body.content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '内容を入力してください' },
        { status: 400 }
      );
    }
    const seed = await TaskService.createSeed({ ...body, userId } as any);
    return NextResponse.json({ success: true, data: seed });
  } catch (error) {
    console.error('種作成エラー:', error);
    return NextResponse.json(
      { success: false, error: '種の作成に失敗しました' },
      { status: 500 }
    );
  }
}
