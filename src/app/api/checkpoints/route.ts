import { NextResponse } from 'next/server';
import { CheckpointService } from '@/services/nodemap/checkpoint.service';
import { getServerUserId } from '@/lib/serverAuth';

// GET: チェックポイント一覧取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId') || undefined;
  // Phase 22: 認証ユーザーIDを使用
  const userId = await getServerUserId();

  const checkpoints = await CheckpointService.getCheckpoints(taskId, userId);
  return NextResponse.json(checkpoints);
}

// POST: チェックポイント追加
export async function POST(request: Request) {
  // Phase 22: 認証ユーザーIDを使用
  const userId = await getServerUserId();
  const body = await request.json();
  const { taskId, nodeIds, source, summary } = body;

  if (!taskId || !nodeIds) {
    return NextResponse.json({ error: 'taskId, nodeIds are required' }, { status: 400 });
  }

  const checkpoint = await CheckpointService.addCheckpoint(
    taskId,
    userId,
    nodeIds,
    source || 'manual',
    summary
  );

  return NextResponse.json(checkpoint);
}
