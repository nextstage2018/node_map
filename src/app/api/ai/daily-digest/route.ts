import { NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { DailyDigestResponse } from '@/lib/types';

/**
 * 日次ダイジェストAPI
 * GET /api/ai/daily-digest
 * 今日の未読メッセージ数、タスク進捗、新規ノードを集約し、AIでサマリー＋推奨アクションを生成
 */
export async function GET() {
  try {
    // 認証確認
    const userId = await getServerUserId();

    // 統計データを収集
    const stats = await collectDailyStats(userId);

    const apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!apiKey) {
      // デモモード: 静的なダイジェストを返す
      const result = getDemoDigest(stats);
      return NextResponse.json({ success: true, data: result });
    }

    // Anthropic APIで日次サマリーを生成
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const systemPrompt = `あなたはビジネスアシスタントです。ユーザーの1日の業務状況をサマリーし、次のアクションを提案してください。

以下のルールに従ってください：
- サマリーは日本語で3〜5文の簡潔なテキスト
- 推奨アクションは必ず3つ提案
- 各アクションにpriority（high/medium/low）とreason（日本語）を付与
- 必ず以下のJSON形式のみで返してください（前置きや説明は不要）：
{
  "summary": "...",
  "recommendations": [
    {"action": "...", "reason": "...", "priority": "high"},
    {"action": "...", "reason": "...", "priority": "medium"},
    {"action": "...", "reason": "...", "priority": "low"}
  ]
}`;

      const userPrompt = `以下の業務状況をもとに、今日のダイジェストを生成してください。

【未読メッセージ】${stats.unreadMessages}件
【進行中タスク】${stats.pendingTasks}件
【新規ナレッジノード】${stats.newNodes}件
【現在時刻】${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

      // JSONをパース
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: DailyDigestResponse = {
          summary: parsed.summary || '',
          stats,
          recommendations: (parsed.recommendations || []).slice(0, 3),
        };
        return NextResponse.json({ success: true, data: result });
      }

      // パース失敗時はデモフォールバック
      const fallback = getDemoDigest(stats);
      return NextResponse.json({ success: true, data: fallback });
    } catch (aiError) {
      console.error('日次ダイジェストAIエラー（フォールバック使用）:', aiError);
      const fallback = getDemoDigest(stats);
      return NextResponse.json({ success: true, data: fallback });
    }
  } catch (error) {
    console.error('日次ダイジェストエラー:', error);
    return NextResponse.json(
      { success: false, error: '日次ダイジェストの生成に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * 日次統計データを収集
 */
async function collectDailyStats(userId: string): Promise<{
  unreadMessages: number;
  pendingTasks: number;
  newNodes: number;
}> {
  try {
    // 各APIから統計を取得（内部fetchは相対パスが使えないため直接集計）
    // 実際にはDB呼び出しだが、ここではAPIレスポンスを模倣
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // 並列でデータ取得
    const [messagesRes, tasksRes, nodesRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/messages`, { headers }).then(r => r.json()),
      fetch(`${baseUrl}/api/tasks`, { headers }).then(r => r.json()),
      fetch(`${baseUrl}/api/nodes/stats?userId=${userId}`, { headers }).then(r => r.json()),
    ]);

    let unreadMessages = 0;
    let pendingTasks = 0;
    let newNodes = 0;

    if (messagesRes.status === 'fulfilled' && messagesRes.value?.data) {
      const msgs = messagesRes.value.data;
      unreadMessages = Array.isArray(msgs)
        ? msgs.filter((m: { isRead?: boolean }) => !m.isRead).length
        : 0;
    }

    if (tasksRes.status === 'fulfilled' && tasksRes.value?.data) {
      const tasks = tasksRes.value.data;
      pendingTasks = Array.isArray(tasks)
        ? tasks.filter((t: { status?: string }) => t.status !== 'done').length
        : 0;
    }

    if (nodesRes.status === 'fulfilled' && nodesRes.value?.data) {
      const nodeStats = nodesRes.value.data;
      newNodes = nodeStats.totalNodes || nodeStats.total || 0;
    }

    return { unreadMessages, pendingTasks, newNodes };
  } catch (error) {
    console.error('統計データ収集エラー:', error);
    // デモ統計
    return { unreadMessages: 5, pendingTasks: 3, newNodes: 8 };
  }
}

/**
 * デモモード用の日次ダイジェスト
 */
function getDemoDigest(stats: {
  unreadMessages: number;
  pendingTasks: number;
  newNodes: number;
}): DailyDigestResponse {
  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 12) {
    greeting = 'おはようございます。';
  } else if (hour < 18) {
    greeting = 'お疲れ様です。';
  } else {
    greeting = 'お疲れ様でした。';
  }

  return {
    summary: `${greeting}現在、未読メッセージが${stats.unreadMessages}件、進行中のタスクが${stats.pendingTasks}件あります。新しいナレッジノードが${stats.newNodes}件追加されました。優先度の高いメッセージから確認することをお勧めします。`,
    stats,
    recommendations: [
      {
        action: '未読メッセージを確認する',
        reason: `${stats.unreadMessages}件の未読メッセージがあります。重要な連絡が含まれている可能性があります。`,
        priority: 'high',
      },
      {
        action: '進行中のタスクを確認する',
        reason: `${stats.pendingTasks}件のタスクが進行中です。期限が近いものがないか確認しましょう。`,
        priority: 'medium',
      },
      {
        action: 'ナレッジマップを確認する',
        reason: `${stats.newNodes}件の新しいノードが追加されました。関連性を確認して整理しましょう。`,
        priority: 'low',
      },
    ],
  };
}
