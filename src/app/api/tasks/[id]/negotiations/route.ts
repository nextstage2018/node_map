// Phase 56c: タスク修正提案 GET/POST API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { TaskNegotiationService } from '@/services/task/taskNegotiation.service';

export const dynamic = 'force-dynamic';

// GET: タスクの交渉状態を取得
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const status = await TaskNegotiationService.getNegotiationStatus(taskId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('GET /api/tasks/[id]/negotiations error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: 修正リクエスト作成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const body = await request.json();

    const { requesterContactId, requesterName, changeType, currentValue, proposedValue, reason } = body;

    if (!requesterName || !changeType || !proposedValue) {
      return NextResponse.json({ error: 'requesterName, changeType, proposedValue are required' }, { status: 400 });
    }

    const result = await TaskNegotiationService.createRequest(taskId, userId, {
      requesterContactId,
      requesterName,
      changeType,
      currentValue,
      proposedValue,
      reason,
    });

    if (!result) {
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('POST /api/tasks/[id]/negotiations error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
