'use client';

import Image from 'next/image';
import { UnifiedMessage, ChannelType } from '@/lib/types';
import { CHANNEL_CONFIG } from '@/lib/constants';
import { formatRelativeTime, truncate, stripHtml } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import StatusBadge from '@/components/ui/StatusBadge';

interface MessageListProps {
  messages: UnifiedMessage[];
  selectedId?: string;
  onSelect: (message: UnifiedMessage) => void;
  filter: ChannelType | 'all';
  onFilterChange: (filter: ChannelType | 'all') => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

export default function MessageList({
  messages,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: MessageListProps) {
  const filteredMessages =
    filter === 'all'
      ? messages
      : messages.filter((m) => m.channel === filter);

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

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            メッセージがありません
          </div>
        ) : (
          <>
            {filteredMessages.map((message) => (
              <button
                key={message.id}
                onClick={() => onSelect(message)}
                className={cn(
                  'w-full text-left p-4 border-b border-slate-100 hover:bg-blue-50 transition-colors',
                  selectedId === message.id && 'bg-blue-50 border-l-2 border-l-blue-600',
                  message.status === 'unread' && 'bg-white'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ChannelBadge channel={message.channel} />
                    <span className={cn(
                      'text-sm text-slate-900',
                      message.status === 'unread' ? 'font-bold' : 'font-normal'
                    )}>
                      {message.from.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={message.status} />
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(message.timestamp)}
                    </span>
                  </div>
                </div>
                {message.subject && (
                  <div className={cn(
                    'text-sm mb-0.5',
                    message.status === 'unread' ? 'text-slate-900 font-semibold' : 'text-slate-700'
                  )}>
                    {truncate(message.subject, 40)}
                  </div>
                )}
                {message.metadata.slackChannelName && (
                  <div className="text-xs text-slate-400 mb-0.5">
                    #{message.metadata.slackChannelName}
                  </div>
                )}
                {message.metadata.chatworkRoomName && (
                  <div className="text-xs text-slate-400 mb-0.5">
                    {message.metadata.chatworkRoomName}
                  </div>
                )}
                <div className="text-xs text-slate-500 line-clamp-2">
                  {truncate(stripHtml(message.body), 80)}
                </div>
              </button>
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
