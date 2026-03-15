// v8.0: マイルストーン進捗自動更新サービス
// タスク完了時にMSの進捗率を再計算し、全タスク完了ならMSをachievedに自動更新

import { getServerSupabase, getSupabase } from '@/lib/supabase';

/**
 * タスク完了時にマイルストーンの進捗を再計算・自動更新
 * @param taskId 完了したタスクのID
 * @param milestoneId タスクが紐づくマイルストーンID
 * @returns { updated: boolean, status?: string, progress?: number }
 */
export async function updateMilestoneProgress(
  taskId: string,
  milestoneId: string | null
): Promise<{ updated: boolean; status?: string; progress?: number }> {
  if (!milestoneId) return { updated: false };

  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return { updated: false };

  try {
    // MSに紐づく全タスクを取得
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('milestone_id', milestoneId);

    if (tasksError || !tasks || tasks.length === 0) {
      return { updated: false };
    }

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;

    // 現在のMSステータスを取得
    const { data: milestone, error: msError } = await supabase
      .from('milestones')
      .select('id, status, target_date')
      .eq('id', milestoneId)
      .single();

    if (msError || !milestone) return { updated: false };

    // 既にachievedまたはmissedなら更新しない
    if (milestone.status === 'achieved' || milestone.status === 'missed') {
      return { updated: false, status: milestone.status, progress };
    }

    let newStatus = milestone.status;

    // 全タスク完了 → achieved
    if (completedTasks === totalTasks) {
      newStatus = 'achieved';
    }
    // 進行中タスクがあれば in_progress
    else if (completedTasks > 0 || tasks.some(t => t.status === 'in_progress')) {
      newStatus = 'in_progress';
    }

    // ステータスが変わった場合のみ更新
    if (newStatus !== milestone.status) {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'achieved') {
        updateData.achieved_date = new Date().toISOString().split('T')[0];
      }

      await supabase
        .from('milestones')
        .update(updateData)
        .eq('id', milestoneId);

      console.log(`[MilestoneProgress] MS ${milestoneId}: ${milestone.status} → ${newStatus} (${completedTasks}/${totalTasks})`);
      return { updated: true, status: newStatus, progress };
    }

    return { updated: false, status: milestone.status, progress };
  } catch (error) {
    console.error('[MilestoneProgress] 更新エラー:', error);
    return { updated: false };
  }
}

/**
 * 期限超過MSの自動missed判定
 * Cronジョブから呼ばれる想定
 */
export async function checkOverdueMilestones(): Promise<number> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return 0;

  try {
    const today = new Date().toISOString().split('T')[0];

    // 期限超過 + pending/in_progress のMSを取得
    const { data: overdueMilestones, error } = await supabase
      .from('milestones')
      .select('id, title, target_date, status')
      .in('status', ['pending', 'in_progress'])
      .lt('target_date', today)
      .not('target_date', 'is', null);

    if (error || !overdueMilestones || overdueMilestones.length === 0) {
      return 0;
    }

    let updatedCount = 0;
    for (const ms of overdueMilestones) {
      // そのMSに未完了タスクがあるか確認
      const { data: incompleteTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('milestone_id', ms.id)
        .neq('status', 'done')
        .limit(1);

      if (incompleteTasks && incompleteTasks.length > 0) {
        // 未完了タスクあり → missed
        await supabase
          .from('milestones')
          .update({
            status: 'missed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', ms.id);
        updatedCount++;
        console.log(`[MilestoneProgress] MS ${ms.id} (${ms.title}): 期限超過 → missed`);
      } else {
        // 未完了タスクなし（全完了 or タスクなし）→ achieved
        await supabase
          .from('milestones')
          .update({
            status: 'achieved',
            achieved_date: ms.target_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ms.id);
        updatedCount++;
        console.log(`[MilestoneProgress] MS ${ms.id} (${ms.title}): 期限超過だが全完了 → achieved`);
      }
    }

    return updatedCount;
  } catch (error) {
    console.error('[MilestoneProgress] 期限超過チェックエラー:', error);
    return 0;
  }
}
