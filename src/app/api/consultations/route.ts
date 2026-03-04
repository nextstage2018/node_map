// Phase 58: 社内相談 API
// GET: 自分宛ての相談一覧（相談相手側）/ 自分が出した相談一覧
// POST: 相談への回答
import { NextRequest, NextResponse } from 'next/server';
import { getServerUserId } from '@/lib/serverAuth';
import { getServerSupabase, getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: 相談一覧取得
export async function GET(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') || 'responder'; // responder | requester
  const status = searchParams.get('status'); // pending | answered | all

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ success: true, data: [] });

  try {
    let query = sb
      .from('consultations')
      .select('*, jobs(title, description, source_message_id, source_channel)')
      .order('created_at', { ascending: false });

    if (role === 'responder') {
      query = query.eq('responder_user_id', userId);
    } else {
      query = query.eq('requester_user_id', userId);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Consultations] 取得エラー:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Consultations] エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 相談に回答（相談相手側）
export async function POST(request: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { consultationId, answer } = await request.json();
  if (!consultationId || !answer) {
    return NextResponse.json({ error: 'consultationId and answer are required' }, { status: 400 });
  }

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB not available' }, { status: 500 });

  try {
    // 相談を取得して回答権限チェック
    const { data: consultation, error: getErr } = await sb
      .from('consultations')
      .select('*')
      .eq('id', consultationId)
      .single();

    if (getErr || !consultation) {
      return NextResponse.json({ error: '相談が見つかりません' }, { status: 404 });
    }

    if (consultation.responder_user_id !== userId) {
      return NextResponse.json({ error: 'この相談に回答する権限がありません' }, { status: 403 });
    }

    // 回答を保存
    const { error: updateErr } = await sb
      .from('consultations')
      .update({
        answer,
        status: 'answered',
        answered_at: new Date().toISOString(),
      })
      .eq('id', consultationId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 元のジョブのステータスをdraft_readyに更新
    if (consultation.job_id) {
      // ジョブのチャネル情報を取得して署名を判定
      const { data: jobData } = await sb
        .from('jobs')
        .select('source_channel')
        .eq('id', consultation.job_id)
        .single();
      const jobChannel = jobData?.source_channel || '';
      const isEmailChannel = !jobChannel || jobChannel === 'email';

      // メール署名を取得
      let emailSignature = '';
      if (isEmailChannel) {
        try {
          const { getServerUserEmailSignature } = await import('@/lib/serverAuth');
          emailSignature = await getServerUserEmailSignature();
        } catch { /* ignore */ }
      }

      // AIで返信文面を生成
      let aiDraft = '';
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          system: `あなたはビジネスメールの返信文面を生成するアシスタントです。
社内相談の結果を踏まえた返信文面を生成してください。丁寧なビジネス文面で、相談結果の内容を自然に盛り込んでください。${isEmailChannel && emailSignature ? '署名は別途自動付与されるので、末尾に名前や署名を書かないでください。' : !isEmailChannel ? '末尾に名前や署名を書かないでください（チャットツールのため不要です）。' : ''}`,
          messages: [{
            role: 'user',
            content: `【スレッド要約】\n${consultation.thread_summary || 'なし'}\n\n【相談内容】\n${consultation.question}\n\n【社内からの回答】\n${answer}\n\n上記を踏まえた返信文面を生成してください。`,
          }],
        });
        aiDraft = response.content[0].type === 'text' ? response.content[0].text : '';
      } catch (aiErr) {
        console.error('[Consultations] AI返信生成エラー:', aiErr);
        aiDraft = `社内相談の回答を踏まえた返信:\n\n${answer}`;
      }

      // メールで署名設定がある場合は自動付与
      if (isEmailChannel && emailSignature && aiDraft) {
        aiDraft = aiDraft.trimEnd() + '\n\n' + emailSignature;
      }

      await sb.from('jobs').update({
        status: 'draft_ready',
        ai_draft: aiDraft,
      }).eq('id', consultation.job_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Consultations] 回答エラー:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
