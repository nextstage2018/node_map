'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChannelType, MessageStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * フィルター状態の型定義
 */
export interface ConversationFilterState {
  dateFrom?: string;     // ISO日付文字列 (YYYY-MM-DD)
  dateTo?: string;       // ISO日付文字列 (YYYY-MM-DD)
  participant?: string;  // 参加者名（部分一致）
  keyword?: string;      // キーワード検索
  status?: MessageStatus | 'all'; // 未読/既読/返信済み/すべて
  channel?: ChannelType | 'all';  // チャネル種別
}

interface ConversationFilterProps {
  /** 現在のフィルター状態（外部管理） */
  filter: ConversationFilterState;
  /** フィルター変更コールバック */
  onFilterChange: (filter: ConversationFilterState) => void;
  /** フィルターパネルの表示/非表示 */
  isOpen: boolean;
  /** パネル表示切替 */
  onToggle: () => void;
}

/**
 * 会話検索・フィルタコンポーネント
 * MessageListの上部に詳細フィルタを追加:
 * - 日付範囲（from/to）
 * - 参加者名
 * - キーワード検索
 * - ステータス（未読/既読/返信済み）
 * - チャネル種別
 * フィルタ状態はURLクエリパラメータで管理
 */
export default function ConversationFilter({
  filter,
  onFilterChange,
  isOpen,
  onToggle,
}: ConversationFilterProps) {
  // ローカル入力状態（デバウンス用）
  const [localKeyword, setLocalKeyword] = useState(filter.keyword || '');
  const [localParticipant, setLocalParticipant] = useState(filter.participant || '');

  // デバウンスされたキーワード/参加者更新
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localKeyword !== (filter.keyword || '')) {
        onFilterChange({ ...filter, keyword: localKeyword || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localParticipant !== (filter.participant || '')) {
        onFilterChange({ ...filter, participant: localParticipant || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localParticipant]); // eslint-disable-line react-hooks/exhaustive-deps

  // フィルターがアクティブかどうか
  const activeCount = countActiveFilters(filter);

  // フィルターリセット
  const handleReset = useCallback(() => {
    setLocalKeyword('');
    setLocalParticipant('');
    onFilterChange({
      status: 'all',
      channel: filter.channel, // チャネルフィルタは既存のものを維持
    });
  }, [onFilterChange, filter.channel]);

  return (
    <div className="border-b border-slate-200">
      {/* フィルターヘッダー（常に表示） */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 transition-colors"
        >
          <svg
            className={cn(
              'w-3 h-3 transition-transform',
              isOpen && 'rotate-90'
            )}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 2l4 4-4 4" />
          </svg>
          <span className="font-medium">詳細フィルタ</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
          >
            リセット
          </button>
        )}
      </div>

      {/* フィルターパネル */}
      {isOpen && (
        <div className="px-3 py-3 bg-white border-t border-slate-100 space-y-3">
          {/* キーワード検索 */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1">
              キーワード検索
            </label>
            <input
              type="text"
              value={localKeyword}
              onChange={(e) => setLocalKeyword(e.target.value)}
              placeholder="メッセージ内容を検索..."
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 参加者名 */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1">
              参加者名
            </label>
            <input
              type="text"
              value={localParticipant}
              onChange={(e) => setLocalParticipant(e.target.value)}
              placeholder="名前で検索..."
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 日付範囲 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 font-medium mb-1">
                開始日
              </label>
              <input
                type="date"
                value={filter.dateFrom || ''}
                onChange={(e) =>
                  onFilterChange({ ...filter, dateFrom: e.target.value || undefined })
                }
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 font-medium mb-1">
                終了日
              </label>
              <input
                type="date"
                value={filter.dateTo || ''}
                onChange={(e) =>
                  onFilterChange({ ...filter, dateTo: e.target.value || undefined })
                }
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1">
              ステータス
            </label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    onFilterChange({
                      ...filter,
                      status: opt.value as MessageStatus | 'all',
                    })
                  }
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                    (filter.status || 'all') === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* チャネル種別 */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1">
              チャネル
            </label>
            <div className="flex gap-1 flex-wrap">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    onFilterChange({
                      ...filter,
                      channel: opt.value as ChannelType | 'all',
                    })
                  }
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                    (filter.channel || 'all') === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== フィルタ適用ロジック（外部から利用可能） =====

/**
 * MessageGroupにフィルタを適用する
 */
export function applyConversationFilter<T extends {
  latestMessage: {
    from: { name: string };
    body: string;
    subject?: string;
    timestamp: string;
    status: MessageStatus;
    channel: ChannelType;
    isRead: boolean;
  };
  messages: Array<{
    from: { name: string };
    body: string;
    timestamp: string;
    isRead: boolean;
  }>;
  channel: ChannelType;
}>(groups: T[], filter: ConversationFilterState): T[] {
  return groups.filter((group) => {
    // チャネルフィルタ
    if (filter.channel && filter.channel !== 'all' && group.channel !== filter.channel) {
      return false;
    }

    // ステータスフィルタ
    if (filter.status && filter.status !== 'all') {
      const latestStatus = filter.status;
      if (latestStatus === 'unread' && group.latestMessage.isRead) return false;
      if (latestStatus === 'read' && !group.latestMessage.isRead) return false;
      if (latestStatus === 'replied' && group.latestMessage.status !== 'replied') return false;
    }

    // 日付範囲フィルタ
    if (filter.dateFrom) {
      const from = new Date(filter.dateFrom).getTime();
      const latest = new Date(group.latestMessage.timestamp).getTime();
      if (!isNaN(from) && !isNaN(latest) && latest < from) return false;
    }
    if (filter.dateTo) {
      const to = new Date(filter.dateTo).getTime() + 86400000; // 終了日の翌日
      const earliest = group.messages.length > 0
        ? new Date(group.messages[0].timestamp).getTime()
        : new Date(group.latestMessage.timestamp).getTime();
      if (!isNaN(to) && !isNaN(earliest) && earliest >= to) return false;
    }

    // 参加者フィルタ
    if (filter.participant) {
      const query = filter.participant.toLowerCase();
      const hasParticipant = group.messages.some(
        (m) => m.from.name.toLowerCase().includes(query)
      );
      if (!hasParticipant) return false;
    }

    // キーワードフィルタ
    if (filter.keyword) {
      const query = filter.keyword.toLowerCase();
      const hasKeyword = group.messages.some(
        (m) => m.body.toLowerCase().includes(query) || m.from.name.toLowerCase().includes(query)
      ) || (group.latestMessage.subject?.toLowerCase().includes(query));
      if (!hasKeyword) return false;
    }

    return true;
  });
}

// ===== URLクエリパラメータ同期フック =====

/**
 * ConversationFilterStateをURLクエリパラメータと同期するフック
 */
export function useConversationFilterParams(): {
  filter: ConversationFilterState;
  setFilter: (f: ConversationFilterState) => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URLからフィルタ状態を読み取り
  const filter: ConversationFilterState = {
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
    participant: searchParams.get('participant') || undefined,
    keyword: searchParams.get('keyword') || undefined,
    status: (searchParams.get('status') as MessageStatus | 'all') || 'all',
    channel: (searchParams.get('channel') as ChannelType | 'all') || 'all',
  };

  // フィルタ変更時にURLを更新
  const setFilter = useCallback(
    (newFilter: ConversationFilterState) => {
      const params = new URLSearchParams();
      if (newFilter.dateFrom) params.set('dateFrom', newFilter.dateFrom);
      if (newFilter.dateTo) params.set('dateTo', newFilter.dateTo);
      if (newFilter.participant) params.set('participant', newFilter.participant);
      if (newFilter.keyword) params.set('keyword', newFilter.keyword);
      if (newFilter.status && newFilter.status !== 'all') params.set('status', newFilter.status);
      if (newFilter.channel && newFilter.channel !== 'all') params.set('channel', newFilter.channel);

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router]
  );

  return { filter, setFilter };
}

// ===== 定数 =====

const STATUS_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'unread', label: '未読' },
  { value: 'read', label: '既読' },
  { value: 'replied', label: '返信済み' },
];

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'email', label: 'Gmail' },
  { value: 'slack', label: 'Slack' },
  { value: 'chatwork', label: 'Chatwork' },
];

/**
 * アクティブなフィルタ数をカウント
 */
function countActiveFilters(filter: ConversationFilterState): number {
  let count = 0;
  if (filter.dateFrom) count++;
  if (filter.dateTo) count++;
  if (filter.participant) count++;
  if (filter.keyword) count++;
  if (filter.status && filter.status !== 'all') count++;
  // channelは既存フィルタとして常に存在するのでカウントしない
  return count;
}
