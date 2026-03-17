// Phase 28: タスクAPI — ナレッジパイプライン統合
// タスク作成時にパイプラインを呼び出してキーワード抽出→ナレッジ登録

import { NextRequest, NextResponse } from 'next/server';
import { TaskService } from '@/services/task/taskClient.service';
import { CreateTaskRequest } from '@/lib/types';
import { getServerUserId } from '@/lib/serverAuth';
import { triggerKnowledgePipeline } from '@/lib/knowledgePipeline';

export const dynamic = 'force-dynamic';

// タスク一覧取得
// Phase 51a: sourceMessageId フィルタ追加（メッセージ→タスクバックリンク）
export async function GET(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // Phase 51a: sourceMessageId でフィルタ
    const { searchParams } = new URL(request.url);
    const sourceMessageId = searchParams.get('sourceMessageId');

    if (sourceMessageId) {
      const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
      const sb = getServerSupabase() || getSupabase();
      // マルチユーザー対応: user_idフィルタを削除（チーム共有データ）
      const { data, error } = await sb
        .from('tasks')
        .select('id, title, status, priority, phase, due_date, updated_at, project_id, seed_id')
        .eq('source_message_id', sourceMessageId)
        .limit(5);

      if (error) {
        // v9.0: seeds テーブル DROP済み。フォールバック不要
        return NextResponse.json({ success: true, data: [] });
      }

      return NextResponse.json({ success: true, data: data || [] });
    }

    const projectId = searchParams.get('project_id');

    if (projectId) {
      // プロジェクト指定時: そのプロジェクトのタスクのみ返す
      const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
      const sb = getServerSupabase() || getSupabase();
      if (!sb) {
        return NextResponse.json({ success: true, data: [] });
      }
      // マルチユーザー対応: user_idフィルタを削除（プロジェクト内全タスクを返す）
      const { data, error } = await sb
        .from('tasks')
        .select('id, title, status, priority, phase, due_date, updated_at, project_id, seed_id, milestone_id, description, scheduled_start, scheduled_end')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[Tasks API] project_id フィルタエラー:', error);
        return NextResponse.json({ success: true, data: [] });
      }
      return NextResponse.json({ success: true, data: data || [] });
    }

    const tasks = await TaskService.getTasks(userId);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
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

    // マルチユーザー対応: userIdをフィルタに使わない（チームメンバーがステータス変更できるように）
    const task = await TaskService.updateTask(body.id, { ...body });
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

    // v8.0: タスク完了時にマイルストーン進捗を自動更新
    if (body.status === 'done' && task.milestoneId) {
      try {
        const { updateMilestoneProgress } = await import('@/services/v8/milestoneProgress.service');
        const msResult = await updateMilestoneProgress(body.id, task.milestoneId);
        if (msResult.updated) {
          console.log(`[Tasks API] v8.0 MS進捗更新: ${task.milestoneId} → ${msResult.status} (${Math.round((msResult.progress || 0) * 100)}%)`);
        }
      } catch (msErr) {
        console.error('[Tasks API] v8.0 MS進捗更新エラー（タスク完了は成功）:', msErr);
      }
    }

    // v4.0 Phase 6: タスク完了時にSlack/Chatworkへ通知
    if (body.status === 'done') {
      try {
        const { notifyTaskCompletion } = await import('@/services/v4/taskCompletionNotify.service');
        await notifyTaskCompletion(body.id, userId);
      } catch (notifyErr) {
        console.error('[Tasks API] 完了通知エラー（タスク完了は成功）:', notifyErr);
      }
    }

    // タスク完了時: ビジネスログに記録（タスク本体はDBに残す）
    if (body.status === 'done') {
      try {
        await TaskService.archiveTaskToBusinessLog(body.id, userId);
      } catch (archErr) {
        console.error('[Tasks API] ビジネスイベント記録エラー（タスク完了は成功）:', archErr);
      }
      // タスクはDBに残す（思考マップ・会話履歴・チェックポイント結果の参照に必要）
    }

    return NextResponse.json({
      success: true,
      data: task,
      archived: body.status === 'done',
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

// タスク削除
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const taskId = searchParams.get('id');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'IDは必須です' },
        { status: 400 }
      );
    }

    // カレンダーイベントがあれば先に削除
    try {
      const { getServerSupabase, getSupabase } = await import('@/lib/supabase');
      const sb = getServerSupabase() || getSupabase();
      if (sb) {
        // マルチユーザー対応: user_idフィルタを削除
        const { data: taskData } = await sb
          .from('tasks')
          .select('calendar_event_id')
          .eq('id', taskId)
          .single();
        if (taskData?.calendar_event_id) {
          const { deleteCalendarEvent } = await import('@/services/calendar/calendarSync.service');
          await deleteCalendarEvent(taskData.calendar_event_id, userId);
        }
      }
    } catch (calErr) {
      console.error('[Tasks API] カレンダー削除エラー（続行）:', calErr);
    }

    // マルチユーザー対応: userIdフィルタなしで削除（チームメンバーが削除できるように）
    const success = await TaskService.deleteTask(taskId);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'タスク削除に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[Tasks API] タスク削除エラー:', message);
    return NextResponse.json(
      { success: false, error: 'タスクの削除に失敗しました' },
      { status: 500 }
    );
  }
}
