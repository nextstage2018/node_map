/**
 * v10.3: BOTチャネル自動参加サービス
 * プロジェクトにチャネルを追加した際、BOTが未参加なら自動で参加させる
 *
 * Slack: conversations.join（BOT自身で公開chに参加）/ conversations.invite（プライベートch）
 * Chatwork: PUT /rooms/{room_id}/members（ユーザー権限でBOTを追加）
 */

import { createServerClient } from '@/lib/supabase';

const SLACK_API_BASE = 'https://slack.com/api';
const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

interface BotJoinResult {
  success: boolean;
  alreadyMember: boolean;
  error?: string;
}

// ========================================
// Slack BOT自動参加
// ========================================

/**
 * Slack BOTをチャネルに参加させる
 * 公開ch: conversations.join（BOTトークンで自分自身を参加）
 * プライベートch: conversations.invite（ユーザートークンでBOTを招待）
 */
export async function ensureSlackBotInChannel(
  channelId: string,
  userId: string
): Promise<BotJoinResult> {
  try {
    // BOTトークンとBOT user_idを取得
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      return { success: false, alreadyMember: false, error: 'SLACK_BOT_TOKEN未設定' };
    }

    // bot_user_id を user_service_tokens から取得
    const botUserId = await getSlackBotUserId();
    if (!botUserId) {
      return { success: false, alreadyMember: false, error: 'Slack BOT user_id不明' };
    }

    // 1. BOTが既にメンバーか確認
    const membersRes = await fetch(`${SLACK_API_BASE}/conversations.members?channel=${channelId}&limit=200`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    if (membersRes.ok) {
      const membersData = await membersRes.json();
      if (membersData.ok && membersData.members?.includes(botUserId)) {
        console.log(`[BotJoin] Slack BOT既に参加済み: ${channelId}`);
        return { success: true, alreadyMember: true };
      }
      // members APIが使えない = BOTが未参加 → joinを試行
    }

    // 2. conversations.join でBOT自身を参加させる（公開ch向け）
    const joinRes = await fetch(`${SLACK_API_BASE}/conversations.join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId }),
    });

    const joinData = await joinRes.json();
    if (joinData.ok) {
      console.log(`[BotJoin] Slack BOT参加成功（join）: ${channelId}`);
      return { success: true, alreadyMember: false };
    }

    // 3. join失敗（プライベートch等）→ ユーザートークンでinvite
    if (joinData.error === 'channel_not_found' || joinData.error === 'method_not_supported_for_channel_type') {
      const userToken = await getUserSlackToken(userId);
      if (userToken) {
        const inviteRes = await fetch(`${SLACK_API_BASE}/conversations.invite`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: channelId, users: botUserId }),
        });

        const inviteData = await inviteRes.json();
        if (inviteData.ok) {
          console.log(`[BotJoin] Slack BOT招待成功（invite）: ${channelId}`);
          return { success: true, alreadyMember: false };
        }

        // already_in_channel は成功扱い
        if (inviteData.error === 'already_in_channel') {
          return { success: true, alreadyMember: true };
        }

        console.warn(`[BotJoin] Slack BOT招待失敗: ${inviteData.error}`);
        return { success: false, alreadyMember: false, error: `Slack: ${inviteData.error}` };
      }
    }

    // already_in_channel は成功扱い
    if (joinData.error === 'already_in_channel') {
      return { success: true, alreadyMember: true };
    }

    console.warn(`[BotJoin] Slack BOT参加失敗: ${joinData.error}`);
    return { success: false, alreadyMember: false, error: `Slack: ${joinData.error}` };
  } catch (err) {
    console.error('[BotJoin] Slack例外:', err);
    return { success: false, alreadyMember: false, error: 'Slack BOT参加で例外発生' };
  }
}

// ========================================
// Chatwork BOT自動参加
// ========================================

/**
 * Chatwork BOTをルームに参加させる
 * ユーザーの権限（管理者）でBOTアカウントをメンバーに追加
 */
export async function ensureChatworkBotInRoom(
  roomId: string,
  userId: string
): Promise<BotJoinResult> {
  try {
    // ユーザーの個別トークンを取得
    const userToken = await getUserChatworkToken(userId);
    if (!userToken) {
      return { success: false, alreadyMember: false, error: 'Chatworkユーザートークン未設定' };
    }

    // BOTのaccount_idを取得
    const botAccountId = await getChatworkBotAccountId();
    if (!botAccountId) {
      return { success: false, alreadyMember: false, error: 'Chatwork BOT account_id不明' };
    }

    // 1. 現在のルームメンバーを取得
    const membersRes = await fetch(`${CHATWORK_API_BASE}/rooms/${roomId}/members`, {
      headers: { 'X-ChatWorkToken': userToken },
    });

    if (!membersRes.ok) {
      return { success: false, alreadyMember: false, error: `Chatworkメンバー取得失敗: ${membersRes.status}` };
    }

    const members = await membersRes.json();
    if (!Array.isArray(members)) {
      return { success: false, alreadyMember: false, error: 'Chatworkメンバー一覧が不正' };
    }

    // BOTが既にメンバーか確認
    const botMember = members.find((m: { account_id: number }) => String(m.account_id) === botAccountId);
    if (botMember) {
      console.log(`[BotJoin] Chatwork BOT既に参加済み: room ${roomId}`);
      return { success: true, alreadyMember: true };
    }

    // 2. メンバーリストにBOTを追加してPUT
    // Chatwork APIは全メンバーを再指定する仕様（差分ではない）
    const adminIds: string[] = [];
    const memberIds: string[] = [];
    const readonlyIds: string[] = [];

    for (const m of members) {
      const aid = String(m.account_id);
      if (m.role === 'admin') adminIds.push(aid);
      else if (m.role === 'member') memberIds.push(aid);
      else if (m.role === 'readonly') readonlyIds.push(aid);
    }

    // BOTをmemberとして追加
    memberIds.push(botAccountId);

    const updateRes = await fetch(`${CHATWORK_API_BASE}/rooms/${roomId}/members`, {
      method: 'PUT',
      headers: {
        'X-ChatWorkToken': userToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: [
        `members_admin_ids=${adminIds.join(',')}`,
        `members_member_ids=${memberIds.join(',')}`,
        readonlyIds.length > 0 ? `members_readonly_ids=${readonlyIds.join(',')}` : '',
      ].filter(Boolean).join('&'),
    });

    if (!updateRes.ok) {
      const errorBody = await updateRes.text().catch(() => 'unknown');
      console.warn(`[BotJoin] Chatwork BOT追加失敗: ${updateRes.status} ${errorBody}`);
      return { success: false, alreadyMember: false, error: `Chatwork: 権限不足の可能性 (${updateRes.status})` };
    }

    console.log(`[BotJoin] Chatwork BOT参加成功: room ${roomId}`);
    return { success: true, alreadyMember: false };
  } catch (err) {
    console.error('[BotJoin] Chatwork例外:', err);
    return { success: false, alreadyMember: false, error: 'Chatwork BOT参加で例外発生' };
  }
}

// ========================================
// ヘルパー関数
// ========================================

/** Slack BOTのuser_idをuser_service_tokensから取得 */
async function getSlackBotUserId(): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data')
    .eq('service_name', 'slack')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return data?.token_data?.bot_user_id || null;
}

/** Chatwork BOTのaccount_idを取得（BOTトークンで /me を呼ぶ） */
async function getChatworkBotAccountId(): Promise<string | null> {
  const botToken = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
  if (!botToken) return null;

  try {
    const res = await fetch(`${CHATWORK_API_BASE}/me`, {
      headers: { 'X-ChatWorkToken': botToken },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.account_id ? String(data.account_id) : null;
  } catch {
    return null;
  }
}

/** ユーザー個別のSlackトークンをDBから取得 */
async function getUserSlackToken(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'slack')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return data?.token_data?.access_token || null;
}

/** ユーザー個別のChatworkトークンをDBから取得 */
async function getUserChatworkToken(userId: string): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('user_service_tokens')
    .select('token_data')
    .eq('user_id', userId)
    .eq('service_name', 'chatwork')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return data?.token_data?.api_token || null;
}

// ========================================
// BOT参加状態チェック
// ========================================

export interface BotStatus {
  inChannel: boolean;
  botName?: string;
  error?: string;
}

/**
 * 指定チャネルにBOTが参加しているか確認
 */
export async function checkBotStatus(
  serviceName: string,
  channelIdentifier: string
): Promise<BotStatus> {
  if (serviceName === 'slack') {
    return checkSlackBotStatus(channelIdentifier);
  } else if (serviceName === 'chatwork') {
    return checkChatworkBotStatus(channelIdentifier);
  }
  return { inChannel: false, error: '未対応のサービス' };
}

async function checkSlackBotStatus(channelId: string): Promise<BotStatus> {
  try {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) return { inChannel: false, error: 'BOTトークン未設定' };

    const botUserId = await getSlackBotUserId();
    if (!botUserId) return { inChannel: false, error: 'BOT ID不明' };

    const res = await fetch(`${SLACK_API_BASE}/conversations.members?channel=${channelId}&limit=200`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    if (!res.ok) return { inChannel: false, error: `API ${res.status}` };

    const data = await res.json();
    if (!data.ok) {
      // not_in_channel エラー = BOT未参加
      if (data.error === 'not_in_channel') {
        return { inChannel: false, botName: 'NodeMap BOT' };
      }
      return { inChannel: false, error: data.error };
    }

    const isMember = data.members?.includes(botUserId);
    return { inChannel: isMember, botName: 'NodeMap BOT' };
  } catch {
    return { inChannel: false, error: 'チェック失敗' };
  }
}

async function checkChatworkBotStatus(roomId: string): Promise<BotStatus> {
  try {
    const botToken = process.env.CHATWORK_BOT_API_TOKEN || process.env.CHATWORK_API_TOKEN;
    if (!botToken) return { inChannel: false, error: 'BOTトークン未設定' };

    const botAccountId = await getChatworkBotAccountId();
    if (!botAccountId) return { inChannel: false, error: 'BOT ID不明' };

    // BOTトークンでルームメンバーを確認（BOT自身がメンバーならアクセス可能）
    const res = await fetch(`${CHATWORK_API_BASE}/rooms/${roomId}/members`, {
      headers: { 'X-ChatWorkToken': botToken },
    });

    if (!res.ok) {
      // 403 = BOT未参加
      if (res.status === 403) {
        return { inChannel: false, botName: 'NodeMap BOT' };
      }
      return { inChannel: false, error: `API ${res.status}` };
    }

    const members = await res.json();
    if (!Array.isArray(members)) return { inChannel: false, error: '不正なレスポンス' };

    const isMember = members.some((m: { account_id: number }) => String(m.account_id) === botAccountId);
    return { inChannel: isMember, botName: 'NodeMap BOT' };
  } catch {
    return { inChannel: false, error: 'チェック失敗' };
  }
}
