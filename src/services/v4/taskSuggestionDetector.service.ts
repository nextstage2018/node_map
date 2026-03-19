// v4.0: メッセージからアクションアイテムを検出し、task_suggestionsに提案保存
// Slack/Chatwork Webhookからリアルタイムで呼ばれる

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { resolveProjectFromChannel } from '@/services/inbox/channelProjectLink.service';
import { shouldSuppressSuggestion } from '@/services/v4/suggestionLearning.service';
import { getTodayJST, addDaysJST, getThisWeekFridayJST } from '@/lib/dateUtils';

// タスク提案キーワード（依頼・指示系のメッセージを検出）
const TASK_KEYWORDS = [
  'お願い', 'よろしく', '確認して', '対応して', '作成して', '送って',
  '準備して', '手配して', 'やっておいて', 'してください', '至急',
  '期限', '〆切', '締め切り', 'いつまで', '明日まで', '今週中',
  '来週まで',
];

// 除外パターン（雑談・挨拶・短文）
const EXCLUDE_PATTERNS = [
  /^(おは|おつ|了解|承知|ありがと|お疲れ)/,
  /^(👍|✅|🙏|OK|ok)/,
];

// 明示的タスク指示（これはタスク即作成なので提案不要）
const EXPLICIT_TASK_KEYWORDS = [
  'タスクにして', 'タスク化して', 'タスクにする', 'タスク化する',
  'タスク登録', 'タスク作成', 'やることに追加', 'TODO', 'task', 'タスクお願い',
];

const COMPLETE_KEYWORDS = [
  'タスク完了', '完了しました', '完了した', 'done', '終わった', '終わりました',
  'タスク終了', '対応完了', '対応しました',
];

/**
 * メッセージがアクションアイテム（タスク提案候補）かどうか判定
 * - 明示的タスク指示 → false（別フローで即作成）
 * - 完了キーワード → false
 * - アクション系キーワード含む → true
 */
export function isActionableMessage(text: string): boolean {
  if (!text || text.length < 10) return false;
  const lower = text.toLowerCase();

  // 除外パターン
  if (EXCLUDE_PATTERNS.some(p => p.test(text.trim()))) return false;

  // 明示的タスク指示・完了キーワードは別フローなのでスキップ
  if (EXPLICIT_TASK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return false;
  if (COMPLETE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return false;

  // アクション系キーワードを含むか
  return TASK_KEYWORDS.some(kw => text.includes(kw));
}

function extractDeadline(text: string): string | null {
  if (text.includes('今日') || text.includes('本日')) {
    return getTodayJST();
  }
  if (text.includes('明日')) {
    return addDaysJST(1);
  }
  if (text.includes('今週中') || text.includes('今週末')) {
    return getThisWeekFridayJST();
  }
  if (text.includes('来週')) {
    return addDaysJST(7);
  }
  const dateMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
  }
  return null;
}

function extractTitle(body: string): string {
  const lines = body.split('\n').filter(l => l.trim().length > 0);
  const firstLine = lines[0] || body;
  const cleaned = firstLine
    .replace(/\[To:\d+\][^\n]*/g, '')
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/^[「『]|[」』]$/g, '')
    .trim();
  return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
}

/**
 * メッセージ本文からTO先（メンション）のアドレスを抽出
 * Slack: <@UXXXXX> → ['UXXXXX']
 * Chatwork: [To:12345] → ['12345']
 */
export function extractMentions(body: string, channel: string): string[] {
  const mentions: string[] = [];
  if (channel === 'slack') {
    const matches = body.matchAll(/<@([A-Z0-9_]+)>/g);
    for (const m of matches) {
      if (!mentions.includes(m[1])) mentions.push(m[1]);
    }
  } else if (channel === 'chatwork') {
    const matches = body.matchAll(/\[To:(\d+)\]/g);
    for (const m of matches) {
      if (!mentions.includes(m[1])) mentions.push(m[1]);
    }
  }
  return mentions;
}

/**
 * メッセージからタスク提案を生成し、task_suggestionsに保存
 * Webhookからリアルタイムで呼ばれる
 */
export async function suggestTaskFromMessage(params: {
  messageText: string;
  serviceName: string;      // 'slack' | 'chatwork'
  channelId: string;        // Slackチャネル or ChatworkルームID
  senderName?: string;
  senderAddress?: string;   // v4.0: from_address（Slack userId / CW accountId）
}): Promise<boolean> {
  const { messageText, serviceName, channelId, senderName, senderAddress } = params;

  try {
    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) return false;

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase) return false;

    // 学習フィードバック: 却下されやすいパターンか判定
    const suppress = await shouldSuppressSuggestion(ownerUserId, messageText);
    if (suppress) {
      console.log(`[TaskSuggestionDetector] 学習に基づき提案抑制: "${messageText.substring(0, 30)}..."`);
      return false;
    }

    // プロジェクト判定
    const projectResult = await resolveProjectFromChannel(serviceName, channelId);
    if (!projectResult) return false; // PJ不明はスキップ

    const title = extractTitle(messageText);
    const deadline = extractDeadline(messageText);
    const priority = (messageText.includes('至急') || messageText.includes('緊急') || messageText.includes('ASAP'))
      ? 'high' : 'medium';

    const sourceName = serviceName === 'slack' ? 'Slackメッセージ' : 'Chatworkメッセージ';

    // v4.0: TO先（メンション）を抽出 → 担当候補
    const assigneeAddresses = extractMentions(messageText, serviceName);

    // task_suggestions に保存
    const { error } = await supabase.from('task_suggestions').insert({
      user_id: ownerUserId,
      suggestions: {
        meetingTitle: `${sourceName}からの提案`,
        meetingDate: getTodayJST(),
        projectId: projectResult.projectId,
        // v4.0: 依頼者・担当候補情報
        requester_address: senderAddress || '',
        requester_name: senderName || '',
        assignee_addresses: assigneeAddresses,
        channel: serviceName,
        items: [{
          title,
          assignee: senderName || '',
          due_date: deadline,
          priority,
          related_topic: sourceName,
        }],
      },
      status: 'pending',
    });

    if (error) {
      console.error('[TaskSuggestionDetector] 提案保存エラー:', error);
      return false;
    }

    console.log(`[TaskSuggestionDetector] 提案作成: "${title}" (PJ: ${projectResult.projectName})`);
    return true;
  } catch (error) {
    console.error('[TaskSuggestionDetector] エラー:', error);
    return false;
  }
}
