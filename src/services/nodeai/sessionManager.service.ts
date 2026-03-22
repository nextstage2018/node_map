// NodeAI: セッション管理サービス
// Supabaseの nodeai_sessions テーブルで会話バッファを管理
// Vercelサーバーレス環境のためリクエスト間でメモリ共有不可 → DB永続化

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義
// ========================================

export interface Utterance {
  speakerName: string;
  speakerContactId?: string;
  speakerEmail?: string;
  speakerId?: number;
  text: string;
  timestamp: number;
}

export interface NodeAIResponse {
  question: string;
  answer: string;
  timestamp: number;
}

export interface Participant {
  id: number;
  name: string;
  email?: string;
  contactId?: string;
  isHost?: boolean;
}

export interface NodeAISession {
  id: string;
  botId: string;
  projectId: string | null;
  meetingUrl: string;
  relationshipType: 'internal' | 'client' | 'partner';
  participants: Participant[];
  utteranceBuffer: Utterance[];
  responseHistory: NodeAIResponse[];
  responseCount: number;
  lastResponseAt: string | null;
  status: 'active' | 'ended';
  startedAt: string;
}

// ========================================
// セッション CRUD
// ========================================

function getDb() {
  return getServerSupabase() || getSupabase();
}

/**
 * 新しいセッションを作成
 */
export async function createSession(params: {
  botId: string;
  projectId?: string;
  meetingUrl: string;
  relationshipType?: 'internal' | 'client' | 'partner';
}): Promise<NodeAISession | null> {
  const supabase = getDb();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .insert({
      bot_id: params.botId,
      project_id: params.projectId || null,
      meeting_url: params.meetingUrl,
      relationship_type: params.relationshipType || 'internal',
      participants: [],
      utterance_buffer: [],
      response_history: [],
      response_count: 0,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[NodeAI] Failed to create session:', error.message);
    return null;
  }

  return mapDbToSession(data);
}

/**
 * bot_idでセッションを取得
 */
export async function getSessionByBotId(botId: string): Promise<NodeAISession | null> {
  const supabase = getDb();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .select('*')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;
  return mapDbToSession(data);
}

/**
 * utteranceをバッファに追加
 * 直近5分間のみ保持（古いものは削除）
 */
export async function addUtterance(
  botId: string,
  utterance: Utterance
): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;

  // 現在のセッションを取得
  const { data: session, error: fetchError } = await supabase
    .from('nodeai_sessions')
    .select('utterance_buffer')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (fetchError || !session) return;

  const buffer: Utterance[] = session.utterance_buffer || [];
  buffer.push(utterance);

  // 直近5分間のみ保持
  const fiveMinAgo = Date.now() / 1000 - 300;
  const trimmed = buffer.filter((u) => u.timestamp > fiveMinAgo);

  await supabase
    .from('nodeai_sessions')
    .update({ utterance_buffer: trimmed })
    .eq('bot_id', botId)
    .eq('status', 'active');
}

/**
 * 参加者を追加/更新
 */
export async function upsertParticipant(
  botId: string,
  participant: Participant
): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;

  const { data: session, error } = await supabase
    .from('nodeai_sessions')
    .select('participants')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !session) return;

  const participants: Participant[] = session.participants || [];
  const existing = participants.findIndex((p) => p.id === participant.id);
  if (existing >= 0) {
    participants[existing] = { ...participants[existing], ...participant };
  } else {
    participants.push(participant);
  }

  await supabase
    .from('nodeai_sessions')
    .update({ participants })
    .eq('bot_id', botId)
    .eq('status', 'active');
}

/**
 * NodeAIの応答を記録
 */
export async function recordResponse(
  botId: string,
  question: string,
  answer: string
): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;

  const { data: session, error } = await supabase
    .from('nodeai_sessions')
    .select('response_history, response_count')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !session) return;

  const history: NodeAIResponse[] = session.response_history || [];
  const now = Date.now() / 1000;
  history.push({ question, answer, timestamp: now });

  // 直近20件のみ保持
  const trimmed = history.slice(-20);

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('nodeai_sessions')
    .update({
      response_history: trimmed,
      response_count: (session.response_count || 0) + 1,
      last_response_at: nowIso,
    })
    .eq('bot_id', botId)
    .eq('status', 'active');

  if (updateError) {
    console.error(`[NodeAI] recordResponse update failed:`, updateError.message);
  } else {
    console.log(`[NodeAI] recordResponse: last_response_at set to ${nowIso} (epoch: ${(new Date(nowIso).getTime() / 1000).toFixed(1)})`);
  }
}

/**
 * セッションを終了
 */
export async function endSession(botId: string): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;

  await supabase
    .from('nodeai_sessions')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
    })
    .eq('bot_id', botId)
    .eq('status', 'active');
}

/**
 * 直前の応答タイムスタンプを取得（エコー防止用）
 */
export async function getLastResponseTimestamp(botId: string): Promise<number | null> {
  const supabase = getDb();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .select('last_response_at')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data?.last_response_at) return null;
  return new Date(data.last_response_at).getTime() / 1000;
}

/**
 * 会話継続モード判定
 * 直前の応答から30秒以内なら会話継続中とみなす
 * → トリガーワードなしでも応答する
 */
export async function isInConversationMode(
  botId: string,
  windowSeconds: number = 60
): Promise<boolean> {
  const lastTs = await getLastResponseTimestamp(botId);
  if (!lastTs) {
    console.log(`[NodeAI] convMode check: no lastTs for bot ${botId}`);
    return false;
  }
  const now = Date.now() / 1000;
  const elapsed = now - lastTs;
  const result = elapsed < windowSeconds;
  console.log(`[NodeAI] convMode check: lastTs=${lastTs.toFixed(1)} now=${now.toFixed(1)} elapsed=${elapsed.toFixed(1)}s window=${windowSeconds}s → ${result}`);
  return result;
}

/**
 * 直近の会話バッファを取得（Claude APIに送るためのコンテキスト）
 */
export async function getRecentContext(botId: string): Promise<string> {
  const supabase = getDb();
  if (!supabase) return '';

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .select('utterance_buffer, response_history')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data) return '';

  const utterances: Utterance[] = data.utterance_buffer || [];
  const responses: NodeAIResponse[] = data.response_history || [];

  // 直近の発言（最大15件）をテキスト化
  const recentUtterances = utterances.slice(-15);
  const utteranceText = recentUtterances
    .map((u) => `${u.speakerName}: ${u.text}`)
    .join('\n');

  // 直近のNodeAI応答（最大3件）
  const recentResponses = responses.slice(-3);
  const responseText = recentResponses
    .map((r) => `[質問] ${r.question}\n[NodeAI] ${r.answer}`)
    .join('\n\n');

  let context = '';
  if (utteranceText) {
    context += `【直近の議論】\n${utteranceText}\n\n`;
  }
  if (responseText) {
    context += `【過去の応答】\n${responseText}`;
  }

  return context;
}

/**
 * 古いactiveセッションをクリーンアップ（3時間超過）
 */
export async function cleanupStaleSessions(): Promise<number> {
  const supabase = getDb();
  if (!supabase) return 0;

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('started_at', threeHoursAgo)
    .select('id');

  if (error) {
    console.error('[NodeAI] Failed to cleanup sessions:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// ========================================
// 一括取得（高速Webhook用）
// ========================================

/**
 * bot_idでセッションの全データを1回のクエリで取得
 * Webhook処理で個別クエリを何度も叩くのを防ぐ
 */
export interface SessionSnapshot {
  session: NodeAISession;
  lastResponseEpoch: number | null;
  isConversationMode: boolean;
  recentContext: string;
}

export async function getSessionSnapshot(
  botId: string,
  conversationWindowSeconds: number = 60
): Promise<SessionSnapshot | null> {
  const supabase = getDb();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .select('*')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;

  const session = mapDbToSession(data);

  // lastResponseEpoch
  const lastResponseEpoch = data.last_response_at
    ? new Date(data.last_response_at).getTime() / 1000
    : null;

  // conversationMode判定
  const now = Date.now() / 1000;
  const isConversationMode = lastResponseEpoch
    ? (now - lastResponseEpoch) < conversationWindowSeconds
    : false;

  // recentContext構築（DB再読み取り不要）
  const utterances: Utterance[] = data.utterance_buffer || [];
  const responses: NodeAIResponse[] = data.response_history || [];

  const recentUtterances = utterances.slice(-15);
  const utteranceText = recentUtterances
    .map((u: Utterance) => `${u.speakerName}: ${u.text}`)
    .join('\n');

  const recentResponses = responses.slice(-3);
  const responseText = recentResponses
    .map((r: NodeAIResponse) => `[質問] ${r.question}\n[NodeAI] ${r.answer}`)
    .join('\n\n');

  let recentContext = '';
  if (utteranceText) {
    recentContext += `【直近の議論】\n${utteranceText}\n\n`;
  }
  if (responseText) {
    recentContext += `【過去の応答】\n${responseText}`;
  }

  return { session, lastResponseEpoch, isConversationMode, recentContext };
}

/**
 * utterance追加 + participant更新を1回のDB書き込みで実行
 * Webhook内で2回に分かれていた書き込みを統合
 */
export async function addUtteranceAndParticipant(
  botId: string,
  utterance: Utterance,
  participant: Participant,
  currentBuffer: Utterance[],
  currentParticipants: Participant[]
): Promise<void> {
  const supabase = getDb();
  if (!supabase) return;

  // バッファに追加 + 5分間トリム
  const buffer = [...currentBuffer, utterance];
  const fiveMinAgo = Date.now() / 1000 - 300;
  const trimmed = buffer.filter((u) => u.timestamp > fiveMinAgo);

  // 参加者を追加/更新
  const participants = [...currentParticipants];
  const existing = participants.findIndex((p) => p.id === participant.id);
  if (existing >= 0) {
    participants[existing] = { ...participants[existing], ...participant };
  } else {
    participants.push(participant);
  }

  // 1回のUPDATEで両方書き込み
  await supabase
    .from('nodeai_sessions')
    .update({ utterance_buffer: trimmed, participants })
    .eq('bot_id', botId)
    .eq('status', 'active');
}

// ========================================
// 内部ヘルパー
// ========================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToSession(row: any): NodeAISession {
  return {
    id: row.id,
    botId: row.bot_id,
    projectId: row.project_id,
    meetingUrl: row.meeting_url,
    relationshipType: row.relationship_type,
    participants: row.participants || [],
    utteranceBuffer: row.utterance_buffer || [],
    responseHistory: row.response_history || [],
    responseCount: row.response_count || 0,
    lastResponseAt: row.last_response_at,
    status: row.status,
    startedAt: row.started_at,
  };
}
