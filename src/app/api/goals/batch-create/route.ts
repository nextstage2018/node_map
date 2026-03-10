// v4.0-Phase5: ゴール/マイルストーン/タスク一括作成API
// 会議録AI解析の goal_suggestions を受け取り、階層構造を一括INSERT
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface TaskInput {
  title: string;
  assignee_hint: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
}

interface MilestoneInput {
  title: string;
  target_date: string | null;
  tasks: TaskInput[];
}

interface GoalInput {
  title: string;
  description: string;
  milestones: MilestoneInput[];
}

interface BatchCreateRequest {
  project_id: string;
  meeting_record_id?: string;
  goals: GoalInput[];
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
    }

    const body: BatchCreateRequest = await request.json();
    const { project_id, meeting_record_id, goals } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id は必須です' }, { status: 400 });
    }
    if (!goals || !Array.isArray(goals) || goals.length === 0) {
      return NextResponse.json({ success: false, error: 'goals は必須です' }, { status: 400 });
    }

    // プロジェクトの存在確認
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ success: false, error: 'プロジェクトが見つかりません' }, { status: 404 });
    }

    // 既存ゴール（テーマ）の最大sort_orderを取得
    const { data: existingThemes } = await supabase
      .from('themes')
      .select('sort_order')
      .eq('project_id', project_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    let nextThemeOrder = (existingThemes && existingThemes.length > 0)
      ? (existingThemes[0].sort_order || 0) + 1
      : 0;

    // 既存MSの最大sort_orderを取得
    const { data: existingMs } = await supabase
      .from('milestones')
      .select('sort_order')
      .eq('project_id', project_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    let nextMsOrder = (existingMs && existingMs.length > 0)
      ? (existingMs[0].sort_order || 0) + 1
      : 0;

    const createdGoals: string[] = [];
    const createdMilestones: string[] = [];
    const createdTasks: string[] = [];

    for (const goal of goals) {
      // 1. ゴール（themes テーブル）を作成
      const { data: newTheme, error: themeError } = await supabase
        .from('themes')
        .insert({
          project_id,
          title: goal.title.trim(),
          description: goal.description?.trim() || null,
          sort_order: nextThemeOrder,
          status: 'active',
        })
        .select()
        .single();

      if (themeError) {
        console.error('[Goals BatchCreate] ゴール作成エラー:', themeError);
        continue;
      }

      createdGoals.push(newTheme.id);
      nextThemeOrder++;

      // 2. マイルストーンを作成
      for (const ms of goal.milestones) {
        const { data: newMs, error: msError } = await supabase
          .from('milestones')
          .insert({
            project_id,
            theme_id: newTheme.id,
            title: ms.title.trim(),
            target_date: ms.target_date || null,
            status: 'pending',
            sort_order: nextMsOrder,
          })
          .select()
          .single();

        if (msError) {
          console.error('[Goals BatchCreate] MS作成エラー:', msError);
          continue;
        }

        createdMilestones.push(newMs.id);
        nextMsOrder++;

        // 3. タスクを作成
        for (const task of ms.tasks) {
          const { data: newTask, error: taskError } = await supabase
            .from('tasks')
            .insert({
              user_id: userId,
              project_id,
              milestone_id: newMs.id,
              title: task.title.trim(),
              description: '',
              priority: task.priority || 'medium',
              status: 'todo',
              phase: 'ideation',
              due_date: task.due_date || null,
              source_type: 'meeting_record',
              source_message_id: meeting_record_id || null,
            })
            .select()
            .single();

          if (taskError) {
            console.error('[Goals BatchCreate] タスク作成エラー:', taskError);
            continue;
          }

          createdTasks.push(newTask.id);
        }
      }
    }

    console.log(`[Goals BatchCreate] 完了: ${createdGoals.length}ゴール, ${createdMilestones.length}MS, ${createdTasks.length}タスク`);

    return NextResponse.json({
      success: true,
      data: {
        goals_created: createdGoals.length,
        milestones_created: createdMilestones.length,
        tasks_created: createdTasks.length,
        goal_ids: createdGoals,
        milestone_ids: createdMilestones,
        task_ids: createdTasks,
      },
    });
  } catch (error) {
    console.error('[Goals BatchCreate] エラー:', error);
    return NextResponse.json({ success: false, error: '一括作成に失敗しました' }, { status: 500 });
  }
}
