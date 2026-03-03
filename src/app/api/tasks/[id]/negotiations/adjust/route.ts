// Phase 56c: AI調整案生成＋承認API
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { TaskNegotiationService } from '@/services/task/taskNegotiation.service';

export const dynamic = 'force-dynamic';

// POST: AI調整案を生成
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const adjustment = await TaskNegotiationService.generateAdjustment(taskId, userId);

    if (!adjustment) {
      return NextResponse.json({ error: 'No pending requests or generation failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: adjustment });
  } catch (error) {
    console.error('POST /api/tasks/[id]/negotiations/adjust error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT: 調整案をタスクに反映
export async function PUT(
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
    const { adjustment } = body;

    if (!adjustment) {
      return NextResponse.json({ error: 'adjustment is required' }, { status: 400 });
    }

    const success = await TaskNegotiationService.applyAdjustment(taskId, adjustment);

    if (!success) {
      return NextResponse.json({ error: 'Failed to apply adjustment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/tasks/[id]/negotiations/adjust error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: リクエストを却下
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: taskId } = await params;
    const success = await TaskNegotiationService.dismissRequests(taskId);

    return NextResponse.json({ success });
  } catch (error) {
    console.error('DELETE /api/tasks/[id]/negotiations/adjust error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
