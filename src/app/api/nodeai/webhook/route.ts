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
    bot_id: string;
    data: {
      words: Array<{
        text: string;
        start_timestamp: number;
        end_timestamp: number;
      }>;
      participant: {
        id: number;
        name: string;
        email?: string;
        is_host?: boolean;
        platform?: string;
      };
      language_code?: string;
    };
  };
}

// ========================================
// POST /api/nodeai/webhook
// ========================================

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as WebhookPayload;

    // イベント種別チェック
    if (payload.event !== 'transcript.data') {
      return NextResponse.json({ ok: true });
    }

    const { bot_id: botId, data } = payload.data;
    const { words, participant } = data;

    if (!botId || !words || words.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // セッション取得
    const session = await getSessionByBotId(botId);
    if (!session) {
      console.warn(`[NodeAI] No active session for bot ${botId}`);
      return NextResponse.json({ ok: true });
    }

    // 発言テキストを結合
    const fullText = words.map((w) => w.text).join('');
    const timestamp = words[0]?.start_timestamp || Date.now() / 1000;

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

    // トリガーワード検知
    if (!detectTrigger(fullText)) {
      return NextResponse.json({ ok: true });
    }

    // エコー防止チェック（直前の応答から10秒以内なら無視）
    const lastResponseTs = await getLastResponseTimestamp(botId);
    if (shouldIgnoreEcho(lastResponseTs, timestamp, 10)) {
      console.log(`[NodeAI] Echo prevention: ignoring trigger within 10s`);
      return NextResponse.json({ ok: true, reason: 'echo_prevention' });
    }

    // 質問テキストを抽出
    const question = extractQuestion(fullText);
    if (!question) {
      return NextResponse.json({ ok: true, reason: 'empty_question' });
    }

    console.log(`[NodeAI] Trigger detected: "${question}" by ${speakerName}`);

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
