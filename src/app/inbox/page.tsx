'use client';

import { useState } from 'react';
import { UnifiedMessage, ChannelType } from '@/lib/types';
import { useMessages } from '@/hooks/useMessages';
import Header from '@/components/shared/Header';
import Sidebar from '@/components/shared/Sidebar';
import MessageList from '@/components/inbox/MessageList';
import MessageDetail from '@/components/inbox/MessageDetail';

export default function InboxPage() {
  const { messages, isLoading, error, refresh, messageCounts, unreadCounts } =
    useMessages();
  const [selectedMessage, setSelectedMessage] = useState<UnifiedMessage | null>(
    null
  );
  const [filter, setFilter] = useState<ChannelType | 'all'>('all');

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar messageCounts={messageCounts} unreadCounts={unreadCounts} />
        <div className="flex flex-1 overflow-hidden">
          {/* メッセージ一覧 */}
          <div className="w-96 border-r border-slate-200 flex flex-col">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                📥 統合インボックス
              </h2>
              <button
                onClick={refresh}
                className="text-xs text-blue-600 hover:underline"
                disabled={isLoading}
              >
                {isLoading ? '更新中...' : '🔄 更新'}
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            {isLoading && messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <div className="animate-spin text-2xl mb-2">⏳</div>
                  <p className="text-sm">メッセージを読み込み中...</p>
                </div>
              </div>
            ) : (
              <MessageList
                messages={messages}
                selectedId={selectedMessage?.id}
                onSelect={setSelectedMessage}
                filter={filter}
                onFilterChange={setFilter}
              />
            )}
          </div>

          {/* メッセージ詳細 */}
          <div className="flex-1">
            <MessageDetail message={selectedMessage} />
          </div>
        </div>
      </div>
    </div>
  );
}
