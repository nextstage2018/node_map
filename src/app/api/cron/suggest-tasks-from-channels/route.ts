// v4.0 Cron: チャネルメッセージからタスク提案を自動生成
// スケジュール: 毎日 02:30 UTC（sync-channel-topicsの1時間後）
// 対象: 過去24hのSlack/Chatworkメッセージからアクションアイテムを抽出
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { resolveProjectFromChannel } from '@/services/channelProjectLink.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// タスク提案キーワード（依頼・指示系のメッセージを検出）
const TASK_KEYWORDS = [
  'お願い', 'よろしく', '確認して', '対応して', '作成して', '送って',
  '準備して', '手配して', 'やっておいて', 'してください', '至急',
  '期限', '〆切', '締め切り', 'いつまで', '明日まで', '今週中',
  '来週まで', 'タスク', 'TODO', 'todo', 'アクション',
];

// 除外パターン（雑談・挨拶）
const EXCLUDE_PATTERNS = [
  /^(おは|おつ|了解|承知|ありがと|お疲れ)/,
  /^(👍|✅|🙏|OK|ok)/,
];

function isActionableMessage(body: string): boolean {
  if (!body || body.length < 10) return false;
  if (EXCLUDE_PATTERNS.some(p => p.test(body.trim()))) return false;
  return TASK_KEYWORDS.some(kw => body.includes(kw));
}

function extractDeadline(text: string): string | null {
  const today = new Date();

  if (text.includes('今日') || text.includes('本日')) {
    return today.toISOString().split('T')[0];
  }
  if (text.includes('明日')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (text.includes('今週中') || text.includes('今週末')) {
    const d = new Date(today);
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() + (5 - dayOfWeek)); // 金曜日
    return d.toISOString().split('T')[0];
  }
  if (text.includes('来週')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  // YYYY-MM-DD or MM/DD パターン
  const dateMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
  }
  const shortMatch = text.match(/(\d{1,2})[/月](\d{1,2})[日]?/);
  if (shortMatch) {
    const m = shortMatch[1].padStart(2, '0');
    const d = shortMatch[2].padStart(2, '0');
    return `${today.getFullYear()}-${m}-${d}`;
  }

  return null;
}

function extractTitle(body: string): string {
  // メッセージ本文から最初の意味のある行を抽出（最大60文字）
  const lines = body.split('\n').filter(l => l.trim().length > 0);
  const firstLine = lines[0] || body;
  // To: や @メンション部分を除去
  const cleaned = firstLine
    .replace(/\[To:\d+\]/g, '')
    .replace(/@\S+/g, '')
    .replace(/^[「『]|[」』]$/g, '')
    .trim();
  return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
}

export async function GET(request: NextRequest) {
  try {
    // Cron認証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase未設定' }, { status: 400 });
    }

    const ownerUserId = process.env.ENV_TOKEN_OWNER_ID;
    if (!ownerUserId) {
      return NextResponse.json({ error: 'ENV_TOKEN_OWNER_ID未設定' }, { status: 400 });
    }

    const stats = {
      messagesScanned: 0,
      actionableFound: 0,
      suggestionsCreated: 0,
      errors: 0,
    };

    // 過去24hのSlack/Chatworkメッセージ取得
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: messages, error: fetchError } = await supabase
      .from('inbox_messages')
      .select('id, subject, body, channel, from_name, metadata, received_at')
      .in('channel', ['slack', 'chatwork'])
      .eq('direction', 'received')
      .gte('received_at', since)
      .order('received_at', { ascending: true })
      .limit(200);

    if (fetchError) {
      console.error('[SuggestTasksFromChannels] メッセージ取得エラー:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        message: '処理対象メッセージなし',
        stats,
      });
    }

    stats.messagesScanned = messages.length;

    // プロジェクトごとにアクションアイテムをグループ化
    const projectItems: Record<string, {
      projectId: string;
      projectName?: string;
      items: Array<{
        title: string;
        assignee: string;
        due_date: string | null;
        priority: string;
        related_topic: string;
      }>;
    }> = {};

    for (const msg of messages) {
      const body = msg.body || msg.subject || '';
      if (!isActionableMessage(body)) continue;

      stats.actionableFound++;

      // プロジェクト判定
      const metadata = msg.metadata as Record<string, string> | null;
      const channelId = metadata?.slackChannel || metadata?.chatworkRoomId || '';
      const serviceName = msg.channel;

      let projectId: string | null = null;
      let projectName: string | null = null;

      if (channelId && serviceName) {
        try {
          const result = await resolveProjectFromChannel(serviceName, channelId, supabase);
          if (result) {
            projectId = result.projectId;
            projectName = result.projectName;
          }
        } catch {
          // プロジェクト判定失敗は無視
        }
      }

      if (!projectId) continue; // PJ不明はスキップ

      const title = extractTitle(body);
      const deadline = extractDeadline(body);
      const priority = body.includes('至急') || body.includes('緊急') || body.includes('ASAP') ? 'high' : 'medium';

      if (!projectItems[projectId]) {
        projectItems[projectId] = { projectId, projectName: projectName || undefined, items: [] };
      }

      projectItems[projectId].items.push({
        title,
        assignee: msg.from_name || '',
        due_date: deadline,
        priority,
        related_topic: serviceName === 'slack' ? 'Slackメッセージ' : 'Chatworkメッセージ',
      });
    }

    // プロジェクトごとにtask_suggestionsを作成
    for (const [projectId, group] of Object.entries(projectItems)) {
      if (group.items.length === 0) continue;

      try {
        await supabase.from('task_suggestions').insert({
          user_id: ownerUserId,
          suggestions: {
            meetingTitle: `チャネルメッセージ提案 (${new Date().toLocaleDateString('ja-JP')})`,
            meetingDate: new Date().toISOString().split('T')[0],
            projectId,
            items: group.items,
          },
          status: 'pending',
        });
        stats.suggestionsCreated++;
      } catch (error) {
        console.error(`[SuggestTasksFromChannels] 提案作成エラー (PJ: ${projectId}):`, error);
        stats.errors++;
      }
    }

    console.log('[SuggestTasksFromChannels] 完了:', stats);
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('[SuggestTasksFromChannels] エラー:', error);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
