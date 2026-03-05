'use client';

import Image from 'next/image';
import { UnifiedMessage, MessageGroup, ChannelType } from '@/lib/types';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { formatRelativeTime, truncate, stripHtml } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import { Send } from 'lucide-react';

interface MessageListProps {
  messages: UnifiedMessage[];
  messageGroups: MessageGroup[];
  selectedGroupKey?: string;
  selectedMessageId?: string;
  onSelectGroup: (group: MessageGroup) => void;
  filter: ChannelType | 'all' | 'sent';
  onFilterChange: (filter: ChannelType | 'all' | 'sent') => void;
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
  // Phase UI-4: 'sent' フィルタ対応（メール除外済み）
  const filteredGroups =
    filter === 'all'
      ? messageGroups.filter((g) => g.channel !== 'email')
      : filter === 'sent'
        ? messageGroups.filter((g) => g.messages.some((m) => m.direction === 'sent'))
        : messageGroups.filter((g) => g.channel === filter);

  // Phase UI-4: メールフィルタ完全非表示。「すべて」「Slack」「Chatwork」「送信済み」の4つのみ
  const filters: { value: ChannelType | 'all' | 'sent'; label: string; icon?: string }[] = [
    { value: 'all', label: 'すべて' },
    { value: 'slack', label: 'Slack', icon: CHANNEL_CONFIG.slack.icon },
    { value: 'chatwork', label: 'Chatwork', icon: CHANNEL_CONFIG.chatwork.icon },
    { value: 'sent', label: '送信済み' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Phase UI-4: フィルターバー（メール削除・送信済み追加） */}
      <div className="flex gap-1.5 p-3 border-b border-slate-200 bg-slate-50/80 shrink-0">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-nm-primary text-white shadow-nm-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            )}
          >
            {f.icon && (
              <Image src={f.icon} alt={f.label} width={14} height={14} className="shrink-0" />
            )}
            {f.value === 'sent' && (
              <Send className="w-3 h-3 shrink-0" />
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
 * Phase UI-4: グループアイテム — チャネルアイコン + 送信者 + プレビュー + 時刻の統一デザイン
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
        'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-nm-primary-light transition-colors',
        isSelected && 'bg-nm-primary-light border-l-[3px] border-l-nm-primary',
        !isSelected && unreadCount > 0 && 'bg-white'
      )}
    >
      {/* 上段: チャネルアイコン + 送信者 + 未読 + 時刻 */}
      <div className="flex items-center gap-2 mb-1">
        <ChannelBadge channel={latestMessage.channel} />
        <span
          className={cn(
            'text-sm text-nm-text truncate flex-1',
            unreadCount > 0 ? 'font-bold' : 'font-normal'
          )}
        >
          {latestMessage.from.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-nm-primary text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
          <span className="text-[11px] text-nm-text-muted">
            {formatRelativeTime(group.latestTimestamp)}
          </span>
        </div>
      </div>

      {/* グループラベル（ルーム名/チャンネル名/件名） */}
      <div
        className={cn(
          'text-sm mb-0.5 truncate',
          unreadCount > 0 ? 'text-nm-text font-semibold' : 'text-nm-text-secondary'
        )}
      >
        {groupLabel}
      </div>

      {/* 複数メッセージの場合は参加者一覧を表示 */}
      {hasMultiple && (
        <div className="text-[11px] text-nm-text-muted mb-0.5 truncate">
          {getParticipants(group.messages)}
        </div>
      )}

      {/* 最新メッセージのプレビュー */}
      <div className="text-xs text-nm-text-secondary line-clamp-1">
        {hasMultiple && (
          <span className="text-nm-text-muted">{latestMessage.from.name}: </span>
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
