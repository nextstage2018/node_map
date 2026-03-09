// MeetGeek Webhook受信エンドポイント
// 会議終了 → 参加者からプロジェクト自動判定 → 議事録登録 → AI解析 → 検討ツリー・ビジネスイベント自動生成
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MEETGEEK_API_BASE = 'https://api.meetgeek.ai/v1';

// HMAC SHA-256 署名検証
function verifySignature(body: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// MeetGeek APIからミーティング情報を取得
async function fetchMeetGeekMeeting(meetingId: string, apiKey: string) {
  // サマリー取得
  const summaryRes = await fetch(`${MEETGEEK_API_BASE}/meetings/${meetingId}/summary`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  let summary = null;
  if (summaryRes.ok) {
    summary = await summaryRes.json();
  }

  // トランスクリプト取得（全ページ）
  let allSentences: Array<{ id: number; speaker: string; timestamp: string; transcript: string }> = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${MEETGEEK_API_BASE}/meetings/${meetingId}/transcript`);
    url.searchParams.set('limit', '500');
    if (cursor) url.searchParams.set('cursor', cursor);

    const transcriptRes = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!transcriptRes.ok) break;

    const data = await transcriptRes.json();
    allSentences = allSentences.concat(data.sentences || []);
    cursor = data.pagination?.next_cursor || null;
  } while (cursor);

  // ミーティング一覧から日時情報を取得
  const meetingsRes = await fetch(`${MEETGEEK_API_BASE}/meetings?limit=500`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  let meetingMeta = null;
  if (meetingsRes.ok) {
    const meetingsData = await meetingsRes.json();
    meetingMeta = meetingsData.meetings?.find((m: { meeting_id: string }) => m.meeting_id === meetingId);
  }

  return { summary, sentences: allSentences, meetingMeta };
}

// トランスクリプトをテキストに変換
function formatTranscript(sentences: Array<{ speaker: string; transcript: string }>): string {
  return sentences.map(s => `${s.speaker}: ${s.transcript}`).join('\n');
}

// 参加者名からユニークなspeaker一覧を抽出
function extractSpeakers(sentences: Array<{ speaker: string }>): string[] {
  const speakers = new Set<string>();
  sentences.forEach(s => {
    if (s.speaker) speakers.add(s.speaker.trim());
  });
  return Array.from(speakers);
}

// プロジェクト自動判定
// 優先順位: 1.参加者→コンタクト→組織→プロジェクト  2.カレンダー予定マッチ  3.フォールバック
async function resolveProjectId(
  supabase: ReturnType<typeof getServerSupabase>,
  speakers: string[],
  meetingDate: string,
  summaryText: string | null
): Promise<{ projectId: string | null; matchMethod: string }> {
  if (!supabase) return { projectId: null, matchMethod: 'none' };

  // --- 方法1: 参加者名 → contact_persons → organization → projects ---
  if (speakers.length > 0) {
    // speaker名でcontact_personsをあいまい検索（display_name部分一致）
    const { data: contacts } = await supabase
      .from('contact_persons')
      .select('id, display_name, organization_id');

    if (contacts && contacts.length > 0) {
      // speaker名とcontact display_nameのマッチング（部分一致）
      const matchedOrgIds = new Set<string>();
      for (const speaker of speakers) {
        const speakerLower = speaker.toLowerCase();
        for (const contact of contacts) {
          if (!contact.organization_id) continue;
          const contactName = (contact.display_name || '').toLowerCase();
          // 名前の部分一致（「田中」⊂「田中太郎」、「Tanaka」⊂「Tanaka Taro」）
          if (contactName.includes(speakerLower) || speakerLower.includes(contactName)) {
            matchedOrgIds.add(contact.organization_id);
          }
        }
      }

      if (matchedOrgIds.size > 0) {
        // マッチした組織のプロジェクトを取得（最新を優先）
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('organization_id', Array.from(matchedOrgIds))
          .order('created_at', { ascending: false });

        if (projects && projects.length > 0) {
          // サマリーテキストとプロジェクト名の類似度でさらに絞り込み
          if (summaryText && projects.length > 1) {
            const summaryLower = summaryText.toLowerCase();
            const bestMatch = projects.find(p =>
              summaryLower.includes(p.name.toLowerCase())
            );
            if (bestMatch) {
              console.log(`[MeetGeek Webhook] プロジェクト判定: 参加者+サマリー一致 → ${bestMatch.name}`);
              return { projectId: bestMatch.id, matchMethod: 'speaker_and_summary' };
            }
          }
          // 最新プロジェクトを使用
          console.log(`[MeetGeek Webhook] プロジェクト判定: 参加者組織一致 → ${projects[0].name}`);
          return { projectId: projects[0].id, matchMethod: 'speaker_organization' };
        }
      }
    }
  }

  // --- 方法2: カレンダー予定との日時マッチング ---
  // business_eventsから同日のカレンダー系イベントを探す
  if (meetingDate) {
    const { data: calendarEvents } = await supabase
      .from('business_events')
      .select('project_id, title')
      .eq('event_type', 'meeting')
      .eq('event_date', meetingDate)
      .not('project_id', 'is', null);

    if (calendarEvents && calendarEvents.length > 0) {
      // サマリーとイベントタイトルで照合
      if (summaryText && calendarEvents.length > 1) {
        const summaryLower = summaryText.toLowerCase();
        const bestMatch = calendarEvents.find(e =>
          summaryLower.includes((e.title || '').toLowerCase()) ||
          (e.title || '').toLowerCase().includes(summaryLower.substring(0, 30))
        );
        if (bestMatch) {
          console.log(`[MeetGeek Webhook] プロジェクト判定: カレンダー+サマリー一致 → ${bestMatch.title}`);
          return { projectId: bestMatch.project_id, matchMethod: 'calendar_and_summary' };
        }
      }
      // 最初のマッチを使用
      console.log(`[MeetGeek Webhook] プロジェクト判定: カレンダー日付一致 → ${calendarEvents[0].title}`);
      return { projectId: calendarEvents[0].project_id, matchMethod: 'calendar_date' };
    }
  }

  // --- 方法3: フォールバック（最新プロジェクト） ---
  const { data: latestProject } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestProject) {
    console.log(`[MeetGeek Webhook] プロジェクト判定: フォールバック（最新） → ${latestProject.name}`);
    return { projectId: latestProject.id, matchMethod: 'fallback_latest' };
  }

  return { projectId: null, matchMethod: 'none' };
}

export async function POST(request: NextRequest) {
  try {
    // 環境変数チェック
    const meetgeekApiKey = process.env.MEETGEEK_API_KEY;
    const meetgeekWebhookSecret = process.env.MEETGEEK_WEBHOOK_SECRET;
    const userId = process.env.ENV_TOKEN_OWNER_ID;

    if (!meetgeekApiKey) {
      console.error('[MeetGeek Webhook] MEETGEEK_API_KEY が未設定');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // リクエストボディを取得（署名検証用にrawも保持）
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // HMAC署名検証（secretが設定されている場合のみ）
    if (meetgeekWebhookSecret) {
      const signature = request.headers.get('x-mg-signature') || '';
      if (!verifySignature(rawBody, signature, meetgeekWebhookSecret)) {
        console.error('[MeetGeek Webhook] 署名検証失敗');
        return new NextResponse(null, { status: 200 });
      }
    }

    // 解析失敗の場合はスキップ
    if (body.message === 'File analyzed failed') {
      console.log('[MeetGeek Webhook] 解析失敗通知をスキップ');
      return new NextResponse(null, { status: 200 });
    }

    const meetingId = body.meeting_id;
    if (!meetingId) {
      console.error('[MeetGeek Webhook] meeting_idが見つからない:', body);
      return new NextResponse(null, { status: 200 });
    }

    console.log(`[MeetGeek Webhook] 会議ID受信: ${meetingId}`);

    // Supabase初期化
    const supabase = getServerSupabase() || getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      console.error('[MeetGeek Webhook] Supabase未設定');
      return new NextResponse(null, { status: 200 });
    }

    // 重複チェック（同じMeetGeek meeting_idで既に登録済みか）
    const { data: existing } = await supabase
      .from('meeting_records')
      .select('id')
      .eq('source_type', 'meetgeek')
      .eq('source_file_id', meetingId)
      .maybeSingle();

    if (existing) {
      console.log(`[MeetGeek Webhook] 既に登録済み: ${meetingId}`);
      return new NextResponse(null, { status: 200 });
    }

    // MeetGeek APIから詳細を取得
    const { summary, sentences, meetingMeta } = await fetchMeetGeekMeeting(meetingId, meetgeekApiKey);

    if (!sentences || sentences.length === 0) {
      console.error(`[MeetGeek Webhook] トランスクリプトが空: ${meetingId}`);
      return new NextResponse(null, { status: 200 });
    }

    // 会議タイトルと日時を組み立て
    const summaryText = summary?.summary || null;
    const meetingTitle = summaryText
      ? `MeetGeek: ${summaryText.substring(0, 60)}${summaryText.length > 60 ? '...' : ''}`
      : `MeetGeek会議 ${meetingId.substring(0, 8)}`;
    const meetingDate = meetingMeta?.timestamp_start_utc
      ? meetingMeta.timestamp_start_utc.split('T')[0]
      : new Date().toISOString().split('T')[0];

    // トランスクリプト整形
    const transcriptText = formatTranscript(sentences);

    // 参加者を抽出
    const speakers = extractSpeakers(sentences);
    console.log(`[MeetGeek Webhook] 参加者: ${speakers.join(', ')}`);

    // プロジェクト自動判定
    const { projectId, matchMethod } = await resolveProjectId(
      supabase,
      speakers,
      meetingDate,
      summaryText
    );

    if (!projectId) {
      console.error('[MeetGeek Webhook] 紐づけ先プロジェクトが見つかりません');
      return new NextResponse(null, { status: 200 });
    }

    console.log(`[MeetGeek Webhook] プロジェクトID: ${projectId} (判定方法: ${matchMethod})`);

    // meeting_recordsに保存
    const { data: record, error: insertError } = await supabase
      .from('meeting_records')
      .insert({
        project_id: projectId,
        title: meetingTitle,
        meeting_date: meetingDate,
        content: transcriptText,
        source_type: 'meetgeek',
        source_file_id: meetingId,
        user_id: userId || null,
        processed: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[MeetGeek Webhook] 議事録保存エラー:', insertError);
      return new NextResponse(null, { status: 200 });
    }

    console.log(`[MeetGeek Webhook] 議事録保存完了: ${record.id} (speakers: ${speakers.join(', ')}, method: ${matchMethod})`);

    // AI解析を非同期トリガー
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    try {
      const analyzeUrl = `${baseUrl}/api/meeting-records/${record.id}/analyze`;
      console.log(`[MeetGeek Webhook] AI解析開始: ${analyzeUrl}`);

      // MeetGeekサマリーがあれば事前にセット
      if (summaryText) {
        await supabase
          .from('meeting_records')
          .update({ ai_summary: summaryText })
          .eq('id', record.id);
      }

      // analyze APIを非同期呼び出し
      fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-internal': 'true',
        },
      }).catch(err => {
        console.error('[MeetGeek Webhook] AI解析呼び出しエラー（非同期）:', err);
      });

    } catch (analyzeError) {
      console.error('[MeetGeek Webhook] AI解析トリガーエラー:', analyzeError);
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[MeetGeek Webhook] 全体エラー:', error);
    return new NextResponse(null, { status: 200 });
  }
}
