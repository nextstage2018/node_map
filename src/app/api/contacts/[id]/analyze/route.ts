// Phase 36+39: コンタクトAIコンテキスト分析 API（双方向対応）
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { getServerUserId } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

// メッセージ型定義（Phase 39: direction追加）
type AnalysisMessage = {
  subject: string;
  body: string;
  from_name: string;
  from_address: string;
  channel: string;
  timestamp: string;
  direction?: string;
};

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

    // Phase 36+39: このコンタクトとのメッセージ履歴を取得（受信＋送信）
    const channels = (contact.contact_channels || []) as { channel: string; address: string }[];
    const addresses = channels.map((ch: { address: string }) => ch.address).filter(Boolean);

    console.log(`[Contacts Analyze API] contactId=${contactId}, name=${contact.name}`);
    console.log(`[Contacts Analyze API] contact_channels(${channels.length}件):`, channels.map((ch) => `${ch.channel}:${ch.address}`));
    console.log(`[Contacts Analyze API] フィルタ用アドレス(${addresses.length}件):`, addresses);

    let receivedMessages: AnalysisMessage[] = [];
    let sentMessages: AnalysisMessage[] = [];

    if (addresses.length > 0) {
      // Phase 39: 受信メッセージ（相手 → 自分）— metadataも取得（ルーム/チャンネル特定用）
      const { data: recvMsgs, error: recvError } = await supabase
        .from('inbox_messages')
        .select('subject, body, from_name, from_address, channel, timestamp, direction, metadata')
        .in('from_address', addresses)
        .order('timestamp', { ascending: false })
        .limit(50);
      receivedMessages = (recvMsgs || []).map((m) => ({ ...m, direction: m.direction || 'received' }));
      if (recvError) {
        console.error(`[Contacts Analyze API] 受信メッセージクエリエラー:`, recvError);
      }

      // Phase 39b: 受信メッセージから相手がいるルーム/チャンネルIDを抽出
      const contactRoomIds = new Set<string>();
      const contactSlackChannels = new Set<string>();
      for (const m of (recvMsgs || [])) {
        const meta = m.metadata as Record<string, unknown> | null;
        if (meta?.chatworkRoomId) contactRoomIds.add(String(meta.chatworkRoomId));
        if (meta?.slackChannel) contactSlackChannels.add(String(meta.slackChannel));
      }
      console.log(`[Contacts Analyze API] 相手のルーム/チャンネル: CW=${[...contactRoomIds].join(',')}, Slack=${[...contactSlackChannels].join(',')}`);

      // Phase 39+39b: 送信メッセージ（自分 → 相手）
      // to_list でのマッチ OR 同じルーム/チャンネルにいることでマッチ
      const { data: sentCandidates, error: sentError } = await supabase
        .from('inbox_messages')
        .select('subject, body, from_name, from_address, channel, timestamp, direction, to_list, metadata')
        .eq('direction', 'sent')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (sentError) {
        console.error(`[Contacts Analyze API] 送信メッセージクエリエラー:`, sentError);
      }

      const addressSet = new Set(addresses.map((a) => a.toLowerCase()));
      sentMessages = (sentCandidates || []).filter((m) => {
        // 方法1: to_list に相手のアドレスが含まれる（Email向け）
        const toList = (m.to_list || []) as { name?: string; address?: string }[];
        if (toList.some((t) => t.address && addressSet.has(t.address.toLowerCase()))) {
          return true;
        }
        // 方法2: 同じChatworkルームに相手がいる
        const meta = m.metadata as Record<string, unknown> | null;
        if (meta?.chatworkRoomId && contactRoomIds.has(String(meta.chatworkRoomId))) {
          return true;
        }
        // 方法3: 同じSlackチャンネルに相手がいる
        if (meta?.slackChannel && contactSlackChannels.has(String(meta.slackChannel))) {
          return true;
        }
        return false;
      }).slice(0, 50).map((m) => ({
        subject: m.subject,
        body: m.body,
        from_name: m.from_name,
        from_address: m.from_address,
        channel: m.channel,
        timestamp: m.timestamp,
        direction: 'sent' as const,
      }));
    }

    // Phase 39: 受信・送信を統合して時系列ソート
    const allMessages = [...receivedMessages, ...sentMessages]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 80); // 最大80件（十分な会話コンテキスト）

    const receivedCount = allMessages.filter((m) => m.direction !== 'sent').length;
    const sentCount = allMessages.filter((m) => m.direction === 'sent').length;

    console.log(`[Contacts Analyze API] 取得メッセージ: 受信${receivedCount}件 + 送信${sentCount}件 = 合計${allMessages.length}件`);

    // Phase 36: ビジネスイベント履歴を取得（直近20件）
    const { data: events } = await supabase
      .from('business_events')
      .select('event_type, title, memo, happened_at')
      .eq('contact_id', contactId)
      .order('happened_at', { ascending: false })
      .limit(20);

    // Phase 36+39: AIで分析
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      // デモモード: ルールベースのコンテキスト生成
      const demoContext = generateDemoContext(contact, allMessages, events || []);
      return NextResponse.json({ success: true, data: { ai_context: demoContext } });
    }

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const channelList = channels.map((ch: { channel: string; address: string }) => `${ch.channel}: ${ch.address}`).join(', ');

      // Phase 39: メッセージサマリーに送受信の方向を明示
      const messageSummaries = allMessages.slice(0, 40).map((m) => {
        const body = (m.body || '').slice(0, 200);
        const direction = m.direction === 'sent' ? '→送信' : '←受信';
        const sender = m.direction === 'sent' ? 'あなた（ユーザー）' : m.from_name;
        return `[${m.channel}/${direction}] ${sender} (${formatDateSimple(m.timestamp)}): ${m.subject || ''} - ${body}`;
      }).join('\n');

      const eventSummaries = (events || []).map((e) =>
        `[${e.event_type}] ${formatDateSimple(e.happened_at)}: ${e.title}${e.memo ? ' - ' + e.memo : ''}`
      ).join('\n');

      // Phase 39: 双方向分析に対応したプロンプト
      const systemPrompt = `あなたはビジネスコミュニケーション分析アシスタントです。
コンタクト（取引先・同僚など）との双方向のコミュニケーションを分析してください。

メッセージ履歴には「←受信」（相手からの発言）と「→送信」（ユーザー自身の発言）が含まれます。
「あなた（ユーザー）」はシステム利用者本人の発言です。

以下の形式で日本語で回答してください（300〜500文字程度）：
1. この人物との関係性の要約（1〜2文）
2. 相手のコミュニケーション傾向（トピック、トーン、返信速度の印象）
3. ユーザー自身の対応傾向（返信の積極性、やり取りの主導権）
4. 双方向のやり取りの特徴（会話の流れ、頻度、バランス）
5. 注意点やフォローアップのヒント

前置きや見出しは不要です。簡潔かつ実用的に記述してください。`;

      const userPrompt = `## コンタクト情報
名前: ${contact.name || '不明'}
会社: ${contact.company_name || '不明'}
部署: ${contact.department || '不明'}
関係性: ${contact.relationship_type || '不明'}
チャンネル: ${channelList || 'なし'}

## メッセージ履歴（受信${receivedCount}件 + 送信${sentCount}件 = 合計${allMessages.length}件）
${messageSummaries || 'メッセージなし'}

## ビジネスイベント（直近${(events || []).length}件）
${eventSummaries || 'イベントなし'}

この人物との双方向のコミュニケーション傾向を分析してください。受信と送信の両方を踏まえ、関係性の特徴、会話の主導権、返信パターンなどを含めてください。`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const aiContext = response.content[0]?.type === 'text' ? response.content[0].text : '';

      if (!aiContext) {
        const fallback = generateDemoContext(contact, allMessages, events || []);
        return NextResponse.json({ success: true, data: { ai_context: fallback } });
      }

      // Phase 36: 分析結果をnotesカラムに保存
      const { error: updateError } = await supabase
        .from('contact_persons')
        .update({
          notes: aiContext,
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (updateError) {
        console.error('[Contacts Analyze API] DB更新エラー:', updateError);
      }

      return NextResponse.json({ success: true, data: { ai_context: aiContext } });
    } catch (aiError) {
      console.error('[Contacts Analyze API] AIエラー（フォールバック使用）:', aiError);
      const fallback = generateDemoContext(contact, allMessages, events || []);
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

// Phase 36+39: デモモード用のコンテキスト生成（双方向対応）
function generateDemoContext(
  contact: { name?: string; company_name?: string; relationship_type?: string },
  messages: AnalysisMessage[],
  events: { event_type: string; title: string }[]
): string {
  const name = contact.name || '不明';
  const company = contact.company_name ? `（${contact.company_name}）` : '';
  const receivedCount = messages.filter((m) => m.direction !== 'sent').length;
  const sentCount = messages.filter((m) => m.direction === 'sent').length;
  const totalCount = messages.length;
  const eventCount = events.length;

  const channelCounts: Record<string, number> = {};
  for (const m of messages) {
    channelCounts[m.channel] = (channelCounts[m.channel] || 0) + 1;
  }
  const mainChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '不明';

  return `${name}${company}との主なやり取りは${mainChannel}チャンネルで行われています。直近の記録では受信${receivedCount}件・送信${sentCount}件（計${totalCount}件）のメッセージと${eventCount}件のビジネスイベントがあります。${sentCount > 0 ? '双方向のやり取りが確認できます。' : '送信メッセージが未記録のため、受信側のみの分析です。'}定期的なフォローアップを推奨します。`;
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
