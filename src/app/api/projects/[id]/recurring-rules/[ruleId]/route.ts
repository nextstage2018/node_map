// v4.2: 繰り返しルール個別操作 API（PUT / DELETE）
// PUT    /api/projects/[id]/recurring-rules/[ruleId] — ルール更新
// DELETE /api/projects/[id]/recurring-rules/[ruleId] — ルール削除

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ruleId } = await params;
    const body = await request.json();

    const { title, rrule, lead_days, calendar_sync, auto_create, metadata, enabled } = body;

    const { updateRecurringRule } = await import('@/services/v42/recurringRules.service');
    const rule = await updateRecurringRule(ruleId, {
      title,
      rrule,
      lead_days,
      calendar_sync,
      auto_create,
      metadata,
      enabled,
    });

    if (!rule) {
      return NextResponse.json({ error: '更新に失敗しました' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('[RecurringRules API] PUT エラー:', error);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ruleId } = await params;

    const { deleteRecurringRule } = await import('@/services/v42/recurringRules.service');
    const success = await deleteRecurringRule(ruleId);

    if (!success) {
      return NextResponse.json({ error: '削除に失敗しました' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RecurringRules API] DELETE エラー:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
