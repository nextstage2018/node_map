// Phase 45c: ビジネスログ AI週間要約 Cron Job
// 毎週月曜日に実行。プロジェクトごとに過去1週間のイベントをAIで要約
// vercel.json で設定
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/BusinessSummary] AI週間要約生成開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' });
  }

  const stats = {
    projectsProcessed: 0,
    summariesCreated: 0,
    errors: 0,
  };

  try {
    // 過去1週間のイベントを取得
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date();

    // ISO週番号を計算
    const weekNumber = getISOWeekNumber(now);
    const summaryPeriod = `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

    // 既に同じ週の要約がある場合はスキップ
    const { data: existingSummaries } = await supabase
      .from('business_events')
      .select('id')
      .eq('event_type', 'summary')
      .eq('ai_generated', true)
      .eq('summary_period', summaryPeriod)
      .limit(1);

    if (existingSummaries && existingSummaries.length > 0) {
      console.log('[Cron/BusinessSummary] 今週の要約は既に存在:', summaryPeriod);
      return NextResponse.json({ success: true, message: '今週の要約は既に生成済み', stats });
    }

    // アクティブユーザーを取得
    const { data: tokenUsers } = await supabase
      .from('user_service_tokens')
      .select('user_id')
      .eq('service_name', 'gmail')
      .eq('is_active', true);

    if (!tokenUsers || tokenUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'アクティブユーザーなし', stats });
    }

    for (const tokenUser of tokenUsers) {
      const userId = tokenUser.user_id;

      // このユーザーのプロジェクト一覧を取得
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', userId);

      if (!projects || projects.length === 0) continue;

      for (const project of projects) {
        stats.projectsProcessed++;

        try {
          // このプロジェクトの過去1週間のイベント取得
          const { data: events } = await supabase
            .from('business_events')
            .select('title, content, event_type, event_date, source_channel')
            .eq('project_id', project.id)
            .eq('user_id', userId)
            .neq('event_type', 'summary')
            .gte('event_date', weekAgo)
            .order('event_date', { ascending: true });

          if (!events || events.length === 0) continue;

          // イベントをカテゴリ分類
          const messageEvents = events.filter(e =>
            e.event_type === 'message_sent' || e.event_type === 'message_received' || e.event_type === 'communication'
          );
          const documentEvents = events.filter(e =>
            e.event_type === 'document_received' || e.event_type === 'document_submitted'
          );
          const meetingEvents = events.filter(e =>
            e.event_type === 'meeting'
          );
          const otherEvents = events.filter(e =>
            !['message_sent', 'message_received', 'communication', 'document_received', 'document_submitted', 'meeting'].includes(e.event_type)
          );

          // AI要約を生成
          const summaryContent = await generateWeeklySummary(
            project.name,
            summaryPeriod,
            messageEvents,
            documentEvents,
            meetingEvents,
            otherEvents,
          );

          // 要約をビジネスイベントとして登録
          const { error: insertError } = await supabase
            .from('business_events')
            .insert({
              title: `[週間要約] ${project.name} (${summaryPeriod})`,
              content: summaryContent,
              event_type: 'summary',
              project_id: project.id,
              user_id: userId,
              ai_generated: true,
              summary_period: summaryPeriod,
              event_date: now.toISOString(),
            });

          if (insertError) {
            console.error('[Cron/BusinessSummary] 要約登録エラー:', insertError);
            stats.errors++;
          } else {
            stats.summariesCreated++;
            console.log(`[Cron/BusinessSummary] 要約生成: ${project.name} (${summaryPeriod}) - ${events.length}イベント`);
          }
        } catch (projError) {
          console.error('[Cron/BusinessSummary] プロジェクト処理エラー:', project.id, projError);
          stats.errors++;
        }
      }
    }

    console.log('[Cron/BusinessSummary] 完了:', JSON.stringify(stats));
    return NextResponse.json({ success: true, stats });

  } catch (error) {
    console.error('[Cron/BusinessSummary] 全体エラー:', error);
    return NextResponse.json(
      { success: false, error: 'ビジネス要約生成に失敗しました', stats },
      { status: 500 }
    );
  }
}

// ========================================
// AI要約生成
// ========================================
interface EventItem {
  title: string;
  content: string | null;
  event_type: string;
  event_date: string;
  source_channel: string | null;
}

async function generateWeeklySummary(
  projectName: string,
  period: string,
  messageEvents: EventItem[],
  documentEvents: EventItem[],
  meetingEvents: EventItem[],
  otherEvents: EventItem[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // コンテキスト構築
  let context = `プロジェクト: ${projectName}\n期間: ${period}\n\n`;

  if (messageEvents.length > 0) {
    context += `【連絡（${messageEvents.length}件）】\n`;
    for (const e of messageEvents.slice(0, 20)) {
      context += `- ${e.title}: ${(e.content || '').slice(0, 100)}\n`;
    }
    context += '\n';
  }

  if (documentEvents.length > 0) {
    context += `【書類（${documentEvents.length}件）】\n`;
    for (const e of documentEvents.slice(0, 10)) {
      context += `- ${e.title}\n`;
    }
    context += '\n';
  }

  if (meetingEvents.length > 0) {
    context += `【会議（${meetingEvents.length}件）】\n`;
    for (const e of meetingEvents.slice(0, 10)) {
      context += `- ${e.title}: ${(e.content || '').slice(0, 100)}\n`;
    }
    context += '\n';
  }

  if (otherEvents.length > 0) {
    context += `【その他（${otherEvents.length}件）】\n`;
    for (const e of otherEvents.slice(0, 10)) {
      context += `- ${e.title}\n`;
    }
  }

  // Claude APIが使えない場合はテンプレートで要約
  if (!apiKey) {
    return generateTemplateSummary(projectName, period, messageEvents, documentEvents, meetingEvents, otherEvents);
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 600,
      system: `あなたはビジネスプロジェクトの活動を要約するアシスタントです。
以下のビジネスイベントデータを元に、プロジェクトの週間活動サマリーを日本語で作成してください。
要約は以下の構成で200-400文字程度にまとめてください：
1. 今週の概況（1-2文）
2. 連絡・コミュニケーション状況
3. 書類・ドキュメントの動き
4. 会議の状況（あれば）
5. 来週に向けた注目点`,
      messages: [
        { role: 'user', content: context },
      ],
    });

    const summaryText = response.content[0]?.type === 'text'
      ? response.content[0].text
      : generateTemplateSummary(projectName, period, messageEvents, documentEvents, meetingEvents, otherEvents);

    return summaryText;
  } catch (aiError) {
    console.error('[Cron/BusinessSummary] AI要約生成エラー:', aiError);
    return generateTemplateSummary(projectName, period, messageEvents, documentEvents, meetingEvents, otherEvents);
  }
}

// テンプレートベース要約（APIなし時フォールバック）
function generateTemplateSummary(
  projectName: string,
  period: string,
  messageEvents: EventItem[],
  documentEvents: EventItem[],
  meetingEvents: EventItem[],
  otherEvents: EventItem[],
): string {
  const totalEvents = messageEvents.length + documentEvents.length + meetingEvents.length + otherEvents.length;
  const sentCount = messageEvents.filter(e => e.event_type === 'message_sent').length;
  const receivedCount = messageEvents.filter(e => e.event_type === 'message_received').length;

  let summary = `【${projectName}】${period} 週間活動サマリー\n\n`;
  summary += `今週の活動: 合計${totalEvents}件\n\n`;

  if (messageEvents.length > 0) {
    summary += `■ 連絡: ${messageEvents.length}件（送信${sentCount}件 / 受信${receivedCount}件）\n`;
  }
  if (documentEvents.length > 0) {
    summary += `■ 書類: ${documentEvents.length}件\n`;
  }
  if (meetingEvents.length > 0) {
    summary += `■ 会議: ${meetingEvents.length}件\n`;
  }
  if (otherEvents.length > 0) {
    summary += `■ その他: ${otherEvents.length}件\n`;
  }

  return summary;
}

// ISO週番号を計算
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
