// NodeAI: Recall.ai Webhook受信エンドポイント
// リアルタイム文字起こし → トリガー検知 or 会話継続 → 応答生成 → TTS → 音声出力
//
// 処理フロー:
// 1. utterance をバッファに追加
// 2. トリガーワード検知 or 会話継続モード（直前応答から30秒以内）
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
  isInConversationMode,
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

    // セッション取得
    const session = await getSessionByBotId(botId);
    if (!session) {
      return NextResponse.json({ ok: true });
    }

    // 発言テキストを結合（空テキストを除外してから結合）
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
    await addUtterance(botId, {
      speakerName,
      speakerContactId: contactId,
      speakerEmail: participant.email,
      speakerId: participant.id,
      text: fullText,
      timestamp,
    });

    // === 応答判定: トリガー検知 or 会話継続モード ===
    const triggered = detectTrigger(fullText);
    const conversationMode = await isInConversationMode(botId, 30);

    // フィラーや短すぎる発言は無視（会話継続モードでも）
    if (!triggered && conversationMode && !isSubstantiveText(fullText)) {
      return NextResponse.json({ ok: true });
    }

    if (!triggered && !conversationMode) {
      return NextResponse.json({ ok: true });
    }

    // エコー防止チェック（直前の応答から8秒以内なら無視）
    const lastResponseTs = await getLastResponseTimestamp(botId);
    if (shouldIgnoreEcho(lastResponseTs, timestamp, 8)) {
      return NextResponse.json({ ok: true, reason: 'echo_prevention' });
    }

    // 質問テキストを決定
    let question: string;
    if (triggered) {
      // トリガーワード検知 → トリガー以降のテキストを質問に
      const extracted = extractQuestion(fullText);
      question = extracted || '現在のプロジェクトの状況を簡潔に教えてください';
    } else {
      // 会話継続モード → 発言全体が質問
      question = fullText;
    }

    const mode = triggered ? 'trigger' : 'conversation';
    console.log(`[NodeAI] ${mode}: "${question}" by ${speakerName}`);

    // プロジェクトIDが必要
    if (!session.projectId) {
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
    }

    const responseText = aiResult.text;

    // Step 2: 応答をバッファに記録
    await recordResponse(botId, question, responseText);

    // Step 3: TTS → 音声出力
    if (isTTSConfigured()) {
      try {
        const mp3Base64 = await textToSpeech(responseText);
        await outputAudio(botId, mp3Base64);
        console.log(`[NodeAI] Audio sent (${mode}): "${responseText.substring(0, 50)}..."`);
      } catch (ttsErr) {
        console.error('[NodeAI] TTS/Audio failed:', ttsErr);
      }
    }

    return NextResponse.json({
      ok: true,
      triggered: true,
      mode,
      question,
      response: responseText,
    });
  } catch (err) {
    console.error('[NodeAI] Webhook error:', err);
    return NextResponse.json({ ok: true, error: 'Internal processing error' });
  }
}
