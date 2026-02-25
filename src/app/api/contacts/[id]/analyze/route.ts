// Phase 36: コンタクトAIコンテキスト分析 API
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// POST: 指定コンタクトのやり取りをAIで分析し、コンテキストを生成
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getServerUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Supabase未設定' },
        { status: 400 }
      );
    }

    const { id: contactId } = await params;

    // Phase 36: コンタクト情報を取得
    const { data: contact, error: contactError } = await supabase
      .from('contact_persons')
      .select('*, contact_channels(*)')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { success: false, error: 'コンタクトが見つかりません' },
        { status: 404 }
      );
    }

    // Phase 36: このコンタクトとのメッセージ履歴を取得（直近50件）
    const channels = (contact.contact_channels || []) as { channel: string; address: string }[];
    const addresses = channels.map((ch: { address: string }) => ch.address).filter(Boolean);

    let messages: { subject: string; body_text: string; from_name: string; from_address: string; channel: string; received_at: string }[] = [];
    if (addresses.length > 0) {
      const { data: msgs } = await supabase
        .from('inbox_messages')
        .select('subject, body_text, from_name, from_address, channel, received_at')
        .in('from_address', addresses)
        .eq('user_id', userId)
        .order('received_at', { ascending: false })
        .limit(50);
      messages = msgs || [];
    }

    // Phase 36: ビジネスイベント履歴を取得（直近20件）
    const { data: events } = await supabase
      .from('business_events')
      .select('event_type, title, memo, happened_at')
      .eq('contact_id', contactId)
      .order('happened_at', { ascending: false })
      .limit(20);

    // Phase 36: AIで分析
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      // デモモード: ルールベースのコンテキスト生成
      const demoContext = generateDemoContext(contact, messages, events || []);
      return NextResponse.json({ success: true, data: { ai_context: demoContext } });
    }

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const channelList = channels.map((ch: { channel: string; address: string }) => `${ch.channel}: ${ch.address}`).join(', ');
      const messageSummaries = messages.slice(0, 30).map((m) => {
        const body = (m.body_text || '').slice(0, 200);
        return `[${m.channel}] ${m.from_name} (${formatDateSimple(m.received_at)}): ${m.subject || ''} - ${body}`;
      }).join('\n');
      const eventSummaries = (events || []).map((e) =>
        `[${e.event_type}] ${formatDateSimple(e.happened_at)}: ${e.title}${e.memo ? ' - ' + e.memo : ''}`
      ).join('\n');

      const systemPrompt = `あなたはビジネスコミュニケーション分析アシスタントです。
コンタクト（取引先・同僚など）との関係性やコミュニケーション傾向を分析してください。

以下の形式で日本語で回答してください（200〜400文字程度）：
1. この人物との関係性の要約（1〜2文）
2. 主なやり取りの傾向（トピック、頻度、トーン）
3. 注意点やフォローアップのヒント

前置きや見出しは不要です。簡潔かつ実用的に記述してください。`;

      const userPrompt = `## コンタクト情報
名前: ${contact.name || '不明'}
会社: ${contact.company_name || '不明'}
部署: ${contact.department || '不明'}
関係性: ${contact.relationship_type || '不明'}
チャンネル: ${channelList || 'なし'}

## メッセージ履歴（直近${messages.length}件）
${messageSummaries || 'メッセージなし'}

## ビジネスイベント（直近${(events || []).length}件）
${eventSummaries || 'イベントなし'}

この人物との関係性とコミュニケーション傾向を分析してください。`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const aiContext = response.content[0]?.type === 'text' ? response.content[0].text : '';

      if (!aiContext) {
        const fallback = generateDemoContext(contact, messages, events || []);
        return NextResponse.json({ success: true, data: { ai_context: fallback } });
      }

      // Phase 36: 分析結果をDBに保存
      const { error: updateError } = await supabase
        .from('contact_persons')
        .update({
          ai_context: aiContext,
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (updateError) {
        console.error('[Contacts Analyze API] DB更新エラー:', updateError);
      }

      return NextResponse.json({ success: true, data: { ai_context: aiContext } });
    } catch (aiError) {
      console.error('[Contacts Analyze API] AIエラー（フォールバック使用）:', aiError);
      const fallback = generateDemoContext(contact, messages, events || []);
      return NextResponse.json({ success: true, data: { ai_context: fallback } });
    }
  } catch (error) {
    console.error('[Contacts Analyze API] エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI分析に失敗しました' },
      { status: 500 }
    );
  }
}

// Phase 36: デモモード用のコンテキスト生成
function generateDemoContext(
  contact: { name?: string; company_name?: string; relationship_type?: string },
  messages: { channel: string }[],
  events: { event_type: string; title: string }[]
): string {
  const name = contact.name || '不明';
  const company = contact.company_name ? `（${contact.company_name}）` : '';
  const msgCount = messages.length;
  const eventCount = events.length;

  const channelCounts: Record<string, number> = {};
  for (const m of messages) {
    channelCounts[m.channel] = (channelCounts[m.channel] || 0) + 1;
  }
  const mainChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '不明';

  return `${name}${company}との主なやり取りは${mainChannel}チャンネルで行われており、直近${msgCount}件のメッセージ、${eventCount}件のビジネスイベントが記録されています。定期的なフォローアップを推奨します。`;
}

// Phase 36: 日付フォーマット
function formatDateSimple(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}
