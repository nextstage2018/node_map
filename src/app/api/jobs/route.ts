// ジョブ CRUD API
// Phase Restructure: AIに委ねる日常の簡易作業リスト
// Phase B拡張: ステータス拡張（draft→approved→executing→done/failed）+ 実行メタデータ
// ジョブからはナレッジ抽出しない（思考マップのノイズ防止）

import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

// DB行 → フロント用オブジェクト変換
function mapJobFromDb(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    sourceMessageId: row.source_message_id,
    sourceChannel: row.source_channel,
    aiDraft: row.ai_draft,
    dueDate: row.due_date,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    // Phase B拡張
    approvedAt: row.approved_at,
    executedAt: row.executed_at,
    executionLog: row.execution_log,
    replyToMessageId: row.reply_to_message_id,
    targetContactId: row.target_contact_id,
    targetAddress: row.target_address,
    targetName: row.target_name,
    executionMetadata: row.execution_metadata,
    // Calendar統合
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    calendarEventId: row.calendar_event_id,
  };
}

// GET: ジョブ一覧取得
export async function GET() {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServerSupabase() || getSupabase();
    const { data, error } = await sb
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('ジョブ一覧取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobs = (data || []).map(mapJobFromDb);
    return NextResponse.json({ success: true, data: jobs });
  } catch (error) {
    console.error('ジョブ一覧取得エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: ジョブ作成
export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title, description, type, sourceMessageId, sourceChannel,
      dueDate, aiDraft, status,
      // Phase B拡張
      replyToMessageId, targetContactId, targetAddress, targetName,
      executionMetadata,
      // Calendar統合
      scheduledStart, scheduledEnd,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const insertData: Record<string, unknown> = {
      user_id: userId,
      title,
      type: type || 'other',
      status: status || 'pending',
    };

    if (description) insertData.description = description;
    if (sourceMessageId) insertData.source_message_id = sourceMessageId;
    if (sourceChannel) insertData.source_channel = sourceChannel;
    if (dueDate) insertData.due_date = dueDate;
    if (aiDraft) insertData.ai_draft = aiDraft;
    // Phase B拡張
    if (replyToMessageId) insertData.reply_to_message_id = replyToMessageId;
    if (targetContactId) insertData.target_contact_id = targetContactId;
    if (targetAddress) insertData.target_address = targetAddress;
    if (targetName) insertData.target_name = targetName;
    if (executionMetadata) insertData.execution_metadata = executionMetadata;
    // Calendar統合
    if (scheduledStart) insertData.scheduled_start = scheduledStart;
    if (scheduledEnd) insertData.scheduled_end = scheduledEnd;

    const { data, error } = await sb
      .from('jobs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('ジョブ作成エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calendar統合: スケジュール時刻がある場合はカレンダーに同期
    if (scheduledStart && scheduledEnd) {
      try {
        const { syncJobToCalendar } = await import('@/services/calendar/calendarSync.service');
        await syncJobToCalendar(data.id, userId);
      } catch (calErr) {
        console.error('[Jobs API] カレンダー同期エラー（ジョブ作成は成功）:', calErr);
      }
    }

    return NextResponse.json({ success: true, data: mapJobFromDb(data) });
  } catch (error) {
    console.error('ジョブ作成エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: ジョブ更新（ステータス変更含む）
export async function PUT(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, description, status, dueDate, aiDraft } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const updateData: Record<string, unknown> = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'done') {
        updateData.completed_at = new Date().toISOString();
      }
      if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
      }
      if (status === 'failed') {
        updateData.executed_at = new Date().toISOString();
      }
    }
    if (dueDate !== undefined) updateData.due_date = dueDate;
    if (aiDraft !== undefined) updateData.ai_draft = aiDraft;
    // Calendar統合
    if (body.scheduledStart !== undefined) updateData.scheduled_start = body.scheduledStart;
    if (body.scheduledEnd !== undefined) updateData.scheduled_end = body.scheduledEnd;

    // Phase B: execution_log更新
    if (body.executionLog !== undefined) updateData.execution_log = body.executionLog;

    const { data, error } = await sb
      .from('jobs')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('ジョブ更新エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calendar統合: 完了/失敗時にカレンダー予定を削除
    if ((status === 'done' || status === 'failed') && data.calendar_event_id) {
      try {
        const { deleteCalendarEvent } = await import('@/services/calendar/calendarSync.service');
        await deleteCalendarEvent(data.calendar_event_id, userId);
      } catch (calErr) {
        console.error('[Jobs API] カレンダー削除エラー:', calErr);
      }
    }
    // Calendar統合: スケジュール変更時にカレンダー更新
    if ((body.scheduledStart || body.scheduledEnd) && !['done', 'failed'].includes(status)) {
      try {
        const { syncJobToCalendar } = await import('@/services/calendar/calendarSync.service');
        await syncJobToCalendar(id, userId);
      } catch (calErr) {
        console.error('[Jobs API] カレンダー同期エラー:', calErr);
      }
    }

    return NextResponse.json({ success: true, data: mapJobFromDb(data) });
  } catch (error) {
    console.error('ジョブ更新エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: ジョブ削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const sb = getServerSupabase() || getSupabase();
    const { error } = await sb
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('ジョブ削除エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ジョブ削除エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
