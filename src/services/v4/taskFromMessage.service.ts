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
  requesterName: string | null;
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

  // 具体的な日付パターン: 3/15, 3月15日, 2026/3/15 など
  const specificDateMatch = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/) ||
    text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[までに\s]|$)/) ||
    text.match(/(\d{1,2})月(\d{1,2})日/);

  if (specificDateMatch) {
    if (specificDateMatch.length === 4) {
      // YYYY/MM/DD
      const year = parseInt(specificDateMatch[1]);
      const month = parseInt(specificDateMatch[2]) - 1;
      const day = parseInt(specificDateMatch[3]);
      dueDate = new Date(year, month, day).toISOString().split('T')[0];
    } else {
      // MM/DD or M月D日
      const month = parseInt(specificDateMatch[1]) - 1;
      const day = parseInt(specificDateMatch[2]);
      const targetDate = new Date(today.getFullYear(), month, day);
      // 過去日なら来年
      if (targetDate < today) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      dueDate = targetDate.toISOString().split('T')[0];
    }
  } else if (text.includes('今日') || text.includes('本日')) {
    dueDate = today.toISOString().split('T')[0];
  } else if (text.includes('明後日') || text.includes('あさって')) {
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    dueDate = dayAfterTomorrow.toISOString().split('T')[0];
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
  } else {
    // N日後、N日以内 パターン
    const daysLaterMatch = text.match(/(\d+)日[後以内にまで]/);
    if (daysLaterMatch) {
      const daysLater = new Date(today);
      daysLater.setDate(daysLater.getDate() + parseInt(daysLaterMatch[1]));
      dueDate = daysLater.toISOString().split('T')[0];
    }
  }

  // 優先度キーワード
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (text.includes('急ぎ') || text.includes('至急') || text.includes('緊急') || text.includes('ASAP')) {
    priority = 'high';
  }

  // タスクキーワードを除去してタイトルを生成
  let title = text
    .replace(/タスクにして|タスク化して|タスクにする|タスク化する|タスク登録|タスク作成|やることに追加|TODO|task|タスクお願い/gi, '')
    .replace(/今日中?|明後日|あさって|明日中?|今週中?|来週中?|週末中?|\d+日[後以内]+|(\d{1,2})[\/月](\d{1,2})[日]?|までに|まで/g, '')
    .replace(/^[にをはがのでと、。\s]+/, '')
    .replace(/急ぎ|至急|緊急|ASAP/gi, '')
    .trim();

  if (!title || title.length < 2) {
    title = text.slice(0, 100);
  }

  // 詳細: スレッドコンテキストがある場合はAI要約を生成
  let description = '';
  if (threadContext && threadContext.trim()) {
    description = await summarizeThreadContext(text, threadContext);
  }

  return {
    title: title.slice(0, 100),
    description,
    priority,
    dueDate,
  };
}

/**
 * スレッドの前後のやり取りをAIで要約して「タスクの背景・経緯」を生成
 */
async function summarizeThreadContext(
  taskMessage: string,
  threadContext: string
): Promise<string> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `以下のチャットのやり取りから、タスクの背景と経緯を簡潔にまとめてください。
箇条書きではなく、2〜3文の自然な文章で。

【タスク依頼メッセージ】
${taskMessage}

【前後のやり取り】
${threadContext.slice(0, 1500)}

【出力ルール】
- 「〜という流れで」「〜を受けて」など経緯がわかる表現
- 関係者名があれば含める
- 200文字以内`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type === 'text' && text.text.trim()) {
      return text.text.trim();
    }
  } catch (error) {
    console.error('[taskFromMessage] AI要約エラー（フォールバック）:', error);
  }

  // フォールバック: 生テキストの先頭200文字
  return threadContext.slice(0, 200).trim();
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
    const match = await resolveProjectFromChannel(serviceName, channelId);
    if (!match) {
      console.log(`[taskFromMessage] プロジェクト未発見: service=${serviceName}, channel=${channelId}`);
      return null;
    }

    // resolveProjectFromChannel は { projectId, projectName, organizationId } を返す
    console.log(`[taskFromMessage] プロジェクト解決: ${match.projectName} (${match.projectId})`);
    return { projectId: match.projectId, projectName: match.projectName };
  } catch (error) {
    console.error('[taskFromMessage] プロジェクト解決エラー:', error);
  }

  return null;
}

/**
 * Slack/ChatworkユーザーIDから依頼者(contact_persons)を解決
 */
async function resolveRequester(
  serviceName: 'slack' | 'chatwork',
  senderIdentifier: string | undefined,
  supabase: ReturnType<typeof getSupabase>
): Promise<{ contactId: string; name: string } | null> {
  if (!supabase || !senderIdentifier) return null;

  try {
    // contact_channels から該当するコンタクトを検索
    const channelType = serviceName === 'slack' ? 'slack' : 'chatwork';
    const { data } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('channel', channelType)
      .eq('address', senderIdentifier)
      .limit(1)
      .maybeSingle();

    if (data?.contact_id) {
      // コンタクト名も取得
      const { data: contact } = await supabase
        .from('contact_persons')
        .select('name')
        .eq('id', data.contact_id)
        .single();

      console.log(`[taskFromMessage] 依頼者解決: contact_id=${data.contact_id}, name=${contact?.name}`);
      return { contactId: data.contact_id, name: contact?.name || '不明' };
    }
  } catch (error) {
    console.error('[taskFromMessage] 依頼者解決エラー:', error);
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
  senderIdentifier?: string; // Slack: user_id (U...), Chatwork: account_id
  threadTs?: string;          // v4.5: Slack スレッドts（Block Kitカードをスレッド内に投稿するため）
}): Promise<CreatedTaskResult | null> {
  const { messageText, threadContext, serviceName, channelId, messageId, userId, senderName, senderIdentifier, threadTs } = params;

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

    // 4. 依頼者を解決
    const requester = await resolveRequester(serviceName, senderIdentifier, supabase);

    // 5. 担当者を解決（自動セット: 作成者自身）
    let assigneeContactId: string | null = requester?.contactId || null;
    if (!assigneeContactId && userId) {
      // user_id → contact_persons.linked_user_id 逆引きで作成者自身を自動セット
      try {
        const { data: selfContact } = await supabase
          .from('contact_persons')
          .select('id')
          .eq('linked_user_id', userId)
          .limit(1)
          .maybeSingle();
        if (selfContact?.id) {
          assigneeContactId = selfContact.id;
        }
      } catch { /* フォールバック: null */ }
    }

    // 6. タスクを作成
    const taskId = crypto.randomUUID();
    const { error } = await supabase.from('tasks').insert({
      id: taskId,
      title: extracted.title,
      description: extracted.description,
      status: 'todo',
      priority: extracted.priority,
      due_date: extracted.dueDate,
      project_id: project?.projectId || null,
      milestone_id: milestone?.id || null,
      user_id: userId,
      source_type: serviceName,
      source_message_id: messageId,
      source_channel_id: channelId,
      requester_contact_id: requester?.contactId || null,
      assigned_contact_id: assigneeContactId,
      phase: 'ideation',
    });

    if (error) {
      console.error('[taskFromMessage] タスク挿入エラー:', error);
      return null;
    }

    // 7. ビジネスイベント追加
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

    // 8. v4.5: 外部タスク同期（Slack Block Kit カード / Chatworkネイティブタスク）
    try {
      const { syncTaskToExternal } = await import('@/services/v45/externalTaskSync.service');
      await syncTaskToExternal({
        taskId,
        title: extracted.title,
        dueDate: extracted.dueDate,
        projectName: project?.projectName || null,
        milestoneName: milestone?.title || null,
        requesterName: requester?.name || null,
        serviceName,
        channelId,
        threadTs,           // v4.5: Slackスレッド内にカードを投稿
        assigneeIdentifier: senderIdentifier, // 依頼者=担当者（デフォルト）
      });
    } catch (syncError) {
      // 外部同期失敗はNodeMapタスク作成をブロックしない
      console.error('[taskFromMessage] 外部タスク同期エラー（無視して続行）:', syncError);
    }

    return {
      id: taskId,
      title: extracted.title,
      dueDate: extracted.dueDate,
      projectId: project?.projectId || null,
      projectName: project?.projectName || null,
      milestoneId: milestone?.id || null,
      milestoneName: milestone?.title || null,
      requesterName: requester?.name || null,
    };
  } catch (error) {
    console.error('[taskFromMessage] 全体エラー:', error);
    return null;
  }
}
