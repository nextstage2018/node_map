// Phase 36: Cron Job — コンタクトAIコンテキスト一括分析（毎日AM7:00 JST = 22:00 UTC）
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/analyze-contacts
 * Vercel Cron Jobsから毎日呼び出される
 * ai_analyzed_at が null または7日以上前のコンタクトを最大10件分析
 */
export async function GET(request: NextRequest) {
  // Phase 36: Vercel Cron認証
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Cron/Analyze] 認証失敗: 不正なCRON_SECRET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Cron/Analyze] 日次AI分析開始:', new Date().toISOString());

  const supabase = createServerClient();
  if (!supabase || !isSupabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase未設定' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    console.log('[Cron/Analyze] ANTHROPIC_API_KEY未設定 — スキップ');
    return NextResponse.json({ success: true, message: 'APIキー未設定のためスキップ', analyzed: 0 });
  }

  try {
    // Phase 36: 分析対象を取得（notes が NULL or 空文字のコンタクトのみ）
    const { data: targets, error: fetchError } = await supabase
      .from('contact_persons')
      .select('id, name, company_name, department, relationship_type, notes, contact_channels(*)')
      .or('notes.is.null,notes.eq.')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[Cron/Analyze] 対象取得エラー:', fetchError);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (!targets || targets.length === 0) {
      console.log('[Cron/Analyze] 分析対象なし');
      return NextResponse.json({ success: true, message: '分析対象なし', analyzed: 0 });
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    let analyzedCount = 0;

    for (const contact of targets) {
      try {
        const channels = (contact.contact_channels || []) as { channel: string; address: string }[];
        const addresses = channels.map((ch: { address: string }) => ch.address).filter(Boolean);

        // Phase 36: メッセージ取得（全ユーザー共通のcronなのでuser_idフィルタなし）
        let messages: { subject: string; body: string; from_name: string; channel: string; timestamp: string }[] = [];
        if (addresses.length > 0) {
          const { data: msgs } = await supabase
            .from('inbox_messages')
            .select('subject, body, from_name, channel, timestamp')
            .in('from_address', addresses)
            .order('timestamp', { ascending: false })
            .limit(30);
          messages = msgs || [];
        }

        // Phase 36: ビジネスイベント取得
        const { data: events } = await supabase
          .from('business_events')
          .select('event_type, title, memo, happened_at')
          .eq('contact_id', contact.id)
          .order('happened_at', { ascending: false })
          .limit(10);

        const channelList = channels.map((ch: { channel: string; address: string }) => `${ch.channel}: ${ch.address}`).join(', ');
        const messageSummaries = messages.slice(0, 20).map((m) => {
          const body = (m.body || '').slice(0, 150);
          return `[${m.channel}] ${m.from_name}: ${body}`;
        }).join('\n');
        const eventSummaries = (events || []).map((e) =>
          `[${e.event_type}] ${e.title}${e.memo ? ' - ' + e.memo : ''}`
        ).join('\n');

        const systemPrompt = `あなたはビジネスコミュニケーション分析アシスタントです。
コンタクトとの関係性やコミュニケーション傾向を簡潔に分析してください。
200〜400文字程度の日本語で、前置きなく実用的に記述してください。`;

        const userPrompt = `名前: ${contact.name || '不明'}
会社: ${contact.company_name || '不明'}
部署: ${contact.department || '不明'}
関係性: ${contact.relationship_type || '不明'}
チャンネル: ${channelList || 'なし'}

メッセージ（${messages.length}件）:
${messageSummaries || 'なし'}

イベント（${(events || []).length}件）:
${eventSummaries || 'なし'}

この人物との関係性とコミュニケーション傾向を分析してください。`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const aiContext = response.content[0]?.type === 'text' ? response.content[0].text : '';

        if (aiContext) {
          await supabase
            .from('contact_persons')
            .update({
              notes: aiContext,
              ai_analyzed_at: new Date().toISOString(),
            })
            .eq('id', contact.id);

          analyzedCount++;
          console.log(`[Cron/Analyze] 分析完了: ${contact.name} (${contact.id})`);
        }
      } catch (contactError) {
        console.error(`[Cron/Analyze] ${contact.name} の分析エラー:`, contactError);
      }
    }

    console.log(`[Cron/Analyze] 日次AI分析完了: ${analyzedCount}/${targets.length}件`);

    return NextResponse.json({
      success: true,
      message: `AI分析完了: ${analyzedCount}件`,
      analyzed: analyzedCount,
      total: targets.length,
    });
  } catch (error) {
    console.error('[Cron/Analyze] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'Cron実行に失敗しました' },
      { status: 500 }
    );
  }
}
