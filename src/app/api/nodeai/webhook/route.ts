// NodeAI: Recall.ai Webhook受信エンドポイント
// リアルタイム文字起こし → トリガー検知 → 応答生成 → TTS → 音声出力
//
// 処理フロー:
// 1. utterance をバッファに追加
// 2. トリガーワード検知
// 3. 検知したら → 質問抽出 → Claude応答 → TTS → Recall.ai Output
// 4. 検知しなかったら → 200返却（バッファ蓄積のみ）

import { NextResponse } from 'next/server';
import { detectTrigger, extractQuestion } from '@/services/nodeai/triggerDetector.service';
import {
  addUtterance,
  upsertParticipant,
  getLastResponseTimestamp,
  recordResponse,
  getSessionByBotId,
} from '@/services/nodeai/sessionManager.service';
import { resolveContactFromEmail } from '@/services/nodeai/contextBuilder.service';
import { generateResponse } from '@/services/nodeai/responseGenerator.service';
import { textToSpeech, isTTSConfigured } from '@/services/nodeai/ttsService';
import { outputAudio } from '@/services/nodeai/recallClient.service';
import { shouldIgnoreEcho } from '@/services/nodeai/triggerDetector.service';

// ========================================
// Webhook ペイロード型
// ========================================

interface WebhookPayload {
  event: string;
  data: {
    // Recall.ai の実際のペイロード構造
    bot: {
      id: string;
      metadata?: Record<string, unknown>;
    };
    data: {
      words: Array<{
        text: string;
        start_timestamp: number | { relative: number; absolute: string };
        end_timestamp: number | { relative: number; absolute: string };
      }>;
      participant: {
        id: number;
        name: string;
        email?: string;
        is_host?: boolean;
        platform?: string;
        extra_data?: Record<string, unknown>;
      };
      language_code?: string;
    };
    transcript?: { id: string; metadata?: Record<string, unknown> };
    recording?: { id: string; metadata?: Record<string, unknown> };
    realtime_endpoint?: { id: string; metadata?: Record<string, unknown> };
  };
}

// ========================================
// POST /api/nodeai/webhook
// ========================================

export async function POST(request: Request): Promise<Response> {
  try {
    const rawPayload = await request.json();

    // === デバッグログ: Recall.aiから送られてくる全ペイロードを記録 ===
    console.log('[NodeAI Webhook] Received event:', rawPayload.event || 'unknown');
    console.log('[NodeAI Webhook] Full payload:', JSON.stringify(rawPayload).substring(0, 2000));

    const payload = rawPayload as WebhookPayload;

    // イベント種別チェック（transcript.data以外も記録）
    if (payload.event !== 'transcript.data') {
      console.log(`[NodeAI Webhook] Non-transcript event: ${payload.event}`);
      return NextResponse.json({ ok: true });
    }

    // Recall.ai の実際の構造: data.bot.id（data.bot_id ではない）
    const botId = payload.data?.bot?.id;
    const data = payload.data?.data;
    const words = data?.words;
    const participant = data?.participant;

    console.log(`[NodeAI Webhook] bot_id=${botId}, words=${words?.length || 0}, participant=${participant?.name || 'unknown'}`);

    if (!botId || !words || words.length === 0) {
      console.log('[NodeAI Webhook] Empty words or no botId, skipping');
      return NextResponse.json({ ok: true });
    }

    // セッション取得
    const session = await getSessionByBotId(botId);
    if (!session) {
      console.warn(`[NodeAI] No active session for bot ${botId}`);
      return NextResponse.json({ ok: true });
    }

    // 発言テキストを結合（スペース区切りで結合）
    const fullText = words.map((w) => w.text).join(' ').trim();

    // タイムスタンプ解析（数値 or オブジェクト{relative, absolute}に対応）
    const rawTs = words[0]?.start_timestamp;
    const timestamp = typeof rawTs === 'number'
      ? rawTs
      : typeof rawTs === 'object' && rawTs !== null
        ? (rawTs as { relative: number }).relative
        : Date.now() / 1000;

    // 参加者情報を更新
    let contactId: string | undefined;
    let speakerName = participant.name || '参加者';

    if (participant.email) {
      const contact = await resolveContactFromEmail(participant.email);
      if (contact) {
        contactId = contact.contactId;
        speakerName = contact.name;
      }
    }

    await upsertParticipant(botId, {
      id: participant.id,
      name: speakerName,
      email: participant.email,
      contactId,
      isHost: participant.is_host,
    });

    // utteranceをバッファに追加
    console.log(`[NodeAI Webhook] Utterance: "${fullText}" by ${speakerName}`);

    await addUtterance(botId, {
      speakerName,
      speakerContactId: contactId,
      speakerEmail: participant.email,
      speakerId: participant.id,
      text: fullText,
      timestamp,
    });

    // トリガーワード検知
    const triggered = detectTrigger(fullText);
    console.log(`[NodeAI Webhook] Trigger check: "${fullText}" => ${triggered}`);
    if (!triggered) {
      return NextResponse.json({ ok: true });
    }

    // エコー防止チェック（直前の応答から10秒以内なら無視）
    const lastResponseTs = await getLastResponseTimestamp(botId);
    if (shouldIgnoreEcho(lastResponseTs, timestamp, 10)) {
      console.log(`[NodeAI] Echo prevention: ignoring trigger within 10s`);
      return NextResponse.json({ ok: true, reason: 'echo_prevention' });
    }

    // 質問テキストを抽出（空の場合はデフォルト質問を使用）
    const extractedQuestion = extractQuestion(fullText);
    const question = extractedQuestion || '現在のプロジェクトの状況を簡潔に教えてください';

    console.log(`[NodeAI] Trigger detected: "${question}" by ${speakerName} (extracted: "${extractedQuestion || '(empty → default)'}")`);

    // プロジェクトIDが必要
    if (!session.projectId) {
      console.warn('[NodeAI] No project associated with session');
      // TTS未設定ならここで終了
      if (!isTTSConfigured()) {
        return NextResponse.json({ ok: true, reason: 'no_project' });
      }
      // 「プロジェクトが未設定」を音声で伝える（将来のフォールバック）
      return NextResponse.json({ ok: true, reason: 'no_project' });
    }

    // ===== 応答生成パイプライン =====
    // Step 1: Claude AI で応答テキスト生成
    const aiResult = await generateResponse({
      botId,
      projectId: session.projectId,
      question,
      speakerName,
      speakerContactId: contactId,
      relationshipType: session.relationshipType,
    });

    if (!aiResult.success) {
      console.error('[NodeAI] AI response failed:', aiResult.error);
      // フォールバック応答を使用
    }

    const responseText = aiResult.text;

    // Step 2: 応答をバッファに記録
    await recordResponse(botId, question, responseText);

    // Step 3: TTS → 音声出力（設定済みの場合）
    if (isTTSConfigured()) {
      try {
        const mp3Base64 = await textToSpeech(responseText);
        await outputAudio(botId, mp3Base64);
        console.log(`[NodeAI] Audio output sent for bot ${botId}`);
      } catch (ttsErr) {
        console.error('[NodeAI] TTS/Audio output failed:', ttsErr);
        // TTS失敗はパイプラインをブロックしない
      }
    } else {
      console.log(`[NodeAI] TTS not configured, response text: "${responseText}"`);
    }

    return NextResponse.json({
      ok: true,
      triggered: true,
      question,
      response: responseText,
    });
  } catch (err) {
    console.error('[NodeAI] Webhook processing error:', err);
    // Recall.aiにはエラーでも200を返す（リトライ防止）
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}
