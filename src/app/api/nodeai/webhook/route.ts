// NodeAI: Recall.ai Webhook受信エンドポイント（v2: 高速化版）
// リアルタイム文字起こし → トリガー検知 or 会話継続 → 応答生成 → TTS → 音声出力
//
// v2 最適化:
// - DB個別クエリ7-8回 → 1回の統合クエリ（getSessionSnapshot）
// - プロジェクトコンテキスト: 5分キャッシュ（getCachedProjectContext）
// - upsertParticipant + addUtterance: 1回のDB書き込みに統合
// - recordResponse と TTS+Audio: 並列実行
// - 全ステップにパフォーマンス計測ログ

import { NextResponse } from 'next/server';
import { detectTrigger, extractQuestion } from '@/services/nodeai/triggerDetector.service';
import {
  getSessionSnapshot,
  addUtteranceAndParticipant,
  recordResponse,
} from '@/services/nodeai/sessionManager.service';
import type { Utterance, Participant } from '@/services/nodeai/sessionManager.service';
import { resolveContactFromEmail, getCachedProjectContext } from '@/services/nodeai/contextBuilder.service';
import { generateResponseFast } from '@/services/nodeai/responseGenerator.service';
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
  // フィラーワードのみの発言は除外
  const fillers = /^(えー|えっと|あの|うーん|まあ|そうですね|はい|うん|ああ|おー)+$/;
  return !fillers.test(cleaned);
}

// ========================================
// POST /api/nodeai/webhook
// ========================================

export async function POST(request: Request): Promise<Response> {
  const t0 = Date.now();

  try {
    const rawPayload = await request.json();
    const payload = rawPayload as WebhookPayload;

    // イベント種別チェック
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

    // 発言テキストを結合
    const fullText = words.map((w) => w.text).filter(Boolean).join(' ').trim();
    if (!fullText) {
      return NextResponse.json({ ok: true });
    }

    // タイムスタンプ解析
    const rawTs = words[0]?.start_timestamp;
    const timestamp = typeof rawTs === 'number'
      ? rawTs
      : typeof rawTs === 'object' && rawTs !== null
        ? (rawTs as { relative: number }).relative
        : Date.now() / 1000;

    // ============================================================
    // Step 1: セッション全データを1回のクエリで取得
    // (旧: getSessionByBotId + isInConversationMode + getLastResponseTimestamp + getRecentContext)
    // ============================================================
    const t1 = Date.now();
    const snapshot = await getSessionSnapshot(botId, 60);
    const t1end = Date.now();
    console.log(`[NodeAI:perf] getSessionSnapshot: ${t1end - t1}ms`);

    if (!snapshot) {
      return NextResponse.json({ ok: true });
    }

    const { session, lastResponseEpoch, isConversationMode: conversationMode, recentContext } = snapshot;

    // ============================================================
    // Step 2: コンタクト解決（メールがある場合のみDB呼び出し）
    // ============================================================
    let contactId: string | undefined;
    let speakerName = participant.name || '参加者';

    if (participant.email) {
      const t2 = Date.now();
      const contact = await resolveContactFromEmail(participant.email);
      console.log(`[NodeAI:perf] resolveContact: ${Date.now() - t2}ms`);
      if (contact) {
        contactId = contact.contactId;
        speakerName = contact.name;
      }
    }

    // ============================================================
    // Step 3: 応答判定（CPU処理のみ、DB不要）
    // ============================================================
    const triggered = detectTrigger(fullText);
    const substantive = isSubstantiveText(fullText);

    console.log(`[NodeAI] "${fullText}" | trigger=${triggered} convMode=${conversationMode} substantive=${substantive}`);

    // フィラーや短すぎる発言は無視（会話継続モードでも）
    if (!triggered && conversationMode && !substantive) {
      // DB書き込みは応答不要でも実行（バッファ蓄積）
      fireWriteInBackground(botId, fullText, timestamp, contactId, speakerName, participant, session);
      return NextResponse.json({ ok: true });
    }

    if (!triggered && !conversationMode) {
      // 応答不要: DB書き込みだけ行う
      fireWriteInBackground(botId, fullText, timestamp, contactId, speakerName, participant, session);
      return NextResponse.json({ ok: true });
    }

    // エコー防止チェック
    const nowEpoch = Date.now() / 1000;
    if (lastResponseEpoch && (nowEpoch - lastResponseEpoch) < 8) {
      console.log(`[NodeAI] Echo prevention: ${(nowEpoch - lastResponseEpoch).toFixed(1)}s since last response`);
      return NextResponse.json({ ok: true, reason: 'echo_prevention' });
    }

    // 質問テキストを決定
    let question: string;
    if (triggered) {
      const extracted = extractQuestion(fullText);
      question = extracted || '現在のプロジェクトの状況を簡潔に教えてください';
    } else {
      question = fullText;
    }

    const mode = triggered ? 'trigger' : 'conversation';
    console.log(`[NodeAI] ${mode}: "${question}" by ${speakerName}`);

    if (!session.projectId) {
      return NextResponse.json({ ok: true, reason: 'no_project' });
    }

    // ============================================================
    // Step 4: DB書き込み（utterance+participant）を応答生成と並列実行
    // ============================================================
    const utterance: Utterance = {
      speakerName,
      speakerContactId: contactId,
      speakerEmail: participant.email,
      speakerId: participant.id,
      text: fullText,
      timestamp,
    };
    const participantData: Participant = {
      id: participant.id,
      name: speakerName,
      email: participant.email,
      contactId,
      isHost: participant.is_host,
    };

    // DB書き込みと応答生成を並列実行
    const t4 = Date.now();

    const [, aiResult] = await Promise.all([
      // 非クリティカル: utterance + participant書き込み
      addUtteranceAndParticipant(
        botId, utterance, participantData,
        session.utteranceBuffer, session.participants
      ),
      // クリティカル: AI応答生成（キャッシュ付きコンテキスト + Claude API）
      generateResponseFast({
        botId,
        projectId: session.projectId,
        question,
        speakerName,
        speakerContactId: contactId,
        relationshipType: session.relationshipType,
        recentContext, // snapshotから取得済み → DB再読み不要
      }),
    ]);

    console.log(`[NodeAI:perf] write+AI parallel: ${Date.now() - t4}ms`);

    if (!aiResult.success) {
      console.error('[NodeAI] AI response failed:', aiResult.error);
    }

    const responseText = aiResult.text;

    // ============================================================
    // Step 5: recordResponse と TTS+Audio を並列実行
    // ============================================================
    const t5 = Date.now();

    if (isTTSConfigured()) {
      try {
        // recordResponse（DB書き込み）と TTS（外部API）を並列開始
        const [, mp3Base64] = await Promise.all([
          recordResponse(botId, question, responseText),
          textToSpeech(responseText),
        ]);
        console.log(`[NodeAI:perf] record+TTS parallel: ${Date.now() - t5}ms`);

        // Audio出力
        const t6 = Date.now();
        await outputAudio(botId, mp3Base64);
        console.log(`[NodeAI:perf] outputAudio: ${Date.now() - t6}ms`);
        console.log(`[NodeAI] Audio sent (${mode}): "${responseText.substring(0, 50)}..."`);
      } catch (ttsErr) {
        console.error('[NodeAI] TTS/Audio failed:', ttsErr);
        // TTS失敗してもrecordResponseは実行する
        await recordResponse(botId, question, responseText);
      }
    } else {
      await recordResponse(botId, question, responseText);
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
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}

/**
 * 応答不要時のDB書き込み（バッファ蓄積）
 * Vercelはreturn後にバックグラウンド処理を打ち切るため、awaitして完了させる
 * ただし呼び出し元では応答不要なのですぐreturnし、このPromiseは待たない構成にはできない
 * → 実際にはawaitする（Vercel制約）
 */
async function fireWriteInBackground(
  botId: string,
  fullText: string,
  timestamp: number,
  contactId: string | undefined,
  speakerName: string,
  participant: { id: number; name: string; email?: string; is_host?: boolean },
  session: { utteranceBuffer: Utterance[]; participants: Participant[] }
): Promise<void> {
  const utterance: Utterance = {
    speakerName,
    speakerContactId: contactId,
    speakerEmail: participant.email,
    speakerId: participant.id,
    text: fullText,
    timestamp,
  };
  const participantData: Participant = {
    id: participant.id,
    name: speakerName,
    email: participant.email,
    contactId,
    isHost: participant.is_host,
  };

  await addUtteranceAndParticipant(
    botId, utterance, participantData,
    session.utteranceBuffer, session.participants
  );
}
