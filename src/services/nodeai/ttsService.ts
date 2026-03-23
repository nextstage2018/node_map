// NodeAI: ElevenLabs TTS サービス
// テキストを日本語音声（MP3）に変換し、Base64で返す
// 低遅延エンドポイント + 会話向け音声設定

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ========================================
// メイン関数
// ========================================

/**
 * テキストをMP3音声に変換し、Base64エンコードして返す
 * optimize_streaming_latency=3 で最速レイテンシ
 */
export async function textToSpeech(text: string): Promise<string> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('ElevenLabs API key or voice ID is not configured');
  }

  // 低遅延エンドポイント（latency optimization level 3 = 最速）
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${ELEVENLABS_VOICE_ID}?optimize_streaming_latency=3&output_format=mp3_22050_32`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',   // バランス型（速度と品質の両立）
      language_code: 'ja',             // 日本語を明示指定（発音精度向上）
      voice_settings: {
        stability: 0.6,            // やや高め → 安定した読み上げ
        similarity_boost: 0.7,     // 声質の忠実度（やや緩めで自然に）
        style: 0.2,                // 控えめ → 日本語で不自然にならない程度
        use_speaker_boost: true,   // 明瞭度向上
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`ElevenLabs TTS error ${res.status}: ${errorText}`);
  }

  // MP3バイナリ → Base64
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

/**
 * ElevenLabs APIが設定済みかチェック
 */
export function isTTSConfigured(): boolean {
  return !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);
}
