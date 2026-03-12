// MeetGeek Webhook受信エンドポイント
// 会議終了 → 全データ取得（メタ・サマリー・トランスクリプト・ハイライト）
// → 参加者からプロジェクト自動判定 → 議事録登録 → AI解析 → 検討ツリー・ビジネスイベント自動生成
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import crypto from 'crypto';
import * as DriveService from '@/services/drive/driveClient.service';

export const dynamic = 'force-dynamic';

const MEETGEEK_API_BASE = 'https://api.meetgeek.ai/v1';

// ---- 型定義 ----

interface AnalysisTopic {
  title: string;
  options: string[];
  decision: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface MeetGeekMeetingMeta {
  meeting_id: string;
  title?: string;
  host_email?: string;
  participant_emails?: string[];
  source?: string;       // google, outlook, etc.
  join_link?: string;
  language?: string;
  timezone?: string;
  timestamp_start_utc?: string;
  timestamp_end_utc?: string;
  template?: { id: string; name: string };
  team_ids?: string[];
  event_id?: string;
}

interface MeetGeekSentence {
  id: number;
  speaker: string;
  timestamp: string;
  transcript: string;
}

interface MeetGeekHighlight {
  highlightText: string;
  label: string;
}

interface MeetGeekSummary {
  summary?: string;
  ai_insights?: string;
}

interface MeetGeekFetchResult {
  meetingDetail: MeetGeekMeetingMeta | null;
  summary: MeetGeekSummary | null;
  sentences: MeetGeekSentence[];
  highlights: MeetGeekHighlight[];
  meetingMeta: MeetGeekMeetingMeta | null; // from list API (fallback)
}

// ---- ユーティリティ ----

// HMAC SHA-256 署名検証
function verifySignature(body: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

// MeetGeek APIから全データを取得
async function fetchMeetGeekMeeting(meetingId: string, apiKey: string): Promise<MeetGeekFetchResult> {
  const headers = { 'Authorization': `Bearer ${apiKey}` };

  // --- 1. 会議詳細（GET /meetings/{id}）---
  let meetingDetail: MeetGeekMeetingMeta | null = null;
  try {
    const detailRes = await fetch(`${MEETGEEK_API_BASE}/meetings/${meetingId}`, { headers });
    if (detailRes.ok) {
      meetingDetail = await detailRes.json();
      console.log(`[MeetGeek Webhook] 会議詳細取得成功: ${meetingDetail?.title || meetingId}`);
    } else {
      console.warn(`[MeetGeek Webhook] 会議詳細取得失敗: ${detailRes.status}`);
    }
  } catch (err) {
    console.warn('[MeetGeek Webhook] 会議詳細取得エラー:', err);
  }

  // --- 2. サマリー取得 ---
  let summary: MeetGeekSummary | null = null;
  try {
    const summaryRes = await fetch(`${MEETGEEK_API_BASE}/meetings/${meetingId}/summary`, { headers });
    if (summaryRes.ok) {
      summary = await summaryRes.json();
    }
  } catch (err) {
    console.warn('[MeetGeek Webhook] サマリー取得エラー:', err);
  }

  // --- 3. トランスクリプト取得（全ページ）---
  let allSentences: MeetGeekSentence[] = [];
  let cursor: string | null = null;

  do {
    try {
      const url = new URL(`${MEETGEEK_API_BASE}/meetings/${meetingId}/transcript`);
      url.searchParams.set('limit', '500');
      if (cursor) url.searchParams.set('cursor', cursor);

      const transcriptRes = await fetch(url.toString(), { headers });
      if (!transcriptRes.ok) break;

      const data = await transcriptRes.json();
      allSentences = allSentences.concat(data.sentences || []);
      cursor = data.pagination?.next_cursor || null;
    } catch (err) {
      console.warn('[MeetGeek Webhook] トランスクリプト取得エラー:', err);
      break;
    }
  } while (cursor);

  // --- 4. ハイライト取得 ---
  let highlights: MeetGeekHighlight[] = [];
  try {
    const highlightsRes = await fetch(`${MEETGEEK_API_BASE}/meetings/${meetingId}/highlights`, { headers });
    if (highlightsRes.ok) {
      const highlightsData = await highlightsRes.json();
      highlights = highlightsData.highlights || [];
      console.log(`[MeetGeek Webhook] ハイライト取得: ${highlights.length}件`);
    }
  } catch (err) {
    console.warn('[MeetGeek Webhook] ハイライト取得エラー:', err);
  }

  // --- 5. 会議一覧から日時情報取得（詳細APIのフォールバック）---
  let meetingMeta: MeetGeekMeetingMeta | null = null;
  if (!meetingDetail?.timestamp_start_utc) {
    try {
      const meetingsRes = await fetch(`${MEETGEEK_API_BASE}/meetings?limit=500`, { headers });
      if (meetingsRes.ok) {
        const meetingsData = await meetingsRes.json();
        meetingMeta = meetingsData.meetings?.find((m: { meeting_id: string }) => m.meeting_id === meetingId) || null;
      }
    } catch (err) {
      console.warn('[MeetGeek Webhook] 会議一覧取得エラー:', err);
    }
  }

  return { meetingDetail, summary, sentences: allSentences, highlights, meetingMeta };
}

// 日本語テキストのスペース除去（MeetGeekの文字起こしアーティファクト対応）
// 例: "こ れ は テ ス ト" → "これはテスト"
function cleanJapaneseSpaces(text: string): string {
  // 日本語文字（ひらがな・カタカナ・漢字・全角記号）の間のスペースを除去
  // CJK統合漢字 + ひらがな + カタカナ + 全角句読点
  return text.replace(
    /([\u3000-\u9FFF\uF900-\uFAFF])\s+([\u3000-\u9FFF\uF900-\uFAFF])/g,
    '$1$2'
  ).replace(
    // 2回目: 奇数位置のスペースが残る場合があるので再実行
    /([\u3000-\u9FFF\uF900-\uFAFF])\s+([\u3000-\u9FFF\uF900-\uFAFF])/g,
    '$1$2'
  );
}

// トランスクリプトをテキストに変換
function formatTranscript(sentences: MeetGeekSentence[]): string {
  return sentences.map(s => {
    const cleaned = cleanJapaneseSpaces(s.transcript);
    return `${s.speaker}: ${cleaned}`;
  }).join('\n');
}

// 参加者名からユニークなspeaker一覧を抽出
function extractSpeakers(sentences: MeetGeekSentence[]): string[] {
  const speakers = new Set<string>();
  sentences.forEach(s => {
    if (s.speaker) speakers.add(s.speaker.trim());
  });
  return Array.from(speakers);
}

// 参加者情報を構築（メール + トランスクリプトのspeaker名を統合）
function buildParticipants(
  meetingDetail: MeetGeekMeetingMeta | null,
  speakers: string[]
): Array<{ email?: string; name?: string }> {
  const participants: Array<{ email?: string; name?: string }> = [];

  // メールベースの参加者（会議詳細APIから）
  const emails = meetingDetail?.participant_emails || [];
  const hostEmail = meetingDetail?.host_email;

  if (hostEmail) {
    participants.push({ email: hostEmail, name: undefined });
  }
  for (const email of emails) {
    if (email !== hostEmail) {
      participants.push({ email, name: undefined });
    }
  }

  // speaker名を追加（メールと名前を突き合わせる情報がないので別エントリ）
  for (const speaker of speakers) {
    // 既にメールで登録済みの参加者とは別に、名前だけのエントリを追加
    const alreadyExists = participants.some(p => p.name === speaker);
    if (!alreadyExists) {
      participants.push({ email: undefined, name: speaker });
    }
  }

  return participants;
}

// メタデータを構築（DB保存用）
function buildMetadata(meetingDetail: MeetGeekMeetingMeta | null): Record<string, unknown> {
  if (!meetingDetail) return {};
  return {
    host_email: meetingDetail.host_email || null,
    source: meetingDetail.source || null,
    join_link: meetingDetail.join_link || null,
    language: meetingDetail.language || null,
    timezone: meetingDetail.timezone || null,
    template: meetingDetail.template || null,
    team_ids: meetingDetail.team_ids || [],
    event_id: meetingDetail.event_id || null,
  };
}

// プロジェクト自動判定
// 優先順位: 1.参加者メール→コンタクト  2.参加者名→コンタクト→組織→PJ  3.カレンダー予定  4.フォールバック
async function resolveProjectId(
  supabase: ReturnType<typeof getServerSupabase>,
  speakers: string[],
  participantEmails: string[],
  meetingDate: string,
  summaryText: string | null
): Promise<{ projectId: string | null; matchMethod: string }> {
  if (!supabase) return { projectId: null, matchMethod: 'none' };

  // --- 方法0: 参加者メール → contact_channels → contact_persons → organization → projects ---
  if (participantEmails.length > 0) {
    const { data: channels } = await supabase
      .from('contact_channels')
      .select('contact_id')
      .eq('channel', 'email')
      .in('address', participantEmails);

    if (channels && channels.length > 0) {
      const contactIds = channels.map(c => c.contact_id);
      const { data: contacts } = await supabase
        .from('contact_persons')
        .select('id, organization_id')
        .in('id', contactIds)
        .not('organization_id', 'is', null);

      if (contacts && contacts.length > 0) {
        const orgIds = [...new Set(contacts.map(c => c.organization_id).filter(Boolean))];
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('organization_id', orgIds)
          .order('created_at', { ascending: false });

        if (projects && projects.length > 0) {
          if (summaryText && projects.length > 1) {
            const summaryLower = summaryText.toLowerCase();
            const bestMatch = projects.find(p => summaryLower.includes(p.name.toLowerCase()));
            if (bestMatch) {
              console.log(`[MeetGeek Webhook] プロジェクト判定: メール+サマリー一致 → ${bestMatch.name}`);
              return { projectId: bestMatch.id, matchMethod: 'email_and_summary' };
            }
          }
          console.log(`[MeetGeek Webhook] プロジェクト判定: メール組織一致 → ${projects[0].name}`);
          return { projectId: projects[0].id, matchMethod: 'email_organization' };
        }
      }
    }
  }

  // --- 方法1: 参加者名 → contact_persons → organization → projects ---
  if (speakers.length > 0) {
    const { data: contacts } = await supabase
      .from('contact_persons')
      .select('id, display_name, organization_id');

    if (contacts && contacts.length > 0) {
      const matchedOrgIds = new Set<string>();
      for (const speaker of speakers) {
        const speakerLower = speaker.toLowerCase();
        for (const contact of contacts) {
          if (!contact.organization_id) continue;
          const contactName = (contact.display_name || '').toLowerCase();
          if (contactName.includes(speakerLower) || speakerLower.includes(contactName)) {
            matchedOrgIds.add(contact.organization_id);
          }
        }
      }

      if (matchedOrgIds.size > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name')
          .in('organization_id', Array.from(matchedOrgIds))
          .order('created_at', { ascending: false });

        if (projects && projects.length > 0) {
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
          console.log(`[MeetGeek Webhook] プロジェクト判定: 参加者組織一致 → ${projects[0].name}`);
          return { projectId: projects[0].id, matchMethod: 'speaker_organization' };
        }
      }
    }
  }

  // --- 方法2: カレンダー予定との日時マッチング ---
  if (meetingDate) {
    const { data: calendarEvents } = await supabase
      .from('business_events')
      .select('project_id, title')
      .eq('event_type', 'meeting')
      .eq('event_date', meetingDate)
      .not('project_id', 'is', null);

    if (calendarEvents && calendarEvents.length > 0) {
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
      console.log(`[MeetGeek Webhook] プロジェクト判定: カレンダー日付一致 → ${calendarEvents[0].title}`);
      return { projectId: calendarEvents[0].project_id, matchMethod: 'calendar_date' };
    }
  }

  // --- 方法3: フォールバック（最新プロジェクト）---
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

// ---- メインハンドラ ----

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

    // ★ MeetGeek APIから全データを取得（メタ・サマリー・トランスクリプト・ハイライト）
    const { meetingDetail, summary, sentences, highlights, meetingMeta } =
      await fetchMeetGeekMeeting(meetingId, meetgeekApiKey);

    if (!sentences || sentences.length === 0) {
      console.error(`[MeetGeek Webhook] トランスクリプトが空: ${meetingId}`);
      return new NextResponse(null, { status: 200 });
    }

    // ---- データ組み立て ----

    // タイトル: 会議詳細API > サマリー > フォールバック
    const detailTitle = meetingDetail?.title;
    const summaryText = summary?.summary || null;
    const meetingTitle = detailTitle
      || (summaryText
        ? `MeetGeek: ${summaryText.substring(0, 60)}${summaryText.length > 60 ? '...' : ''}`
        : `MeetGeek会議 ${meetingId.substring(0, 8)}`);

    // 日時
    const startUtc = meetingDetail?.timestamp_start_utc || meetingMeta?.timestamp_start_utc;
    const endUtc = meetingDetail?.timestamp_end_utc || meetingMeta?.timestamp_end_utc;
    const meetingDate = startUtc
      ? startUtc.split('T')[0]
      : new Date().toISOString().split('T')[0];

    // トランスクリプト整形
    const transcriptText = formatTranscript(sentences);

    // 参加者
    const speakers = extractSpeakers(sentences);
    const participantEmails = [
      ...(meetingDetail?.participant_emails || []),
      ...(meetingDetail?.host_email ? [meetingDetail.host_email] : []),
    ];
    const participants = buildParticipants(meetingDetail, speakers);
    const metadata = buildMetadata(meetingDetail);

    console.log(`[MeetGeek Webhook] 参加者: ${speakers.join(', ')} | メール: ${participantEmails.length}件 | ハイライト: ${highlights.length}件`);

    // プロジェクト自動判定（メールベースの判定を追加）
    const { projectId, matchMethod } = await resolveProjectId(
      supabase,
      speakers,
      participantEmails,
      meetingDate,
      summaryText
    );

    if (!projectId) {
      console.error('[MeetGeek Webhook] 紐づけ先プロジェクトが見つかりません');
      return new NextResponse(null, { status: 200 });
    }

    console.log(`[MeetGeek Webhook] プロジェクトID: ${projectId} (判定方法: ${matchMethod})`);

    // ---- v4.2: 定例会ルールとの照合 ----
    let recurringRuleId: string | null = null;
    let finalTitle = meetingTitle;
    try {
      const { matchRecurringMeeting } = await import('@/services/v42/recurringRules.service');
      const { ruleId, occurrenceNumber } = await matchRecurringMeeting(
        projectId,
        meetingTitle,
        meetingDate
      );
      if (ruleId) {
        recurringRuleId = ruleId;
        // 「第N回 〇〇」形式でタイトルを更新
        if (occurrenceNumber > 0) {
          finalTitle = `第${occurrenceNumber}回 ${meetingTitle}`;
        }
        console.log(`[MeetGeek Webhook] 定例会マッチ: ruleId=${ruleId}, 第${occurrenceNumber}回`);
      }
    } catch (recurErr) {
      console.warn('[MeetGeek Webhook] 定例会照合エラー（続行）:', recurErr);
    }

    // ---- meeting_recordsに保存 ----
    const { data: record, error: insertError } = await supabase
      .from('meeting_records')
      .insert({
        project_id: projectId,
        title: finalTitle,
        meeting_date: meetingDate,
        content: transcriptText,
        source_type: 'meetgeek',
        source_file_id: meetingId,
        user_id: userId || null,
        processed: false,
        // ★ 新規カラム
        participants,
        meeting_start_at: startUtc || null,
        meeting_end_at: endUtc || null,
        metadata,
        highlights,
        // v4.2: 定例会ルール紐づけ
        recurring_rule_id: recurringRuleId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[MeetGeek Webhook] 議事録保存エラー:', insertError);
      return new NextResponse(null, { status: 200 });
    }

    console.log(`[MeetGeek Webhook] 議事録保存完了: ${record.id} (title: ${meetingTitle}, method: ${matchMethod})`);

    // ---- AI解析 + 検討ツリー生成（awaitで完了を待つ）----
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    let analyzeData: { data?: { analysis?: { topics?: AnalysisTopic[] } } } | null = null;

    // ステップ1: AI解析を実行（awaitで完了を待つ）
    try {
      const analyzeUrl = `${baseUrl}/api/meeting-records/${record.id}/analyze`;
      console.log(`[MeetGeek Webhook] AI解析開始: ${analyzeUrl}`);

      const analyzeRes = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-internal': 'true',
        },
      });
      if (analyzeRes.ok) {
        analyzeData = await analyzeRes.json();
        console.log(`[MeetGeek Webhook] AI解析完了: ${record.id}`);
      } else {
        console.error(`[MeetGeek Webhook] AI解析失敗: ${analyzeRes.status}`);
      }
    } catch (analyzeError) {
      console.error('[MeetGeek Webhook] AI解析トリガーエラー:', analyzeError);
    }

    // ステップ2: 検討ツリー生成（AI解析のtopicsを使用）
    try {
      const topics = analyzeData?.data?.analysis?.topics;
      if (topics && topics.length > 0) {
        const generateUrl = `${baseUrl}/api/decision-trees/generate`;
        console.log(`[MeetGeek Webhook] 検討ツリー生成開始: ${topics.length}件のtopics`);

        const generateRes = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-internal': 'true',
          },
          body: JSON.stringify({
            project_id: projectId,
            meeting_record_id: record.id,
            topics,
          }),
        });
        if (generateRes.ok) {
          console.log(`[MeetGeek Webhook] 検討ツリー生成完了`);
        } else {
          console.error(`[MeetGeek Webhook] 検討ツリー生成失敗: ${generateRes.status}`);
        }
      } else {
        console.log('[MeetGeek Webhook] topicsが空のため検討ツリー生成をスキップ');
      }
    } catch (treeError) {
      console.error('[MeetGeek Webhook] 検討ツリー生成エラー:', treeError);
    }

    // ---- v3.3: トランスクリプトをDriveの会議議事録フォルダに保存 ----
    if (userId && transcriptText) {
      try {
        const connected = await DriveService.isDriveConnected(userId);
        if (connected) {
          // プロジェクト情報取得
          const { data: project } = await supabase
            .from('projects')
            .select('id, name, organization_id, organizations(id, name)')
            .eq('id', projectId)
            .single();

          if (project?.organization_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const org = (project as any).organizations;
            const yearMonth = meetingDate.slice(0, 7); // YYYY-MM

            const meetingFolderId = await DriveService.ensureNewStructureFolder(
              userId,
              project.organization_id,
              org?.name || '不明',
              projectId,
              project.name || '不明',
              { type: 'meeting', yearMonth }
            );

            if (meetingFolderId) {
              const transcriptFileName = DriveService.generateV33FileName(
                `${meetingTitle || '会議'}.txt`,
                'トランスクリプト',
                new Date(meetingDate)
              );

              const buffer = Buffer.from(transcriptText, 'utf-8');
              const driveFile = await DriveService.uploadFile(
                userId,
                buffer,
                transcriptFileName,
                'text/plain',
                meetingFolderId
              );

              if (driveFile) {
                await DriveService.recordDocument({
                  userId,
                  organizationId: project.organization_id,
                  projectId,
                  driveFileId: driveFile.id,
                  driveFolderId: meetingFolderId,
                  fileName: driveFile.name,
                  fileSizeBytes: driveFile.size,
                  mimeType: 'text/plain',
                  driveUrl: driveFile.webViewLink,
                  documentType: 'トランスクリプト',
                  yearMonth,
                });
                console.log(`[MeetGeek Webhook] Drive保存完了: ${transcriptFileName}`);
              }
            }
          }
        }
      } catch (driveError) {
        console.error('[MeetGeek Webhook] Drive保存エラー（処理続行）:', driveError);
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[MeetGeek Webhook] 全体エラー:', error);
    return new NextResponse(null, { status: 200 });
  }
}
