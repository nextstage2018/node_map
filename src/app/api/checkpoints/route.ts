import { NextResponse } from 'next/server';
import { CheckpointService } from '@/services/nodemap/checkpoint.service';

// GET: チェックポイント一覧取得
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId') || undefined;
  const userId = searchParams.get('userId') || undefined;

  const checkpoints = await CheckpointService.getCheckpoints(taskId, userId);
  return NextResponse.json(checkpoints);
}

// POST: チェックポイント追加
export async function POST(request: Request) {
  const body = await request.json();
  const { taskId, userId, nodeIds, source, summary } = body;

  if (!taskId || !userId || !nodeIds) {
    return NextResponse.json({ error: 'taskId, userId, nodeIds are required' }, { status: 400 });
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
