'use client';

import { useState, useCallback } from 'react';
import { MessageGroup, ChannelType, UnifiedMessage } from '@/lib/types';
import { useMessages } from '@/hooks/useMessages';
import Header from '@/components/shared/Header';
import Sidebar from '@/components/shared/Sidebar';
import MessageList from '@/components/inbox/MessageList';
import MessageDetail from '@/components/inbox/MessageDetail';
import ComposeMessage from '@/components/inbox/ComposeMessage';

export default function InboxPage() {
  const { messages, messageGroups, isLoading, isLoadingMore, error, refresh, loadMore, hasMore, messageCounts, unreadCounts, addSentMessage } =
    useMessages();
  const [selectedGroup, setSelectedGroup] = useState<MessageGroup | null>(null);
  const [filter, setFilter] = useState<ChannelType | 'all'>('all');
  const [showCompose, setShowCompose] = useState(false);

  // 送信後に送信メッセージを追加してリフレッシュ
  const handleSentMessage = useCallback((msg: UnifiedMessage) => {
    addSentMessage(msg);
  }, [addSentMessage]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Phase 25: Sidebarにフィルタpropsを渡す */}
        <Sidebar
          messageCounts={messageCounts}
          unreadCounts={unreadCounts}
          activeFilter={filter}
          onFilterChange={setFilter}
        />
        <div className="flex flex-1 overflow-hidden">
          {/* メッセージ一覧 */}
          <div className="w-96 border-r border-slate-200 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-semibold text-slate-900">
                統合インボックス
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowCompose(true);
                    setSelectedGroup(null);
                  }}
                  className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-md hover:bg-blue-700 transition-colors"
                >
                  ✏️ 新規
                </button>
                <button
                  onClick={refresh}
                  className="text-xs text-blue-600 hover:underline"
                  disabled={isLoading}
                >
                  {isLoading ? '更新中...' : '更新'}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm shrink-0">
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
                messageGroups={messageGroups}
                selectedGroupKey={selectedGroup?.groupKey}
                onSelectGroup={(group) => {
                  setSelectedGroup(group);
                  setShowCompose(false);
                }}
                filter={filter}
                onFilterChange={setFilter}
                onLoadMore={loadMore}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
              />
            )}
          </div>

          {/* メッセージ詳細 or 新規作成 */}
          <div className="flex-1 overflow-hidden">
            {showCompose ? (
              <ComposeMessage
                onClose={() => setShowCompose(false)}
                onSent={() => {
                  setShowCompose(false);
                  refresh();
                }}
                onSentMessage={handleSentMessage}
              />
            ) : (
              <MessageDetail
                message={selectedGroup?.latestMessage ?? null}
                group={selectedGroup}
                onSentMessage={handleSentMessage}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
