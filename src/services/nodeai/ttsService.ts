// NodeAI: ElevenLabs TTS サービス
// テキストを日本語音声（MP3）に変換し、Base64で返す

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ========================================
// メイン関数
// ========================================

/**
 * テキストをMP3音声に変換し、Base64エンコードして返す
 */
export async function textToSpeech(text: string): Promise<string> {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('ElevenLabs API key or voice ID is not configured');
  }

  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.7,
        similarity_boost: 0.8,
        style: 0.3,
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
