'use client';

import { useState } from 'react';
import { UnifiedMessage } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import ReplyForm from '@/components/inbox/ReplyForm';
import ThreadView from '@/components/inbox/ThreadView';

interface MessageDetailProps {
  message: UnifiedMessage | null;
}

export default function MessageDetail({ message }: MessageDetailProps) {
  const [showReply, setShowReply] = useState(false);

  if (!message) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-3">📬</div>
          <p>メッセージを選択してください</p>
        </div>
      </div>
    );
  }

  const hasThread = message.threadMessages && message.threadMessages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel={message.channel} />
          <StatusBadge status={message.status} />
          {message.metadata.slackChannelName && (
            <span className="text-xs text-gray-400">
              #{message.metadata.slackChannelName}
            </span>
          )}
          {message.metadata.chatworkRoomName && (
            <span className="text-xs text-gray-400">
              {message.metadata.chatworkRoomName}
            </span>
          )}
        </div>
        {message.subject && (
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {message.subject}
          </h2>
        )}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-gray-900">
              {message.from.name}
            </span>
            <span className="text-sm text-gray-400 ml-2">
              {message.from.address}
            </span>
          </div>
          <span className="text-sm text-gray-400">
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>
      </div>

      {/* 本文 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </div>
      </div>

      {/* スレッド履歴 */}
      {hasThread && (
        <ThreadView messages={message.threadMessages!} />
      )}

      {/* アクションバー */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        {showReply ? (
          <ReplyForm
            message={message}
            onClose={() => setShowReply(false)}
          />
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => setShowReply(true)}>
              ↩ 返信
            </Button>
            <Button variant="secondary" onClick={() => setShowReply(true)}>
              🤖 AIで下書き
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
