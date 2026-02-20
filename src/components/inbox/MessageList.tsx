'use client';

import Image from 'next/image';
import { UnifiedMessage, MessageGroup, ChannelType } from '@/lib/types';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { formatRelativeTime, truncate, stripHtml } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import StatusBadge from '@/components/ui/StatusBadge';

interface MessageListProps {
  messages: UnifiedMessage[];
  messageGroups: MessageGroup[];
  selectedGroupKey?: string;
  selectedMessageId?: string;
  onSelectGroup: (group: MessageGroup) => void;
  filter: ChannelType | 'all';
  onFilterChange: (filter: ChannelType | 'all') => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

export default function MessageList({
  messageGroups,
  selectedGroupKey,
  onSelectGroup,
  filter,
  onFilterChange,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: MessageListProps) {
  const filteredGroups =
    filter === 'all'
      ? messageGroups
      : messageGroups.filter((g) => g.channel === filter);

  const filters: { value: ChannelType | 'all'; label: string; icon?: string }[] = [
    { value: 'all', label: 'すべて' },
    { value: 'email', label: 'Gmail', icon: CHANNEL_CONFIG.email.icon },
    { value: 'slack', label: 'Slack', icon: CHANNEL_CONFIG.slack.icon },
    { value: 'chatwork', label: 'Chatwork', icon: CHANNEL_CONFIG.chatwork.icon },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* フィルターバー */}
      <div className="flex gap-1 p-3 border-b border-slate-200 bg-slate-50">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            )}
          >
            {f.icon && (
              <Image src={f.icon} alt={f.label} width={14} height={14} className="shrink-0" />
            )}
            {f.label}
          </button>
        ))}
      </div>

      {/* メッセージグループ一覧 */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            メッセージがありません
          </div>
        ) : (
          <>
            {filteredGroups.map((group) => (
              <GroupItem
                key={group.groupKey}
                group={group}
                isSelected={selectedGroupKey === group.groupKey}
                onSelect={() => onSelectGroup(group)}
              />
            ))}

            {/* もっと読み込むボタン */}
            {hasMore && onLoadMore && (
              <div className="p-4 text-center">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoadingMore ? '読み込み中...' : '過去のメッセージを読み込む'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * グループアイテム：1つのスレッド/ルーム/チャンネルをまとめて表示
 */
function GroupItem({
  group,
  isSelected,
  onSelect,
}: {
  group: MessageGroup;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { latestMessage, messageCount, unreadCount, groupLabel } = group;
  const hasMultiple = messageCount > 1;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 border-b border-slate-100 hover:bg-blue-50 transition-colors',
        isSelected && 'bg-blue-50 border-l-2 border-l-blue-600',
        unreadCount > 0 && 'bg-white'
      )}
    >
      {/* 上段: チャネル・送信者・日時 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ChannelBadge channel={latestMessage.channel} />
          <span
            className={cn(
              'text-sm text-slate-900',
              unreadCount > 0 ? 'font-bold' : 'font-normal'
            )}
          >
            {latestMessage.from.name}
          </span>
          {hasMultiple && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
              {messageCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {formatRelativeTime(group.latestTimestamp)}
          </span>
        </div>
      </div>

      {/* グループラベル（ルーム名/チャンネル名/件名） */}
      <div
        className={cn(
          'text-sm mb-0.5',
          unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-700'
        )}
      >
        {groupLabel}
      </div>

      {/* 複数メッセージの場合は参加者一覧を表示 */}
      {hasMultiple && (
        <div className="text-[11px] text-slate-400 mb-0.5">
          {getParticipants(group.messages)}
        </div>
      )}

      {/* 最新メッセージのプレビュー */}
      <div className="text-xs text-slate-500 line-clamp-2">
        {hasMultiple && (
          <span className="text-slate-400">{latestMessage.from.name}: </span>
        )}
        {truncate(stripHtml(latestMessage.body), 80)}
      </div>
    </button>
  );
}

/**
 * グループ内のユニークな参加者名をカンマ区切りで返す
 */
function getParticipants(messages: UnifiedMessage[]): string {
  const names = new Set(messages.map((m) => m.from.name));
  const nameArray = Array.from(names);
  if (nameArray.length <= 3) {
    return nameArray.join('、');
  }
  return `${nameArray.slice(0, 3).join('、')} 他${nameArray.length - 3}名`;
}
