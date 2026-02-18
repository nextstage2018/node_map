'use client';

import { UnifiedMessage, ChannelType } from '@/lib/types';
import { formatRelativeTime, truncate, stripHtml } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';

interface MessageListProps {
  messages: UnifiedMessage[];
  selectedId?: string;
  onSelect: (message: UnifiedMessage) => void;
  filter: ChannelType | 'all';
  onFilterChange: (filter: ChannelType | 'all') => void;
}

export default function MessageList({
  messages,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: MessageListProps) {
  const filteredMessages =
    filter === 'all'
      ? messages
      : messages.filter((m) => m.channel === filter);

  const filters: { value: ChannelType | 'all'; label: string }[] = [
    { value: 'all', label: 'すべて' },
    { value: 'email', label: '📧 メール' },
    { value: 'slack', label: '💬 Slack' },
    { value: 'chatwork', label: '🔵 Chatwork' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* フィルターバー */}
      <div className="flex gap-1 p-3 border-b border-gray-200 bg-gray-50">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            メッセージがありません
          </div>
        ) : (
          filteredMessages.map((message) => (
            <button
              key={message.id}
              onClick={() => onSelect(message)}
              className={cn(
                'w-full text-left p-4 border-b border-gray-100 hover:bg-blue-50 transition-colors',
                selectedId === message.id && 'bg-blue-50 border-l-2 border-l-blue-600',
                !message.isRead && 'bg-white font-medium'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ChannelBadge channel={message.channel} />
                  <span className="text-sm font-semibold text-gray-900">
                    {message.from.name}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatRelativeTime(message.timestamp)}
                </span>
              </div>
              {message.subject && (
                <div className="text-sm text-gray-800 mb-0.5">
                  {truncate(message.subject, 40)}
                </div>
              )}
              {message.metadata.slackChannelName && (
                <div className="text-xs text-gray-400 mb-0.5">
                  #{message.metadata.slackChannelName}
                </div>
              )}
              {message.metadata.chatworkRoomName && (
                <div className="text-xs text-gray-400 mb-0.5">
                  📁 {message.metadata.chatworkRoomName}
                </div>
              )}
              <div className="text-xs text-gray-500 line-clamp-2">
                {truncate(stripHtml(message.body), 80)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
