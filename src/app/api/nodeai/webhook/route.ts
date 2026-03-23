// NodeAI: Recall.ai Webhook受信エンドポイント（v3: 極限最適化版）
//
// 最適化戦略:
//   1. 全セッションデータをインメモリキャッシュ（初回以降DB読み 0ms）
//   2. コンタクト解決もキャッシュ（同一メール→同一コンタクト）
//   3. utterance/participant/responseの書き込みは全てメモリのみ（0ms）
//   4. DBフラッシュはoutputAudioと完全並列（応答の遅延に影響しない）
//   5. 非応答パスはDB書き込みなし（30秒ごとのlazyFlushのみ）
//
// 処理フロー（応答時）:
//   メモリ読み(0ms) → AI(~800ms) → TTS(~500ms) → [並列]Audio+DBflush(~900ms)
//
// 処理フロー（非応答時）:
//   メモリ読み(0ms) → メモリ書き(0ms) → return（~5ms total）

import { NextResponse } from 'next/server';
import { detectTrigger, extractQuestion } from '@/services/nodeai/triggerDetector.service';
import {
  getCachedSession,
  addLocalUtterance,
  updateLocalParticipant,
  recordLocalResponse,
  flushToDb,
  lazyFlush,
  buildLocalRecentContext,
  getCachedContact,
} from '@/services/nodeai/sessionCache.service';
import type { Utterance, Participant } from '@/services/nodeai/sessionCache.service';
import { resolveContactFromEmail, getCachedProjectContext } from '@/services/nodeai/contextBuilder.service';
import { generateResponseFast, extractFamilyName, cleanResponseForTTS } from '@/services/nodeai/responseGenerator.service';
import { textToSpeech, isTTSConfigured } from '@/services/nodeai/ttsService';
import { outputAudio } from '@/services/nodeai/recallClient.service';

// ========================================
// Webhook ペイロード型
// ========================================

interface WebhookPayload {
  event: string;
  data: {
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

// 空テキスト・フィラーを除外
function isSubstantiveText(text: string): boolean {
  const cleaned = text.replace(/[\s。、,.!?！？]+/g, '');
  if (cleaned.length < 2) return false;
  const fillers = /^(えー|えっと|あの|うーん|まあ|そうですね|はい|うん|ああ|おー)+$/;
  return !fillers.test(cleaned);
}

// お礼・挨拶・相槌（応答不要な発言）を検出
function isGreetingOrThanks(text: string): boolean {
  const cleaned = text.replace(/[\s。、,.!?！？]+/g, '');
  // 単独フレーズ（繰り返し含む）
  const patterns = /^(はい|うん|ええ|了解|了解です|了解しました|ありがとう|ありがとうございます|ありがとうございました|承知しました|承知です|わかりました|分かりました|かしこまりました|お疲れ様です|お疲れさまです|お疲れ様でした|よろしくお願いします|よろしくお願いいたします|お願いします|すみません|失礼します|失礼しました|大丈夫です|OKです|オッケーです|なるほど|そうですね|確かに|しました|そうですか|そうなんですね|いいですね|素晴らしい|助かります|ですね)+$/;
  if (patterns.test(cleaned)) return true;
  // 複合パターン: 「はい、了解です」「ありがとうございます、承知しました」等
  const compoundPattern = /^(はい|ええ|うん)?(了解です|了解しました|ありがとう|ありがとうございます|ありがとうございました|承知しました|承知です|わかりました|分かりました|かしこまりました|なるほど|そうですね|確かに|しました|ですね)$/;
  return compoundPattern.test(cleaned);
}

// ========================================
// POST /api/nodeai/webhook
// ========================================

export async function POST(request: Request): Promise<Response> {
  const t0 = Date.now();

  try {
    const rawPayload = await request.json();
    const payload = rawPayload as WebhookPayload;

    if (payload.event !== 'transcript.data') {
      return NextResponse.json({ ok: true });
    }

    const botId = payload.data?.bot?.id;
    const data = payload.data?.data;
    const words = data?.words;
    const participant = data?.participant;

    if (!botId || !words || words.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const fullText = words.map((w) => w.text).filter(Boolean).join(' ').trim();
    if (!fullText) return NextResponse.json({ ok: true });

    // タイムスタンプ解析
    const rawTs = words[0]?.start_timestamp;
    const timestamp = typeof rawTs === 'number'
      ? rawTs
      : typeof rawTs === 'object' && rawTs !== null
        ? (rawTs as { relative: number }).relative
        : Date.now() / 1000;

    // ================================================================
    // Step 1: セッション取得（メモリキャッシュ: 0ms / 初回のみDB）
    // ================================================================
    const t1 = Date.now();
    const cached = await getCachedSession(botId);
    const sessionMs = Date.now() - t1;
    if (sessionMs > 10) {
      console.log(`[NodeAI:perf] getSession: ${sessionMs}ms (DB fallback)`);
    }
    if (!cached) return NextResponse.json({ ok: true });

    // 3時間超過のセッションは自動終了（DB上のstarted_atで判定）
    {
      const { autoEndStaleSession } = await import('@/services/nodeai/sessionCache.service');
      const ended = await autoEndStaleSession(botId);
      if (ended) {
        console.log(`[NodeAI] Session auto-ended (stale)`);
        return NextResponse.json({ ok: true, reason: 'session_auto_ended' });
      }
    }

    // ================================================================
    // Step 2: コンタクト解決（キャッシュ: 0ms / 初回のみDB）
    // ================================================================
    let contactId: string | undefined;
    let speakerName = participant.name || '参加者';
    let speakerFamilyName = extractFamilyName(speakerName);

    if (participant.email) {
      const contact = await getCachedContact(participant.email, resolveContactFromEmail);
      if (contact) {
        contactId = contact.contactId;
        speakerName = contact.name;
        speakerFamilyName = extractFamilyName(contact.name);
      }
    }

    // ================================================================
    // Step 3: メモリバッファ更新（DB書き込みなし: 0ms）
    // ================================================================
    const utterance: Utterance = {
      speakerName,
      speakerContactId: contactId,
      speakerEmail: participant.email,
      speakerId: participant.id,
      text: fullText,
      timestamp,
    };
    addLocalUtterance(botId, utterance);
    updateLocalParticipant(botId, {
      id: participant.id,
      name: speakerName,
      email: participant.email,
      contactId,
      isHost: participant.is_host,
    });

    // ================================================================
    // Step 4: 応答判定（CPU処理のみ: 0ms）
    // ================================================================
    const triggered = detectTrigger(fullText);
    const nowEpoch = Date.now() / 1000;
    const conversationMode = cached.lastResponseEpoch
      ? (nowEpoch - cached.lastResponseEpoch) < 60
      : false;
    const substantive = isSubstantiveText(fullText);

    const greeting = isGreetingOrThanks(fullText);

    console.log(`[NodeAI] "${fullText}" | trigger=${triggered} convMode=${conversationMode} sub=${substantive} greet=${greeting}`);

    // --- 非応答パス: メモリ更新のみ。30秒ごとにlazyFlush ---
    // お礼・挨拶には応答しない（会話継続モードでも）
    if (greeting && !triggered) {
      console.log(`[NodeAI] Skip: greeting/thanks`);
      await lazyFlush(botId);
      return NextResponse.json({ ok: true });
    }
    if (!triggered && conversationMode && !substantive) {
      await lazyFlush(botId);
      return NextResponse.json({ ok: true });
    }
    if (!triggered && !conversationMode) {
      await lazyFlush(botId);
      return NextResponse.json({ ok: true });
    }

    // エコー防止（メモリから判定: 0ms）
    if (cached.lastResponseEpoch && (nowEpoch - cached.lastResponseEpoch) < 8) {
      console.log(`[NodeAI] Echo: ${(nowEpoch - cached.lastResponseEpoch).toFixed(1)}s`);
      return NextResponse.json({ ok: true, reason: 'echo_prevention' });
    }

    // ================================================================
    // Step 5: 初回トリガー判定 → 固定挨拶 or AI応答
    // ================================================================
    const isFirstTrigger = triggered && cached.responseHistory.length === 0;

    if (isFirstTrigger) {
      // --- 初回トリガー: AI不要。固定メッセージで即応答 ---
      const greetingText = '起動しました。音声で指示ください。';
      console.log(`[NodeAI] First trigger → greeting: "${greetingText}"`);

      if (isTTSConfigured()) {
        try {
          const tG = Date.now();
          const mp3Base64 = await textToSpeech(greetingText);
          console.log(`[NodeAI:perf] TTS(greeting): ${Date.now() - tG}ms`);
          recordLocalResponse(botId, '(起動)', greetingText);
          const tA = Date.now();
          await Promise.all([
            outputAudio(botId, mp3Base64),
            flushToDb(botId),
          ]);
          console.log(`[NodeAI:perf] audio+flush(greeting): ${Date.now() - tA}ms`);
          console.log(`[NodeAI] Sent (greeting): "${greetingText}"`);
        } catch (ttsErr) {
          console.error('[NodeAI] TTS/Audio failed (greeting):', ttsErr);
          recordLocalResponse(botId, '(起動)', greetingText);
          await flushToDb(botId);
        }
      } else {
        recordLocalResponse(botId, '(起動)', greetingText);
        await flushToDb(botId);
      }

      const totalMs = Date.now() - t0;
      console.log(`[NodeAI:perf] TOTAL: ${totalMs}ms (greeting)`);
      return NextResponse.json({
        ok: true,
        triggered: true,
        mode: 'greeting',
        response: greetingText,
        perfMs: totalMs,
      });
    }

    // --- 2回目以降: 通常のAI応答 ---
    let question: string;
    if (triggered) {
      const extracted = extractQuestion(fullText);
      question = extracted || '現在のプロジェクトの状況を簡潔に教えてください';
    } else {
      question = fullText;
    }

    const mode = triggered ? 'trigger' : 'conversation';
    console.log(`[NodeAI] ${mode}: "${question}" by ${speakerName}`);

    if (!cached.projectId) {
      return NextResponse.json({ ok: true, reason: 'no_project' });
    }

    // ================================================================
    // Step 6: AI応答生成（メモリからコンテキスト構築: 0ms → Claude API）
    // ================================================================
    const recentContext = buildLocalRecentContext(botId);

    const t5 = Date.now();
    const aiResult = await generateResponseFast({
      botId,
      projectId: cached.projectId,
      question,
      speakerName: speakerFamilyName,
      speakerContactId: contactId,
      relationshipType: cached.relationshipType,
      recentContext,
    });
    console.log(`[NodeAI:perf] AI: ${Date.now() - t5}ms`);

    if (!aiResult.success) {
      console.error('[NodeAI] AI failed:', aiResult.error);
    }
    const responseText = cleanResponseForTTS(aiResult.text);

    // ================================================================
    // Step 7: TTS変換（クリティカルパス）
    // ================================================================
    if (isTTSConfigured()) {
      try {
        const t6 = Date.now();
        const mp3Base64 = await textToSpeech(responseText);
        console.log(`[NodeAI:perf] TTS: ${Date.now() - t6}ms`);

        recordLocalResponse(botId, question, responseText);

        // ============================================================
        // Step 8: Audio出力 + DBフラッシュ を完全並列
        // ============================================================
        const t7 = Date.now();
        await Promise.all([
          outputAudio(botId, mp3Base64),
          flushToDb(botId),
        ]);
        console.log(`[NodeAI:perf] audio+flush: ${Date.now() - t7}ms`);
        console.log(`[NodeAI] Sent (${mode}): "${responseText.substring(0, 50)}..."`);
      } catch (ttsErr) {
        console.error('[NodeAI] TTS/Audio failed:', ttsErr);
        recordLocalResponse(botId, question, responseText);
        await flushToDb(botId);
      }
    } else {
      recordLocalResponse(botId, question, responseText);
      await flushToDb(botId);
    }

    const totalMs = Date.now() - t0;
    console.log(`[NodeAI:perf] TOTAL: ${totalMs}ms (${mode})`);

    return NextResponse.json({
      ok: true,
      triggered: true,
      mode,
      question,
      response: responseText,
      perfMs: totalMs,
    });
  } catch (err) {
    console.error('[NodeAI] Webhook error:', err);
    return NextResponse.json({ ok: true, error: 'Internal' });
  }
}
