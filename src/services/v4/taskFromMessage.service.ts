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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      title: messageText.slice(0, 100),
      description: messageText,
      priority: 'medium',
      dueDate: null,
    };
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const contextPart = threadContext
      ? `\n\n【スレッドの文脈】\n${threadContext}`
      : '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `以下のメッセージからタスク情報を抽出してJSON形式で返してください。
今日の日付: ${today}

【メッセージ】
${messageText}${contextPart}

以下のJSON形式で返してください（他のテキストは不要）:
{
  "title": "タスクのタイトル（簡潔に）",
  "description": "タスクの詳細説明",
  "priority": "high/medium/low",
  "dueDate": "YYYY-MM-DD形式の期限（不明ならnull）"
}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || messageText.slice(0, 100),
        description: parsed.description || messageText,
        priority: ['high', 'medium', 'low'].includes(parsed.priority) ? parsed.priority : 'medium',
        dueDate: parsed.dueDate || null,
      };
    }
  } catch (error) {
    console.error('[taskFromMessage] AI抽出エラー:', error);
  }

  return {
    title: messageText.slice(0, 100),
    description: messageText,
    priority: 'medium',
    dueDate: null,
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
      phase: 'plan',
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
