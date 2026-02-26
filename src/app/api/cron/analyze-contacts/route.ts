// Phase 36+39: Cron Job — コンタクトAIコンテキスト一括分析（毎日AM7:00 JST = 22:00 UTC）
// Phase 39: 双方向（受信＋送信）メッセージ対応
import { NextResponse, NextRequest } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Phase 39: メッセージ型定義
type CronAnalysisMessage = {
  subject: string;
  body: string;
  from_name: string;
  channel: string;
  timestamp: string;
  direction?: string;
};

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

  console.log('[Cron/Analyze] 日次AI分析開始（双方向対応）:', new Date().toISOString());

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

        // Phase 39+39b: 受信＋送信メッセージを取得
        let receivedMessages: CronAnalysisMessage[] = [];
        let sentMessages: CronAnalysisMessage[] = [];

        if (addresses.length > 0) {
          // 受信メッセージ（相手 → 自分）— metadataも取得
          const { data: recvMsgs } = await supabase
            .from('inbox_messages')
            .select('subject, body, from_name, channel, timestamp, direction, metadata')
            .in('from_address', addresses)
            .order('timestamp', { ascending: false })
            .limit(30);
          receivedMessages = (recvMsgs || []).map((m) => ({ ...m, direction: m.direction || 'received' }));

          // Phase 39b: 受信メッセージから相手がいるルーム/チャンネルIDを抽出
          const contactRoomIds = new Set<string>();
          const contactSlackChannels = new Set<string>();
          for (const m of (recvMsgs || [])) {
            const meta = m.metadata as Record<string, unknown> | null;
            if (meta?.chatworkRoomId) contactRoomIds.add(String(meta.chatworkRoomId));
            if (meta?.slackChannel) contactSlackChannels.add(String(meta.slackChannel));
          }

          // 送信メッセージ: to_list OR 同じルーム/チャンネル
          const { data: sentCandidates, error: sentError } = await supabase
            .from('inbox_messages')
            .select('subject, body, from_name, channel, timestamp, direction, to_list, metadata')
            .eq('direction', 'sent')
            .order('timestamp', { ascending: false })
            .limit(200);

          if (sentError) {
            console.log(`[Cron/Analyze] 送信メッセージ取得エラー: ${contact.name}`, sentError);
          }

          const addressSet = new Set(addresses.map((a) => a.toLowerCase()));
          sentMessages = (sentCandidates || []).filter((m) => {
            const toList = (m.to_list || []) as { name?: string; address?: string }[];
            if (toList.some((t) => t.address && addressSet.has(t.address.toLowerCase()))) return true;
            const meta = m.metadata as Record<string, unknown> | null;
            if (meta?.chatworkRoomId && contactRoomIds.has(String(meta.chatworkRoomId))) return true;
            if (meta?.slackChannel && contactSlackChannels.has(String(meta.slackChannel))) return true;
            return false;
          }).slice(0, 30).map((m) => ({
            subject: m.subject,
            body: m.body,
            from_name: m.from_name,
            channel: m.channel,
            timestamp: m.timestamp,
            direction: 'sent' as const,
          }));
        }

        // Phase 39: 統合して時系列ソート
        const allMessages = [...receivedMessages, ...sentMessages]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50);

        const receivedCount = allMessages.filter((m) => m.direction !== 'sent').length;
        const sentCount = allMessages.filter((m) => m.direction === 'sent').length;

        // Phase 36: ビジネスイベント取得
        const { data: events } = await supabase
          .from('business_events')
          .select('event_type, title, memo, happened_at')
          .eq('contact_id', contact.id)
          .order('happened_at', { ascending: false })
          .limit(10);

        const channelList = channels.map((ch: { channel: string; address: string }) => `${ch.channel}: ${ch.address}`).join(', ');

        // Phase 39: 送受信の方向を明示したメッセージサマリー
        const messageSummaries = allMessages.slice(0, 25).map((m) => {
          const body = (m.body || '').slice(0, 150);
          const direction = m.direction === 'sent' ? '→送信' : '←受信';
          const sender = m.direction === 'sent' ? 'あなた（ユーザー）' : m.from_name;
          return `[${m.channel}/${direction}] ${sender}: ${body}`;
        }).join('\n');

        const eventSummaries = (events || []).map((e) =>
          `[${e.event_type}] ${e.title}${e.memo ? ' - ' + e.memo : ''}`
        ).join('\n');

        // Phase 39: 双方向分析プロンプト
        const systemPrompt = `あなたはビジネスコミュニケーション分析アシスタントです。
コンタクトとの双方向のコミュニケーション傾向を簡潔に分析してください。
メッセージには「←受信」（相手からの発言）と「→送信」（ユーザー自身の発言）が含まれます。
「あなた（ユーザー）」はシステム利用者本人の発言です。
300〜500文字程度の日本語で、前置きなく実用的に記述してください。
関係性、相手の傾向、ユーザー側の対応傾向、やり取りのバランスを含めてください。`;

        const userPrompt = `名前: ${contact.name || '不明'}
会社: ${contact.company_name || '不明'}
部署: ${contact.department || '不明'}
関係性: ${contact.relationship_type || '不明'}
チャンネル: ${channelList || 'なし'}

メッセージ（受信${receivedCount}件 + 送信${sentCount}件 = 合計${allMessages.length}件）:
${messageSummaries || 'なし'}

イベント（${(events || []).length}件）:
${eventSummaries || 'なし'}

この人物との双方向のコミュニケーション傾向を分析してください。`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 800,
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
          console.log(`[Cron/Analyze] 分析完了: ${contact.name} (受信${receivedCount}+送信${sentCount}件)`);
        }
      } catch (contactError) {
        console.error(`[Cron/Analyze] ${contact.name} の分析エラー:`, contactError);
      }
    }

    console.log(`[Cron/Analyze] 日次AI分析完了（双方向対応）: ${analyzedCount}/${targets.length}件`);

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
