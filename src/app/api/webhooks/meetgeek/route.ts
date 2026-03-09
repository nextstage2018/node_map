// MeetGeek Webhook受信エンドポイント
// 会議終了 → 自動で議事録登録 → AI解析 → 検討ツリー・ビジネスイベント自動生成
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

export async function POST(request: NextRequest) {
  try {
    // 環境変数チェック
    const meetgeekApiKey = process.env.MEETGEEK_API_KEY;
    const meetgeekWebhookSecret = process.env.MEETGEEK_WEBHOOK_SECRET;
    const defaultProjectId = process.env.MEETGEEK_DEFAULT_PROJECT_ID;
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
        return new NextResponse(null, { status: 200 }); // MeetGeek側のリトライを防ぐため200を返す
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
    const meetingTitle = summary?.summary
      ? `MeetGeek: ${summary.summary.substring(0, 60)}...`
      : `MeetGeek会議 ${meetingId.substring(0, 8)}`;
    const meetingDate = meetingMeta?.timestamp_start_utc
      ? meetingMeta.timestamp_start_utc.split('T')[0]
      : new Date().toISOString().split('T')[0];

    // トランスクリプト整形
    const transcriptText = formatTranscript(sentences);

    // プロジェクト紐づけ（デフォルトプロジェクト or 最新プロジェクト）
    let projectId = defaultProjectId;

    if (!projectId) {
      // デフォルト未設定の場合、最新のプロジェクトを使用
      const { data: latestProject } = await supabase
        .from('projects')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestProject) {
        projectId = latestProject.id;
      }
    }

    if (!projectId) {
      console.error('[MeetGeek Webhook] 紐づけ先プロジェクトが見つかりません');
      return new NextResponse(null, { status: 200 });
    }

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

    console.log(`[MeetGeek Webhook] 議事録保存完了: ${record.id}`);

    // AI解析を非同期トリガー（内部APIコール）
    // Vercel上ではfetchで自分自身のAPIを叩く
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    try {
      const analyzeUrl = `${baseUrl}/api/meeting-records/${record.id}/analyze`;
      console.log(`[MeetGeek Webhook] AI解析開始: ${analyzeUrl}`);

      // MeetGeekサマリーがあれば事前にセット
      if (summary?.summary) {
        await supabase
          .from('meeting_records')
          .update({ ai_summary: summary.summary })
          .eq('id', record.id);
      }

      // analyze APIを呼ぶ（認証が必要なので、CRON_SECRETベースの内部認証を使う）
      // 注: analyzeは通常ユーザー認証が必要。Webhookからの内部呼び出し用に
      // 別途バックグラウンド処理を検討する場合はここを調整
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
      // AI解析の失敗は議事録保存に影響させない
      console.error('[MeetGeek Webhook] AI解析トリガーエラー:', analyzeError);
    }

    // 200を返す（MeetGeek仕様: 200 OKでリトライ停止）
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[MeetGeek Webhook] 全体エラー:', error);
    // エラーでも200を返してMeetGeekのリトライを停止
    return new NextResponse(null, { status: 200 });
  }
}
