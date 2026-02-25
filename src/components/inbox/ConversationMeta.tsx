'use client';

import { useMemo } from 'react';
import { UnifiedMessage, MessageGroup, ChannelType, ThreadMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ConversationMetaProps {
  /** MessageGroup（グループ選択時） */
  group?: MessageGroup | null;
  /** 単一メッセージ（個別メッセージ選択時） */
  message?: UnifiedMessage | null;
}

/**
 * 会話メタデータ表示コンポーネント
 * MessageDetail 内に表示する:
 * - 会話の継続期間
 * - 参加者数と名前
 * - メッセージ数（自分/相手）
 * - 最終やり取り日時
 * - チャネル情報
 */
export default function ConversationMeta({ group, message }: ConversationMetaProps) {
  const meta = useMemo(() => computeMeta(group, message), [group, message]);

  if (!meta) return null;

  return (
    <div className="px-6 py-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-semibold text-slate-500">
          会話の情報
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {/* チャネル */}
        <MetaItem label="チャネル" value={getChannelLabel(meta.channel)} />

        {/* 参加者 */}
        <MetaItem
          label="参加者"
          value={
            <div className="flex items-center gap-1 flex-wrap">
              {meta.participants.slice(0, 4).map((p, i) => (
                <span
                  key={p.name}
                  className={cn(
                    'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]',
                    'bg-slate-100 text-slate-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white',
                      AVATAR_COLORS[i % AVATAR_COLORS.length]
                    )}
                  >
                    {p.name.charAt(0)}
                  </span>
                  {p.name}
                </span>
              ))}
              {meta.participants.length > 4 && (
                <span className="text-[10px] text-slate-400">
                  +{meta.participants.length - 4}名
                </span>
              )}
            </div>
          }
        />

        {/* メッセージ数 */}
        <MetaItem
          label="メッセージ数"
          value={
            <span>
              {meta.totalCount}件
              {meta.ownCount > 0 && (
                <span className="text-slate-400 ml-1">
                  （自分: {meta.ownCount} / 相手: {meta.otherCount}）
                </span>
              )}
            </span>
          }
        />

        {/* 期間 */}
        <MetaItem label="継続期間" value={meta.duration} />

        {/* 最終やり取り */}
        <MetaItem label="最終やり取り" value={meta.lastInteraction} />

        {/* チャネル詳細 */}
        {meta.channelDetail && (
          <MetaItem label="チャネル詳細" value={meta.channelDetail} />
        )}
      </div>
    </div>
  );
}

/**
 * 個別のメタ情報行
 */
function MetaItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="text-[11px]">
      <span className="text-slate-400">{label}: </span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

// ===== ヘルパー =====

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
];

interface ConversationMetaData {
  channel: ChannelType;
  participants: { name: string; address: string; count: number }[];
  totalCount: number;
  ownCount: number;
  otherCount: number;
  duration: string;
  lastInteraction: string;
  channelDetail?: string;
}

function computeMeta(
  group?: MessageGroup | null,
  message?: UnifiedMessage | null
): ConversationMetaData | null {
  // グループ表示（複数メッセージ）
  if (group && group.messages.length > 0) {
    return computeFromMessages(group.messages, group.channel);
  }

  // 単一メッセージのスレッド
  if (message?.threadMessages && message.threadMessages.length > 0) {
    return computeFromThreadMessages(message.threadMessages, message.channel, message);
  }

  // 単一メッセージ（スレッドなし）
  if (message) {
    return {
      channel: message.channel,
      participants: [{ name: message.from.name, address: message.from.address, count: 1 }],
      totalCount: 1,
      ownCount: message.from.name === 'あなた' ? 1 : 0,
      otherCount: message.from.name === 'あなた' ? 0 : 1,
      duration: '-',
      lastInteraction: formatDateTime(message.timestamp),
      channelDetail: getChannelDetail(message),
    };
  }

  return null;
}

function computeFromMessages(
  messages: UnifiedMessage[],
  channel: ChannelType
): ConversationMetaData {
  const participantMap = new Map<string, { name: string; address: string; count: number }>();
  let ownCount = 0;
  let otherCount = 0;

  for (const msg of messages) {
    const key = msg.from.address || msg.from.name;
    const isOwn = msg.from.name === 'あなた';
    if (isOwn) ownCount++;
    else otherCount++;

    const existing = participantMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      participantMap.set(key, { name: msg.from.name, address: msg.from.address, count: 1 });
    }
  }

  const timestamps = messages
    .map((m) => new Date(m.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  const latest = messages[messages.length - 1];

  return {
    channel,
    participants: Array.from(participantMap.values()),
    totalCount: messages.length,
    ownCount,
    otherCount,
    duration: computeDuration(timestamps),
    lastInteraction: formatDateTime(latest?.timestamp || ''),
    channelDetail: latest ? getChannelDetail(latest) : undefined,
  };
}

function computeFromThreadMessages(
  threadMessages: ThreadMessage[],
  channel: ChannelType,
  parentMessage: UnifiedMessage
): ConversationMetaData {
  const participantMap = new Map<string, { name: string; address: string; count: number }>();
  let ownCount = 0;
  let otherCount = 0;

  for (const msg of threadMessages) {
    const key = msg.from.address || msg.from.name;
    if (msg.isOwn) ownCount++;
    else otherCount++;

    const existing = participantMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      participantMap.set(key, { name: msg.from.name, address: msg.from.address, count: 1 });
    }
  }

  const timestamps = threadMessages
    .map((m) => new Date(m.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  const latest = threadMessages[threadMessages.length - 1];

  return {
    channel,
    participants: Array.from(participantMap.values()),
    totalCount: threadMessages.length,
    ownCount,
    otherCount,
    duration: computeDuration(timestamps),
    lastInteraction: formatDateTime(latest?.timestamp || ''),
    channelDetail: getChannelDetail(parentMessage),
  };
}

function computeDuration(sortedTimestamps: number[]): string {
  if (sortedTimestamps.length < 2) return '-';

  const diffMs = sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0];
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '数分以内';
  if (diffMin < 60) return `${diffMin}分間`;
  if (diffHour < 24) return `${diffHour}時間`;
  if (diffDay < 30) return `${diffDay}日間`;
  const diffMonth = Math.floor(diffDay / 30);
  return `約${diffMonth}ヶ月`;
}

function formatDateTime(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return `今日 ${timeStr}`;
  if (diffDays === 1) return `昨日 ${timeStr}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
}

function getChannelLabel(channel: ChannelType): string {
  switch (channel) {
    case 'email': return 'Gmail';
    case 'slack': return 'Slack';
    case 'chatwork': return 'Chatwork';
    default: return channel;
  }
}

function getChannelDetail(message: UnifiedMessage): string | undefined {
  if (message.channel === 'slack' && message.metadata.slackChannelName) {
    return `#${message.metadata.slackChannelName}`;
  }
  if (message.channel === 'chatwork' && message.metadata.chatworkRoomName) {
    return message.metadata.chatworkRoomName;
  }
  if (message.channel === 'email' && message.subject) {
    return message.subject;
  }
  return undefined;
}
