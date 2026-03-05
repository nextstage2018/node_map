import { NextRequest, NextResponse } from 'next/server';
import { AiDraftRequest } from '@/lib/types';
import { generateReplyDraft } from '@/services/ai/aiClient.service';
import { getServerUserId, getServerUserEmailSignature } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * 送信者のコンタクト情報（メモ・AIコンテキスト・会社名等）を取得
 */
async function getContactContext(fromAddress: string, fromName: string): Promise<{
  notes: string;
  aiContext: string;
  companyName: string;
  department: string;
  relationshipType: string;
} | null> {
  try {
    const sb = getServerSupabase() || getSupabase();

    // まずアドレスでcontact_channelsから検索
    let contactId: string | null = null;

    if (fromAddress) {
      const { data: channelData } = await sb
        .from('contact_channels')
        .select('contact_id')
        .eq('address', fromAddress)
        .limit(1);

      if (channelData && channelData.length > 0) {
        contactId = channelData[0].contact_id;
      }
    }

    // アドレスで見つからなければ名前で検索
    if (!contactId && fromName) {
      const { data: nameData } = await sb
        .from('contact_persons')
        .select('id')
        .eq('name', fromName)
        .limit(1);

      if (nameData && nameData.length > 0) {
        contactId = nameData[0].id;
      }
    }

    if (!contactId) return null;

    // コンタクト情報を取得
    const { data: contact } = await sb
      .from('contact_persons')
      .select('notes, ai_context, company_name, department, relationship_type')
      .eq('id', contactId)
      .single();

    if (!contact) return null;

    return {
      notes: contact.notes || '',
      aiContext: contact.ai_context || '',
      companyName: contact.company_name || '',
      department: contact.department || '',
      relationshipType: contact.relationship_type || '',
    };
  } catch (error) {
    console.error('コンタクト情報取得エラー:', error);
    return null;
  }
}

/**
 * 送信者との過去のやり取り（直近5件）を取得
 */
async function getRecentMessages(fromAddress: string, fromName: string, currentMessageId: string): Promise<string[]> {
  try {
    const sb = getServerSupabase() || getSupabase();

    // from_address または from_name で検索（送受信両方）
    let query = sb
      .from('inbox_messages')
      .select('from_name, body, direction, timestamp, subject')
      .neq('id', currentMessageId)
      .order('timestamp', { ascending: false })
      .limit(5);

    if (fromAddress) {
      // この相手からの受信 + この相手への送信を取得
      query = sb
        .from('inbox_messages')
        .select('from_name, body, direction, timestamp, subject')
        .neq('id', currentMessageId)
        .or(`from_address.eq.${fromAddress},to_address.eq.${fromAddress}`)
        .order('timestamp', { ascending: false })
        .limit(5);
    } else if (fromName) {
      query = sb
        .from('inbox_messages')
        .select('from_name, body, direction, timestamp, subject')
        .neq('id', currentMessageId)
        .eq('from_name', fromName)
        .order('timestamp', { ascending: false })
        .limit(5);
    }

    const { data } = await query;

    if (!data || data.length === 0) return [];

    return data.map((msg: Record<string, unknown>) => {
      const dir = msg.direction === 'sent' ? 'あなた→相手' : '相手→あなた';
      const ts = msg.timestamp ? new Date(msg.timestamp as string).toLocaleDateString('ja-JP') : '';
      const subj = msg.subject ? `[${msg.subject}] ` : '';
      const body = (msg.body as string || '').slice(0, 150).replace(/\n/g, ' ');
      return `${ts} ${dir}: ${subj}${body}`;
    });
  } catch (error) {
    console.error('過去メッセージ取得エラー:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    // Phase 22: 認証確認
    const userId = await getServerUserId();
    const body: AiDraftRequest = await request.json();
    const { originalMessage, instruction, scheduleMode } = body;

    // コンタクト情報と過去メッセージと署名を並行取得
    const [contactContext, recentMessages, emailSignature] = await Promise.all([
      getContactContext(
        originalMessage.from?.address || '',
        originalMessage.from?.name || ''
      ),
      getRecentMessages(
        originalMessage.from?.address || '',
        originalMessage.from?.name || '',
        originalMessage.id
      ),
      getServerUserEmailSignature(),
    ]);

    // 日程調整モード: カレンダーの空き時間を取得してinstructionに注入
    let finalInstruction = instruction;
    if (scheduleMode && userId) {
      try {
        const { findFreeSlots, formatFreeSlotsForContext, isCalendarConnected } = await import('@/services/calendar/calendarClient.service');
        const connected = await isCalendarConnected(userId);
        if (connected) {
          const now = new Date();
          const startDate = now.toISOString();
          const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const freeSlots = await findFreeSlots(userId, startDate, endDate, 30);
          const slotsText = formatFreeSlotsForContext(freeSlots, 20);
          finalInstruction = `日程調整の返信を作成してください。以下は私のGoogleカレンダーから取得した実際の空き時間です。この空き時間の中から候補を提案してください。

【私の空き時間（${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 時点のカレンダー参照）】
${slotsText}

## 重要なルール
- 上記の空き時間に含まれる時間帯のみ候補にすること（空き時間外は絶対に提案しない）
- 各日の空き時間をすべて候補として提示すること（1日1枠ではなく、空いている時間帯をそのまま書く）
- 例: 「3/6（金）は 10:00〜12:00、13:00〜18:00 で空いております」のように、日ごとに全空き時間を書く
- 「ご都合の良い日時をお知らせください」のような曖昧な表現ではなく、具体的な空き時間を提示すること
${instruction ? `\n【追加指示】${instruction}` : ''}`;
          console.log('[DraftReply] 日程調整モード: 空き時間', freeSlots.length, '件取得');
        } else {
          finalInstruction = instruction || '日程調整の返信を作成してください。相手に候補日時を聞く形で返信してください。';
          console.log('[DraftReply] 日程調整モード: カレンダー未接続');
        }
      } catch (calError) {
        console.error('[DraftReply] カレンダー取得エラー:', calError);
        finalInstruction = instruction || '日程調整の返信を作成してください。相手に候補日時を聞く形で返信してください。';
      }
    }

    // スレッド内の会話（メールの引用チェーン）
    const threadContext = originalMessage.threadMessages
      ?.map((m: { from: { name: string }; body: string; isOwn?: boolean }) => {
        const who = m.isOwn ? 'あなた' : m.from.name;
        return `${who}: ${m.body.slice(0, 200)}`;
      })
      .join('\n---\n') || '';

    // Phase 62: グループチャネル判定（Slack/CWでチャネル名があればグループ）
    const isGroupChannel = (originalMessage.channel === 'slack' && !!originalMessage.metadata?.slackChannel)
      || (originalMessage.channel === 'chatwork' && !!originalMessage.metadata?.chatworkRoomId);

    const result = await generateReplyDraft(
      originalMessage,
      finalInstruction,
      {
        contactContext: contactContext || undefined,
        recentMessages,
        threadContext,
        isGroupChannel, // Phase 62
      },
      emailSignature,
      userId || undefined
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('AI下書き生成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'AI下書きの生成に失敗しました' },
      { status: 500 }
    );
  }
}
