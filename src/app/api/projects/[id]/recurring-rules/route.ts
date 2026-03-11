// v4.2: プロジェクト繰り返しルール API（GET / POST）
// GET  /api/projects/[id]/recurring-rules — ルール一覧取得
// POST /api/projects/[id]/recurring-rules — ルール作成

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    const { getRecurringRules } = await import('@/services/v42/recurringRules.service');
    const rules = await getRecurringRules(projectId);

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    console.error('[RecurringRules API] GET エラー:', error);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();

    const { type, title, rrule, lead_days, calendar_sync, auto_create, metadata } = body;

    if (!type || !['meeting', 'task', 'job'].includes(type)) {
      return NextResponse.json({ error: '無効なtype（meeting/task/jobのいずれか）' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'titleは必須です' }, { status: 400 });
    }
    if (!rrule || typeof rrule !== 'string') {
      return NextResponse.json({ error: 'rruleは必須です（iCal RRULE形式）' }, { status: 400 });
    }

    const { createRecurringRule } = await import('@/services/v42/recurringRules.service');
    const rule = await createRecurringRule({
      project_id: projectId,
      type,
      title,
      rrule,
      lead_days,
      calendar_sync,
      auto_create,
      metadata,
    });

    if (!rule) {
      return NextResponse.json({ error: 'ルール作成に失敗しました（RRULE形式を確認してください）' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('[RecurringRules API] POST エラー:', error);
    return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 });
  }
}
