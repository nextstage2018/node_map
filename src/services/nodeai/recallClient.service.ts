// NodeAI: Recall.ai APIクライアント
// Bot参加・音声出力・Bot停止を管理

const RECALL_API_BASE = 'https://ap-northeast-1.recall.ai/api/v1';
const RECALL_API_KEY = process.env.RECALL_API_KEY || '';

// WebhookのベースURL
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL
  || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://node-map-eight.vercel.app';

// ========================================
// 型定義
// ========================================

interface CreateBotParams {
  meetingUrl: string;
  projectId?: string;
  botName?: string;
}

interface CreateBotResponse {
  id: string;
  status_changes: Array<{ code: string; created_at: string }>;
}

interface BotStatus {
  id: string;
  meeting_url: string;
  bot_name: string;
  status_changes: Array<{ code: string; created_at: string }>;
}

// ========================================
// API呼び出し
// ========================================

/**
 * 共通fetchヘルパー
 */
async function recallFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!RECALL_API_KEY) {
    throw new Error('RECALL_API_KEY is not configured');
  }

  const url = `${RECALL_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Token ${RECALL_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Recall.ai API error ${res.status}: ${errorText}`);
  }

  return res;
}

/**
 * BotをGoogle Meetに参加させる
 */
export async function createBot(params: CreateBotParams): Promise<CreateBotResponse> {
  const { meetingUrl, projectId, botName = 'NodeAI' } = params;

  const webhookUrl = `${WEBHOOK_BASE_URL}/api/nodeai/webhook`;

  const body = {
    meeting_url: meetingUrl,
    bot_name: botName,
    recording_config: {
      transcript: {
        provider: {
          meeting_captions: {},
        },
      },
      realtime_endpoints: [
        {
          type: 'webhook',
          url: webhookUrl,
          events: ['transcript.data'],
        },
      ],
    },
    // metadata にプロジェクト情報を埋め込み
    metadata: {
      project_id: projectId || null,
      source: 'nodemap',
    },
  };

  const res = await recallFetch('/bot/', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return res.json();
}

/**
 * Bot の状態を取得
 */
export async function getBotStatus(botId: string): Promise<BotStatus> {
  const res = await recallFetch(`/bot/${botId}/`);
  return res.json();
}

/**
 * Bot に音声を出力させる（MP3データをBase64で送信）
 */
export async function outputAudio(botId: string, mp3Base64: string): Promise<void> {
  await recallFetch(`/bot/${botId}/output_audio/`, {
    method: 'POST',
    body: JSON.stringify({
      kind: 'mp3',
      b64_data: mp3Base64,
    }),
  });
}

/**
 * Bot を会議から退出させる
 */
export async function leaveBot(botId: string): Promise<void> {
  await recallFetch(`/bot/${botId}/leave/`, {
    method: 'POST',
  });
}

/**
 * Recall.ai APIキーが設定されているかチェック
 */
export function isRecallConfigured(): boolean {
  return !!RECALL_API_KEY;
}
