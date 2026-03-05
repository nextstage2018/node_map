/**
 * Phase A: 1チャンネル＝1プロジェクト自動紐づけサービス
 *
 * メッセージ受信時にチャンネル情報から project_channels を検索し、
 * 一致するプロジェクトを自動特定する。
 *
 * 原則:
 * - 1つのチャットグループ/チャンネル = 1つのプロジェクト
 * - Slack/Chatworkのグループチャンネルが主な対象
 * - メール・LINEなど1:1のやり取りは手動紐づけ
 */

import { getServerSupabase, getSupabase } from '@/lib/supabase';

export interface ChannelProjectMatch {
  projectId: string;
  projectName: string;
  organizationId: string | null;
}

/**
 * チャンネル情報からプロジェクトを自動特定する
 * @param serviceName - チャネル種別（'slack' | 'chatwork'）
 * @param channelIdentifier - チャネル固有ID（Slack: channel_id, Chatwork: room_id）
 * @returns マッチしたプロジェクト情報、なければ null
 */
export async function resolveProjectFromChannel(
  serviceName: string,
  channelIdentifier: string
): Promise<ChannelProjectMatch | null> {
  if (!serviceName || !channelIdentifier) return null;

  const sb = getServerSupabase() || getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('project_channels')
      .select(`
        project_id,
        projects!inner (
          id,
          name,
          organization_id
        )
      `)
      .eq('service_name', serviceName)
      .eq('channel_identifier', channelIdentifier)
      .limit(1)
      .single();

    if (error || !data) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (data as any).projects;
    if (!project) return null;

    return {
      projectId: project.id,
      projectName: project.name,
      organizationId: project.organization_id || null,
    };
  } catch {
    return null;
  }
}

/**
 * メッセージのメタデータからチャンネル識別子を抽出する
 * @param channel - メッセージのチャンネル種別
 * @param metadata - メッセージのメタデータ
 * @returns { serviceName, channelIdentifier } or null
 */
export function extractChannelIdentifier(
  channel: string,
  metadata: Record<string, unknown>
): { serviceName: string; channelIdentifier: string } | null {
  if (channel === 'slack') {
    const slackChannel = metadata.slackChannel as string | undefined;
    if (slackChannel) {
      return { serviceName: 'slack', channelIdentifier: slackChannel };
    }
  }

  if (channel === 'chatwork') {
    const roomId = metadata.chatworkRoomId as string | undefined;
    if (roomId) {
      return { serviceName: 'chatwork', channelIdentifier: String(roomId) };
    }
  }

  // メールは1:1なので自動紐づけ対象外
  return null;
}

/**
 * メッセージのチャンネル情報からプロジェクトを自動特定する（ワンショット関数）
 * saveMessages 後に呼ぶことでビジネスイベント自動蓄積の精度が向上する
 */
export async function resolveProjectFromMessage(
  channel: string,
  metadata: Record<string, unknown>
): Promise<ChannelProjectMatch | null> {
  const channelInfo = extractChannelIdentifier(channel, metadata);
  if (!channelInfo) return null;

  return resolveProjectFromChannel(channelInfo.serviceName, channelInfo.channelIdentifier);
}
