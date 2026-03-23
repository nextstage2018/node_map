// NodeAI: インメモリセッションキャッシュ
//
// 設計思想:
//   Vercelサーバーレスのウォームインスタンス内でDB読み書きを最小化。
//   会議中はWebhookが1-2秒間隔で届くため同一インスタンスが再利用される。
//   全データをメモリで持ち、DBへの書き込みは応答時にまとめてflush。
//
// キャッシュ構造:
//   sessionCache: botId → セッション全データ（utterance/participant/response含む）
//   contactCache: email → コンタクト情報（会議中は変わらない）
//
// DBとの同期:
//   - 応答生成時: outputAudioと並列でflushToDb（全変更を1回のUPDATEで書き込み）
//   - 非応答時: 30秒ごとにlazyFlush（バッファ喪失防止）
//   - セッション終了時: clearSessionCache

import { getServerSupabase, getSupabase } from '@/lib/supabase';

// ========================================
// 型定義（sessionManager.service.tsと同一）
// ========================================

export interface Utterance {
  speakerName: string;
  speakerContactId?: string;
  speakerEmail?: string;
  speakerId?: number;
  text: string;
  timestamp: number;
}

export interface Participant {
  id: number;
  name: string;
  email?: string;
  contactId?: string;
  isHost?: boolean;
}

export interface NodeAIResponse {
  question: string;
  answer: string;
  timestamp: number;
}

// ========================================
// キャッシュデータ構造
// ========================================

export interface CachedSessionData {
  // DBから読み込んだセッション基本情報
  id: string;
  botId: string;
  projectId: string | null;
  relationshipType: 'internal' | 'client' | 'partner';
  status: string;

  // メモリ上のバッファ（DBより常に最新）
  utteranceBuffer: Utterance[];
  participants: Participant[];
  responseHistory: NodeAIResponse[];
  lastResponseEpoch: number | null;

  // キャッシュメタデータ
  loadedAt: number;       // epoch seconds: DBから読み込んだ時刻
  lastFlushAt: number;    // epoch seconds: 最後にDBへflushした時刻
  dirty: boolean;         // メモリに未flush変更があるか
}

// ========================================
// キャッシュストア
// ========================================

const sessionCache = new Map<string, CachedSessionData>();
const contactCache = new Map<string, { contactId: string; name: string } | null>();

// セッションキャッシュのTTL（この時間を過ぎたらDBから再取得）
const SESSION_RELOAD_TTL = 120; // 2分

function getDb() {
  return getServerSupabase() || getSupabase();
}

// ========================================
// セッション取得（メモリ優先）
// ========================================

/**
 * セッション取得: メモリキャッシュ → DBフォールバック
 * ウォームインスタンスでは0ms、コールドスタート時のみDB呼び出し
 */
export async function getCachedSession(botId: string): Promise<CachedSessionData | null> {
  const now = Date.now() / 1000;
  const cached = sessionCache.get(botId);

  // キャッシュヒット（TTL内）
  if (cached && (now - cached.loadedAt) < SESSION_RELOAD_TTL) {
    return cached;
  }

  // DBから読み込み
  const supabase = getDb();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('nodeai_sessions')
    .select('*')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;

  const entry: CachedSessionData = {
    id: data.id,
    botId: data.bot_id,
    projectId: data.project_id,
    relationshipType: data.relationship_type || 'internal',
    status: data.status,
    utteranceBuffer: data.utterance_buffer || [],
    participants: data.participants || [],
    responseHistory: data.response_history || [],
    lastResponseEpoch: data.last_response_at
      ? new Date(data.last_response_at).getTime() / 1000
      : null,
    loadedAt: now,
    lastFlushAt: now,
    dirty: false,
  };

  sessionCache.set(botId, entry);
  return entry;
}

// ========================================
// メモリ上の即時更新（DB書き込みなし: 0ms）
// ========================================

/**
 * utteranceをメモリバッファに追加（0ms）
 * DBには書かない。flushToDbで一括書き込み。
 */
export function addLocalUtterance(botId: string, utterance: Utterance): void {
  const cached = sessionCache.get(botId);
  if (!cached) return;

  cached.utteranceBuffer.push(utterance);

  // 60分間のウィンドウでトリム（会議全体の議論をカバー）
  const sixtyMinAgo = Date.now() / 1000 - 3600;
  cached.utteranceBuffer = cached.utteranceBuffer.filter((u) => u.timestamp > sixtyMinAgo);

  cached.dirty = true;
}

/**
 * participantをメモリに追加/更新（0ms）
 */
export function updateLocalParticipant(botId: string, participant: Participant): void {
  const cached = sessionCache.get(botId);
  if (!cached) return;

  const idx = cached.participants.findIndex((p) => p.id === participant.id);
  if (idx >= 0) {
    cached.participants[idx] = { ...cached.participants[idx], ...participant };
  } else {
    cached.participants.push(participant);
  }
  cached.dirty = true;
}

/**
 * 応答記録をメモリに追加（0ms）
 * last_response_atも同時更新（echo防止・会話継続モード判定に使用）
 */
export function recordLocalResponse(botId: string, question: string, answer: string): void {
  const cached = sessionCache.get(botId);
  if (!cached) return;

  cached.responseHistory.push({
    question,
    answer,
    timestamp: Date.now() / 1000,
  });

  // 最新20件のみ保持
  if (cached.responseHistory.length > 20) {
    cached.responseHistory = cached.responseHistory.slice(-20);
  }

  cached.lastResponseEpoch = Date.now() / 1000;
  cached.dirty = true;
}

// ========================================
// DB同期
// ========================================

/**
 * メモリの全変更をDBに一括フラッシュ（1回のUPDATE）
 * outputAudioと並列で実行する想定
 */
export async function flushToDb(botId: string): Promise<void> {
  const cached = sessionCache.get(botId);
  if (!cached || !cached.dirty) return;

  const supabase = getDb();
  if (!supabase) return;

  try {
    await supabase
      .from('nodeai_sessions')
      .update({
        utterance_buffer: cached.utteranceBuffer,
        participants: cached.participants,
        response_history: cached.responseHistory,
        response_count: cached.responseHistory.length,
        last_response_at: cached.lastResponseEpoch
          ? new Date(cached.lastResponseEpoch * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('bot_id', botId)
      .eq('status', 'active');

    cached.dirty = false;
    cached.lastFlushAt = Date.now() / 1000;
  } catch (err) {
    console.error('[NodeAI:cache] flushToDb failed:', err);
    // dirtyのまま残す → 次回flushで再試行
  }
}

/**
 * 非応答時のlazyFlush
 * 10秒以上flushしていない場合にDB書き込み（バッファ喪失防止を強化）
 * v11.0: 30秒→10秒に短縮（文字起こしデータの永続化を優先）
 */
export async function lazyFlush(botId: string): Promise<void> {
  const cached = sessionCache.get(botId);
  if (!cached || !cached.dirty) return;

  const now = Date.now() / 1000;
  if (now - cached.lastFlushAt > 10) {
    await flushToDb(botId);
  }
}

// ========================================
// コンテキスト構築（メモリから: 0ms）
// ========================================

/**
 * メモリバッファからrecentContextを構築（DB不要: 0ms）
 */
/**
 * メモリバッファからrecentContextを構築（DB不要: 0ms）
 * 注意: 過去のQ&Aペアはmulti-turn messagesで渡すため、ここでは議論のみ
 */
export function buildLocalRecentContext(botId: string): string {
  const cached = sessionCache.get(botId);
  if (!cached) return '';

  const recentUtterances = cached.utteranceBuffer.slice(-40);
  const utteranceText = recentUtterances
    .map((u) => `${u.speakerName}: ${u.text}`)
    .join('\n');

  // 過去の応答はmulti-turn messagesとして直接Claude APIに渡すため、
  // システムプロンプトには議論コンテキストのみ含める
  let context = '';
  if (utteranceText) context += `=== 直近の議論（会議の生の発言） ===\n${utteranceText}\n`;
  return context;
}

// ========================================
// コンタクト解決キャッシュ
// ========================================

/**
 * コンタクト解決のキャッシュ
 * 同じメールアドレス → 同じコンタクト（会議中は変わらない）
 */
export async function getCachedContact(
  email: string,
  resolver: (email: string) => Promise<{ contactId: string; name: string } | null>
): Promise<{ contactId: string; name: string } | null> {
  if (contactCache.has(email)) {
    return contactCache.get(email) || null;
  }

  const result = await resolver(email);
  contactCache.set(email, result);
  return result;
}

// ========================================
// クリーンアップ
// ========================================

/**
 * セッション終了時のキャッシュクリア
 * leave API や cleanupStaleSessions から呼ぶ
 */
export function clearSessionCache(botId: string): void {
  sessionCache.delete(botId);
}

/**
 * 3時間超過セッションの自動終了
 * Webhook受信時にチェックし、超過していたらDB上でendedにしてキャッシュクリア
 * @returns true if session was ended
 */
export async function autoEndStaleSession(botId: string): Promise<boolean> {
  const supabase = getDb();
  if (!supabase) return false;

  const { data } = await supabase
    .from('nodeai_sessions')
    .select('started_at')
    .eq('bot_id', botId)
    .eq('status', 'active')
    .single();

  if (!data) return false;

  const startedAt = new Date(data.started_at).getTime();
  const threeHours = 3 * 60 * 60 * 1000;
  if (Date.now() - startedAt < threeHours) return false;

  // 最終フラッシュしてから終了
  await flushToDb(botId);

  await supabase
    .from('nodeai_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('bot_id', botId);

  sessionCache.delete(botId);
  return true;
}
