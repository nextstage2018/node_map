/**
 * v4.0 Phase 3: メッセージからタスク自動生成（Slack/Chatwork共通）
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface CreatedTaskResult {
  id: string;
  title: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
}

interface TaskExtractionResult {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string | null;
}

/**
 * メッセージテキストからAIでタスク情報を抽出
 */
async function extractTaskFromMessage(
  messageText: string,
  threadContext?: string
): Promise<TaskExtractionResult> {
  // シンプル抽出（Vercel環境でのAI API接続問題を回避）
  const text = messageText.trim();

  // 期限キーワードから日付を推定
  let dueDate: string | null = null;
  const today = new Date();

  if (text.includes('今日') || text.includes('本日')) {
    dueDate = today.toISOString().split('T')[0];
  } else if (text.includes('明日')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = tomorrow.toISOString().split('T')[0];
  } else if (text.includes('今週') || text.includes('週末')) {
    const friday = new Date(today);
    friday.setDate(friday.getDate() + (5 - friday.getDay() + 7) % 7);
    dueDate = friday.toISOString().split('T')[0];
  } else if (text.includes('来週')) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    dueDate = nextWeek.toISOString().split('T')[0];
  }

  // 優先度キーワード
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (text.includes('急ぎ') || text.includes('至急') || text.includes('緊急') || text.includes('ASAP')) {
    priority = 'high';
  }

  // タスクキーワードを除去してタイトルを生成
  let title = text
    .replace(/タスクにして|タスク化して|タスクにする|タスク化する|タスク登録|タスク作成|やることに追加|TODO|task|タスクお願い/gi, '')
    .replace(/今日|明日|今週|来週|週末|まで|までに/g, '')
    .replace(/急ぎ|至急|緊急|ASAP/gi, '')
    .trim();

  if (!title || title.length < 2) {
    title = text.slice(0, 100);
  }

  return {
    title: title.slice(0, 100),
    description: text,
    priority,
    dueDate,
  };
}

/**
 * チャネルIDからプロジェクトを解決
 */
async function resolveProject(
  serviceName: 'slack' | 'chatwork',
  channelId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<{ projectId: string; projectName: string } | null> {
  if (!supabase) return null;

  try {
    const { resolveProjectFromChannel } = await import(
      '@/services/inbox/channelProjectLink.service'
    );
    const projectId = await resolveProjectFromChannel(serviceName, channelId);
    if (!projectId) return null;

    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .single();

    if (project) {
      return { projectId: project.id, projectName: project.name };
    }
  } catch (error) {
    console.error('[taskFromMessage] プロジェクト解決エラー:', error);
  }

  return null;
}

/**
 * プロジェクト内の直近マイルストーンを取得
 */
async function findNearestMilestone(
  projectId: string,
  supabase: ReturnType<typeof getSupabase>
): Promise<{ id: string; title: string } | null> {
  if (!supabase) return null;

  try {
    const { data: milestones } = await supabase
      .from('milestones')
      .select('id, title, due_date')
      .eq('project_id', projectId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true })
      .limit(1);

    if (milestones && milestones.length > 0) {
      return { id: milestones[0].id, title: milestones[0].title };
    }
  } catch (error) {
    console.error('[taskFromMessage] マイルストーン取得エラー:', error);
  }

  return null;
}

/**
 * メッセージからタスクを作成（メインエントリポイント）
 */
export async function createTaskFromMessage(params: {
  messageText: string;
  threadContext?: string;
  serviceName: 'slack' | 'chatwork';
  channelId: string;
  messageId: string;
  userId: string;
  senderName?: string;
}): Promise<CreatedTaskResult | null> {
  const { messageText, threadContext, serviceName, channelId, messageId, userId, senderName } = params;

  try {
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) {
      console.error('[taskFromMessage] Supabaseクライアント取得失敗');
      return null;
    }

    // 1. AI でタスク情報を抽出
    const extracted = await extractTaskFromMessage(messageText, threadContext);

    // 2. プロジェクトを解決
    const project = await resolveProject(serviceName, channelId, supabase);

    // 3. マイルストーンを取得
    let milestone: { id: string; title: string } | null = null;
    if (project) {
      milestone = await findNearestMilestone(project.projectId, supabase);
    }

    // 4. タスクを作成
    const taskId = crypto.randomUUID();
    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      title: extracted.title,
      description: extracted.description,
      status: 'not_started',
      priority: extracted.priority,
      due_date: extracted.dueDate,
      project_id: project?.projectId || null,
      milestone_id: milestone?.id || null,
      user_id: userId,
      source_type: serviceName,
      source_message_id: messageId,
      source_channel_id: channelId,
      phase: 'ideation',
    });

    if (error) {
      console.error('[taskFromMessage] タスク挿入エラー:', error);
      return null;
    }

    // 5. ビジネスイベント追加
    if (project) {
      try {
        await supabase.from('business_events').insert({
          id: crypto.randomUUID(),
          project_id: project.projectId,
          event_type: 'task_created',
          content: `${serviceName}からタスク自動作成: ${extracted.title}`,
          event_date: new Date().toISOString(),
          ai_generated: true,
        });
      } catch {
        // ビジネスイベント失敗は無視
      }
    }

    return {
      id: taskId,
      title: extracted.title,
      dueDate: extracted.dueDate,
      projectId: project?.projectId || null,
      projectName: project?.projectName || null,
      milestoneId: milestone?.id || null,
      milestoneName: milestone?.title || null,
    };
  } catch (error) {
    console.error('[taskFromMessage] 全体エラー:', error);
    return null;
  }
}
