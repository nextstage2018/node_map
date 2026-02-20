'use client';

import { useState, useEffect, useCallback } from 'react';
import { UnifiedMessage, MessageGroup } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import ChannelBadge from '@/components/ui/ChannelBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import ReplyForm from '@/components/inbox/ReplyForm';

interface MessageDetailProps {
  message: UnifiedMessage | null;
  group: MessageGroup | null;
}

export default function MessageDetail({ message, group }: MessageDetailProps) {
  const [showReply, setShowReply] = useState(false);

  if (!message && !group) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <div className="text-4xl mb-3">📬</div>
          <p>メッセージを選択してください</p>
        </div>
      </div>
    );
  }

  // グループが選択されている場合（複数メッセージのグループ）
  if (group && group.messageCount > 1) {
    return (
      <GroupDetail
        group={group}
        showReply={showReply}
        onToggleReply={() => setShowReply(!showReply)}
        onCloseReply={() => setShowReply(false)}
      />
    );
  }

  // 単一メッセージ（グループ内1件、またはグループなし）
  const displayMessage = group ? group.latestMessage : message!;

  // メールで引用チェーンが解析されている場合は会話ビューで表示
  if (displayMessage.channel === 'email' && displayMessage.threadMessages && displayMessage.threadMessages.length > 1) {
    return (
      <EmailThreadDetail
        message={displayMessage}
        showReply={showReply}
        onToggleReply={() => setShowReply(!showReply)}
        onCloseReply={() => setShowReply(false)}
      />
    );
  }

  return (
    <SingleMessageDetail
      message={displayMessage}
      showReply={showReply}
      onToggleReply={() => setShowReply(!showReply)}
      onCloseReply={() => setShowReply(false)}
    />
  );
}

/**
 * グループ表示：グループ内の全メッセージを会話形式で表示
 */
function GroupDetail({
  group,
  showReply,
  onToggleReply,
  onCloseReply,
}: {
  group: MessageGroup;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
}) {
  const latestMessage = group.latestMessage;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel={group.channel} />
          <span className="text-xs text-slate-400">
            {group.messageCount}件のメッセージ
          </span>
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {group.groupLabel}
        </h2>
        <div className="text-xs text-slate-400">
          参加者: {getUniqueParticipants(group.messages)}
        </div>
      </div>

      {/* 会話一覧 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {group.messages.map((msg) => (
          <ConversationBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm
            message={latestMessage}
            onClose={onCloseReply}
          />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>
              ↩ 返信
            </Button>
            <Button variant="secondary" onClick={onToggleReply}>
              🤖 AIで下書き
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 会話バブル：個別メッセージをチャット風に表示
 */
function ConversationBubble({ message }: { message: UnifiedMessage }) {
  // 「あなた」からの送信かどうか判定
  const isOwn = message.from.name === 'あなた';

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3',
          isOwn
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
        )}
      >
        {/* 送信者名・日時 */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              'text-xs font-semibold',
              isOwn ? 'text-blue-100' : 'text-slate-500'
            )}
          >
            {isOwn ? 'あなた' : message.from.name}
          </span>
          <span
            className={cn(
              'text-[10px]',
              isOwn ? 'text-blue-200' : 'text-slate-400'
            )}
          >
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>
        {/* 件名（メールの場合） */}
        {message.subject && (
          <div
            className={cn(
              'text-xs font-semibold mb-1',
              isOwn ? 'text-blue-100' : 'text-slate-600'
            )}
          >
            {message.subject}
          </div>
        )}
        {/* 本文 */}
        <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
          {message.body}
        </p>
      </div>
    </div>
  );
}

/**
 * メール引用チェーンを会話形式で表示
 * Gmailの「>」引用をパースして、チャットワーク風のバブルUIに変換
 */
function EmailThreadDetail({
  message,
  showReply,
  onToggleReply,
  onCloseReply,
}: {
  message: UnifiedMessage;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
}) {
  const threadMessages = message.threadMessages || [];
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (threadMessages.length < 2) return;
    setIsSummarizing(true);
    setSummaryError(false);
    try {
      const res = await fetch('/api/ai/thread-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: message.subject || '',
          threadMessages,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.summary) {
        setSummary(data.data.summary);
      } else {
        setSummaryError(true);
      }
    } catch {
      setSummaryError(true);
    } finally {
      setIsSummarizing(false);
    }
  }, [message.subject, threadMessages]);

  // 自動で要約を取得
  useEffect(() => {
    if (threadMessages.length >= 2 && !summary) {
      fetchSummary();
    }
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel="email" />
          <span className="text-xs text-slate-400">
            {threadMessages.length}件のやり取り
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            💬 引用を会話に変換
          </span>
        </div>
        {message.subject && (
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {message.subject}
          </h2>
        )}
        <div className="text-xs text-slate-400">
          参加者: {getUniqueThreadParticipants(threadMessages)}
        </div>

        {/* AI要約 */}
        {threadMessages.length >= 2 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-amber-600 text-xs font-semibold">✨ AI要約</span>
              {isSummarizing && (
                <span className="text-[10px] text-amber-400">生成中...</span>
              )}
            </div>
            {summary ? (
              <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">
                {summary}
              </p>
            ) : summaryError ? (
              <p className="text-xs text-amber-600">
                要約の生成に失敗しました。
                <button
                  onClick={fetchSummary}
                  className="ml-1 underline hover:no-underline"
                >
                  再試行
                </button>
              </p>
            ) : isSummarizing ? (
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 会話一覧（古い順） */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {threadMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.isOwn ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3',
                msg.isOwn
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    msg.isOwn ? 'text-blue-100' : 'text-slate-500'
                  )}
                >
                  {msg.isOwn ? 'あなた' : msg.from.name}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    msg.isOwn ? 'text-blue-200' : 'text-slate-400'
                  )}
                >
                  {msg.timestamp}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                {msg.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm message={message} onClose={onCloseReply} />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>↩ 返信</Button>
            <Button variant="secondary" onClick={onToggleReply}>
              🤖 AIで下書き
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function getUniqueThreadParticipants(messages: { from: { name: string } }[]): string {
  const names = new Set(messages.map((m) => m.from.name));
  return Array.from(names).join('、');
}

/**
 * 単一メッセージ表示（従来の表示形式）
 */
function SingleMessageDetail({
  message,
  showReply,
  onToggleReply,
  onCloseReply,
}: {
  message: UnifiedMessage;
  showReply: boolean;
  onToggleReply: () => void;
  onCloseReply: () => void;
}) {
  const hasThread = message.threadMessages && message.threadMessages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ChannelBadge channel={message.channel} />
          <StatusBadge status={message.status} />
          {message.metadata.slackChannelName && (
            <span className="text-xs text-slate-400">
              #{message.metadata.slackChannelName}
            </span>
          )}
          {message.metadata.chatworkRoomName && (
            <span className="text-xs text-slate-400">
              {message.metadata.chatworkRoomName}
            </span>
          )}
        </div>
        {message.subject && (
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            {message.subject}
          </h2>
        )}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-slate-900">
              {message.from.name}
            </span>
            <span className="text-sm text-slate-400 ml-2">
              {message.from.address}
            </span>
          </div>
          <span className="text-sm text-slate-400">
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>
      </div>

      {/* 本文 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </div>
      </div>

      {/* スレッド履歴（既存のthreadMessages） */}
      {hasThread && (
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="px-6 py-3 border-b border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              会話の履歴（{message.threadMessages!.length}件）
            </h3>
          </div>
          <div className="overflow-y-auto max-h-64 px-6 py-3 space-y-3">
            {message.threadMessages!.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.isOwn ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.isOwn
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        msg.isOwn ? 'text-blue-100' : 'text-slate-500'
                      )}
                    >
                      {msg.isOwn ? 'あなた' : msg.from.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px]',
                        msg.isOwn ? 'text-blue-200' : 'text-slate-400'
                      )}
                    >
                      {formatRelativeTime(msg.timestamp)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                    {msg.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* アクションバー */}
      <div className="p-4 border-t border-slate-200 bg-slate-50">
        {showReply ? (
          <ReplyForm
            message={message}
            onClose={onCloseReply}
          />
        ) : (
          <div className="flex gap-2">
            <Button onClick={onToggleReply}>
              ↩ 返信
            </Button>
            <Button variant="secondary" onClick={onToggleReply}>
              🤖 AIで下書き
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function getUniqueParticipants(messages: UnifiedMessage[]): string {
  const names = new Set(messages.map((m) => m.from.name));
  return Array.from(names).join('、');
}
