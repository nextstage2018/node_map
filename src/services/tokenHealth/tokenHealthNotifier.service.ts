// v10.4: トークンヘルスチェック通知サービス
// 期限切れトークンを検出し、Slack/Chatworkの自社チャネルに通知

import { getServerSupabase, getSupabase } from '@/lib/supabase';
import { checkAllUsersTokenHealth, UserTokenHealth, ServiceHealth } from './tokenHealth.service';

const SERVICE_LABELS: Record<string, string> = {
  google: 'Google',
  slack: 'Slack',
  chatwork: 'Chatwork',
};

// ========================================
// 通知先チャネル取得（internalプロジェクトの最初のチャネル）
// ========================================
async function getNotificationChannel(): Promise<{
  type: 'slack' | 'chatwork';
  identifier: string;
} | null> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return null;

  // internal組織のプロジェクトチャネルを1つ取得
  const { data: channels } = await supabase
    .from('project_channels')
    .select(`
      service_name,
      identifier,
      projects!inner(
        organization_id,
        organizations!inner(relationship_type)
      )
    `)
    .in('service_name', ['slack', 'chatwork'])
    .limit(10);

  if (!channels || channels.length === 0) return null;

  // internal のチャネルを優先
  for (const ch of channels) {
    const proj = ch.projects as { organizations?: { relationship_type?: string } } | null;
    if (proj?.organizations?.relationship_type === 'internal') {
      return {
        type: ch.service_name as 'slack' | 'chatwork',
        identifier: ch.identifier,
      };
    }
  }

  // フォールバック: 最初のチャネル
  return {
    type: channels[0].service_name as 'slack' | 'chatwork',
    identifier: channels[0].identifier,
  };
}

// ========================================
// ユーザー名取得
// ========================================
async function getUserDisplayName(userId: string): Promise<string> {
  const supabase = getServerSupabase() || getSupabase();
  if (!supabase) return userId;

  const { data } = await supabase
    .from('contact_persons')
    .select('name')
    .eq('linked_user_id', userId)
    .maybeSingle();

  return data?.name || userId.substring(0, 8);
}

// ========================================
// 通知メッセージ生成
// ========================================
function buildNotificationMessage(results: UserTokenHealth[], userNames: Map<string, string>): string | null {
  const issues: string[] = [];

  for (const userHealth of results) {
    const problemServices = userHealth.services.filter(
      (s: ServiceHealth) => s.status === 'expired' || s.status === 'invalid'
    );

    if (problemServices.length === 0) continue;

    const userName = userNames.get(userHealth.userId) || userHealth.userId.substring(0, 8);
    const serviceList = problemServices
      .map((s: ServiceHealth) => `${SERVICE_LABELS[s.service]}（${s.message}）`)
      .join('、');

    issues.push(`  ・${userName}: ${serviceList}`);
  }

  if (issues.length === 0) return null;

  return [
    '🔑 トークン接続アラート',
    '',
    '以下のユーザーのサービス接続に問題があります。',
    '設定画面から再認証してください。',
    '',
    ...issues,
    '',
    '→ 設定: ' + (process.env.NEXT_PUBLIC_SITE_URL || 'https://node-map-eight.vercel.app') + '/settings',
  ].join('\n');
}

// ========================================
// メイン: チェック + 通知
// ========================================
export async function runTokenHealthCheckAndNotify(): Promise<{
  totalUsers: number;
  issueUsers: number;
  notified: boolean;
}> {
  // 1. 全ユーザーのトークンチェック
  const results = await checkAllUsersTokenHealth();
  const issueResults = results.filter(r => r.hasIssues);

  // 2. 問題なければ終了
  if (issueResults.length === 0) {
    return { totalUsers: results.length, issueUsers: 0, notified: false };
  }

  // 3. ユーザー名を取得
  const userNames = new Map<string, string>();
  for (const r of issueResults) {
    const name = await getUserDisplayName(r.userId);
    userNames.set(r.userId, name);
  }

  // 4. 通知メッセージ生成
  const message = buildNotificationMessage(issueResults, userNames);
  if (!message) {
    return { totalUsers: results.length, issueUsers: issueResults.length, notified: false };
  }

  // 5. 通知先チャネル取得
  const channel = await getNotificationChannel();
  if (!channel) {
    console.warn('[TokenHealth] 通知先チャネルが見つかりません');
    return { totalUsers: results.length, issueUsers: issueResults.length, notified: false };
  }

  // 6. 通知送信
  let notified = false;
  try {
    if (channel.type === 'slack') {
      const { sendSlackMessage } = await import('@/services/slack/slackClient.service');
      notified = await sendSlackMessage(channel.identifier, message);
    } else if (channel.type === 'chatwork') {
      const { sendChatworkMessage } = await import('@/services/chatwork/chatworkClient.service');
      notified = await sendChatworkMessage(channel.identifier, message);
    }
  } catch (err) {
    console.error('[TokenHealth] 通知送信エラー:', err);
  }

  return { totalUsers: results.length, issueUsers: issueResults.length, notified };
}
