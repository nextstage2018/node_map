'use client';

import { useState, useCallback } from 'react';
import { UnifiedMessage, ThreadMessage, MessageGroup } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ConversationSummaryProps {
  /** MessageGroup (グループ表示時) */
  group?: MessageGroup | null;
  /** 単一メッセージのスレッド (email thread等) */
  message?: UnifiedMessage | null;
  /** ThreadMessage配列（threadMessagesから直接渡す場合） */
  threadMessages?: ThreadMessage[];
}

/**
 * 会話サマリーコンポーネント
 * スレッド内のメッセージ一覧の上部に要約セクションを表示
 * - 折りたたみ可能なサマリーパネル（デフォルト閉じ）
 * - 「要約を生成」ボタン -> AIでスレッド要約
 * - 要約テキスト表示
 * - 参加者リスト（アイコン表示）
 * - メッセージ数と期間の表示
 */
export default function ConversationSummary({
  group,
  message,
  threadMessages: directThreadMessages,
}: ConversationSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  // メッセージソースを統一（body含む完全版）
  const threadMsgs = resolveThreadMessages(group, message, directThreadMessages);
  const participants = getParticipants(threadMsgs);
  const messageCount = threadMsgs.length;
  const duration = getConversationDuration(threadMsgs);

  // メッセージが2件未満なら表示しない
  if (messageCount < 2) return null;

  // 要約生成
  const handleGenerateSummary = useCallback(async () => {
    if (isSummarizing) return;
    setIsSummarizing(true);
    setSummaryError(false);

    try {
      const subject = message?.subject || group?.groupLabel || '';
      const msgId = message?.id || group?.groupKey || '';

      const res = await fetch('/api/ai/thread-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msgId,
          subject,
          threadMessages: threadMsgs,
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
  }, [isSummarizing, threadMsgs, message, group]);

  return (
    <div className="mx-6 mt-3 mb-1">
      {/* ヘッダーバー（常に表示） */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">
            {isOpen ? '\u25BC' : '\u25B6'}
          </span>
          <span className="text-xs font-semibold text-slate-600">
            会話サマリー
          </span>
          <span className="text-[10px] text-slate-400">
            {messageCount}件 / {duration}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 参加者アイコン（最大5人表示） */}
          {participants.slice(0, 5).map((p, i) => (
            <span
              key={p.name}
              className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold text-white',
                AVATAR_COLORS[i % AVATAR_COLORS.length]
              )}
              title={p.name}
              style={{ marginLeft: i > 0 ? '-4px' : '0' }}
            >
              {p.name.charAt(0)}
            </span>
          ))}
          {participants.length > 5 && (
            <span className="text-[10px] text-slate-400 ml-1">
              +{participants.length - 5}
            </span>
          )}
        </div>
      </button>

      {/* 展開パネル */}
      {isOpen && (
        <div className="mt-1 border border-slate-200 rounded-lg bg-white overflow-hidden">
          {/* 要約セクション */}
          <div className="p-3">
            {summary ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 text-xs font-semibold">AI要約</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {summary}
                </p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isSummarizing}
                  className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline"
                >
                  {isSummarizing ? '再生成中...' : '再生成する'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateSummary}
                  disabled={isSummarizing}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    isSummarizing
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  )}
                >
                  {isSummarizing ? (
                    <>
                      <span className="animate-spin">&#10227;</span> 要約を生成中...
                    </>
                  ) : (
                    '要約を生成'
                  )}
                </button>
                {summaryError && (
                  <span className="text-[10px] text-red-500">
                    生成に失敗しました。再試行してください。
                  </span>
                )}
              </div>
            )}
          </div>

          {/* メタデータ情報 */}
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>
                参加者: {participants.map((p) => p.name).join('\u3001')}
              </span>
              <span>
                メッセージ数: {messageCount}件
              </span>
              <span>
                期間: {duration}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// アバターカラー
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-indigo-500',
];

// 参加者情報
interface Participant {
  name: string;
  address: string;
  messageCount: number;
}

/**
 * 各種ソースからThreadMessage[]に統一する
 * body含む完全なデータを返す
 */
function resolveThreadMessages(
  group?: MessageGroup | null,
  message?: UnifiedMessage | null,
  directThreadMessages?: ThreadMessage[]
): ThreadMessage[] {
  // 1. 直接指定されたThreadMessage配列（最優先）
  if (directThreadMessages && directThreadMessages.length > 0) {
    return directThreadMessages;
  }

  // 2. MessageGroup内のUnifiedMessage配列をThreadMessageに変換
  if (group && group.messages.length > 0) {
    return group.messages.map((m) => ({
      id: m.id,
      from: m.from,
      body: m.body,
      timestamp: m.timestamp,
      isOwn: m.from.name === 'あなた',
    }));
  }

  // 3. 単一メッセージのthreadMessages
  if (message?.threadMessages && message.threadMessages.length > 0) {
    return message.threadMessages;
  }

  return [];
}

/**
 * 参加者リストを取得
 */
function getParticipants(messages: ThreadMessage[]): Participant[] {
  const map = new Map<string, Participant>();
  for (const msg of messages) {
    const key = msg.from.address || msg.from.name;
    const existing = map.get(key);
    if (existing) {
      existing.messageCount++;
    } else {
      map.set(key, {
        name: msg.from.name,
        address: msg.from.address,
        messageCount: 1,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * 会話の期間を取得（例: 「3日間」「2時間」）
 */
function getConversationDuration(messages: ThreadMessage[]): string {
  if (messages.length < 2) return '-';

  const timestamps = messages
    .map((m) => new Date(m.timestamp).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return '-';

  const diffMs = timestamps[timestamps.length - 1] - timestamps[0];
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
