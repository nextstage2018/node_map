// Phase 28: タスクAPI — ナレッジパイプライン統合
// タスク作成時にパイプラインを呼び出してキーワード抽出→ナレッジ登録

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateTaskRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

// タスク一覧取得
export async function GET() {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const tasks = await TaskService.getTasks(userId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    // Phase 29: 統一エラーハンドリング
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Tasks API] タスク取得エラー:', message);
    return NextResponse.json(
      { success: false, error: 'タスクの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク作成 + ナレッジパイプライン
export async function POST(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const body: CreateTaskRequest = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { success: false, error: 'タイトルは必須です' },
        { status: 400 }
      );
    }

    const task = await TaskService.createTask({ ...body, userId });

    // Calendar統合: スケジュール時刻がある場合はカレンダーに同期
    let calendarResult = null;
    if (body.scheduledStart && body.scheduledEnd) {
      try {
        const { syncTaskToCalendar, syncGroupTaskToMembers } = await import('@/services/calendar/calendarSync.service');
        calendarResult = await syncTaskToCalendar(task.id, userId);

        // グループタスクの場合はメンバーにも同期
        if (body.taskType === 'group' && body.members && body.members.length > 0) {
          const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
          const sb = getServerSupabase() || getSupabase();
          if (sb) {
            // メンバーをDB登録
            const memberRows = body.members.map((m: { userId: string; role?: string }) => ({
              task_id: task.id,
              user_id: m.userId,
              role: m.role || 'member',
            }));
            // オーナーも追加
            memberRows.push({ task_id: task.id, user_id: userId, role: 'owner' });
            await sb.from('task_members').upsert(memberRows, { onConflict: 'task_id,user_id' });
            // 全メンバーのカレンダーに同期
            await syncGroupTaskToMembers(task.id);
          }
        }
      } catch (calErr) {
        console.error('[Tasks API] カレンダー同期エラー（タスク作成は成功）:', calErr);
      }
    }

    // Phase 28: ナレッジパイプライン実行
    let knowledgeResult = null;
    try {
      const text = `${task.title} ${task.description || ''}`;
      knowledgeResult = await triggerKnowledgePipeline({
        text,
        trigger: 'task_create',
        sourceId: task.id,
        sourceType: 'task',
        direction: 'self',
        userId,
      });
    } catch (e) {
      console.error('[Tasks API] ナレッジパイプラインエラー（タスク作成は成功）:', e);
    }

    return NextResponse.json({
      success: true,
      data: task,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
        nodeCount: knowledgeResult.nodeCount,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Tasks API] タスク作成エラー:', message);
    return NextResponse.json(
      { success: false, error: 'タスクの作成に失敗しました' },
      { status: 500 }
    );
  }
}

// タスク更新 + 完了時にナレッジパイプライン
export async function PUT(request: NextRequest) {
  try {
    // Phase 29: 認証チェック強化
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'IDは必須です' },
        { status: 400 }
      );
    }

    const task = await TaskService.updateTask(body.id, body);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'タスクが見つかりません' },
        { status: 404 }
      );
    }

    // Calendar統合: スケジュール変更 or タスク完了時
    try {
      const { syncTaskToCalendar, deleteCalendarEvent, syncGroupTaskToMembers } = await import('@/services/calendar/calendarSync.service');

      if (body.status === 'done' && task.calendarEventId) {
        // タスク完了 → カレンダー予定を削除
        await deleteCalendarEvent(task.calendarEventId, userId);
      } else if (body.scheduledStart || body.scheduledEnd) {
        // スケジュール変更 → カレンダー更新
        await syncTaskToCalendar(body.id, userId);
        // グループタスクならメンバーにも同期
        if (task.taskType === 'group') {
          await syncGroupTaskToMembers(body.id);
        }
      }
    } catch (calErr) {
      console.error('[Tasks API] カレンダー同期エラー（タスク更新は成功）:', calErr);
    }

    // Phase 28: タスク完了時にナレッジパイプライン実行
    let knowledgeResult = null;
    if (body.status === 'done' && task.resultSummary) {
      try {
        const text = `${task.title} ${task.resultSummary}`;
        knowledgeResult = await triggerKnowledgePipeline({
          text,
          trigger: 'task_complete',
          sourceId: task.id,
          sourceType: 'task',
          direction: 'self',
          userId,
        });
      } catch (e) {
        console.error('[Tasks API] ナレッジパイプラインエラー（タスク完了は成功）:', e);
      }
    }

    return NextResponse.json({
      success: true,
      data: task,
      knowledge: knowledgeResult ? {
        keywords: knowledgeResult.keywords,
        newKeywords: knowledgeResult.newKeywords,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Tasks API] タスク更新エラー:', message);
    return NextResponse.json(
      { success: false, error: 'タスクの更新に失敗しました' },
      { status: 500 }
    );
  }
}
